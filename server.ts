import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  clearSessionCookie,
  getSessionUserId,
  hashPassword,
  setSessionCookie,
  validateSignupInput,
  verifyPassword,
} from './server/auth';
import { getAssistantStatus, runAppointmentAssistant } from './server/aiAssistant';
import {
  attachLiveVoiceServer,
  GeminiHttpError,
  isGeminiConfigured,
  queryMapsGrounding,
} from './server/gemini';
import { getModelStatus, scoreMedicines } from './server/mlBridge';
import { loadDatabase, resetSeedDatabase, saveDatabase } from './server/store';
import {
  APPOINTMENT_TYPES,
  maskContact,
  validateBookingInput,
} from './src/lib/appointments';
import { addDaysIso, validateMedicineInput } from './src/lib/stockout';
import type { AppointmentSlot, AppointmentType, AuthUser, MedicineRecord } from './src/lib/types';

const PORT = Number(process.env.PORT) || 3000;

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  role: AuthUser['role'];
  createdAt: string;
}): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function getAuthenticatedUser(req: Request): AuthUser | null {
  const userId = getSessionUserId(req);
  if (!userId) return null;
  const db = loadDatabase();
  const found = db.users.find((u) => u.id === userId);
  return found ? toPublicUser(found) : null;
}

function requireStaffIfEnabled(req: Request, res: Response, next: NextFunction): void {
  const db = loadDatabase();
  if (!db.settings.requireStaffAuthForEdits) {
    next();
    return;
  }
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({
      error: 'Staff sign-in is required for inventory and schedule edits (configured in Settings).',
    });
    return;
  }
  next();
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Ensure initial DB exists on boot
  loadDatabase();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'caresignal' });
  });

  // --- Auth endpoints ---
  app.get('/api/auth/me', (req, res) => {
    const user = getAuthenticatedUser(req);
    res.json({ user });
  });

  app.post('/api/auth/signup', (req, res) => {
    const validated = validateSignupInput(req.body ?? {});
    if (!validated.valid) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const db = loadDatabase();
    const existing = db.users.find((u) => u.email === validated.data.email);
    if (existing) {
      res.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }

    const newUser = {
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      name: validated.data.name,
      email: validated.data.email,
      role: validated.data.role,
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(validated.data.password),
    };

    db.users.push(newUser);
    saveDatabase(db);
    setSessionCookie(res, newUser.id);
    res.status(201).json({ user: toPublicUser(newUser) });
  });

  app.post('/api/auth/login', (req, res) => {
    const email =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const db = loadDatabase();
    const found = db.users.find((u) => u.email === email);
    if (!found || !verifyPassword(password, found.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    setSessionCookie(res, found.id);
    res.json({ user: toPublicUser(found) });
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // --- Dashboard summary ---
  app.get('/api/dashboard', async (_req, res) => {
    const db = loadDatabase();
    const { items: medicines, modelStatus } = await scoreMedicines(db.medicines);
    const highRiskCount = medicines.filter((m) => m.prediction.riskLevel === 'high').length;
    const moderateRiskCount = medicines.filter(
      (m) => m.prediction.riskLevel === 'moderate'
    ).length;

    const upcomingBooked = db.appointmentSlots
      .filter((s) => s.status === 'booked')
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

    const openSlotsCount = db.appointmentSlots.filter((s) => s.status === 'open').length;

    res.json({
      summary: {
        medicinesTracked: medicines.length,
        highRiskCount,
        moderateRiskCount,
        upcomingAppointmentsCount: upcomingBooked.length,
        openSlotsCount,
      },
      medicines,
      recentLogs: db.inventoryLogs.slice(0, 12),
      upcomingAppointments: upcomingBooked.slice(0, 8),
      modelStatus,
      assistantStatus: getAssistantStatus(),
      settings: db.settings,
    });
  });

  // --- Inventory endpoints ---
  app.get('/api/inventory', async (_req, res) => {
    const db = loadDatabase();
    const { items, modelStatus } = await scoreMedicines(db.medicines);
    res.json({ items, logs: db.inventoryLogs.slice(0, 25), modelStatus });
  });

  app.post('/api/inventory', requireStaffIfEnabled, async (req, res) => {
    const validated = validateMedicineInput(req.body ?? {});
    if (!validated.valid) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const db = loadDatabase();
    const actor = getAuthenticatedUser(req);
    const todayIso = new Date().toISOString().slice(0, 10);
    const dailyBase = validated.data.estimatedDailyUsage ?? 6;
    const startDate = addDaysIso(todayIso, -13);

    const history = Array.from({ length: 14 }, (_, idx) => {
      const wave = idx % 7 >= 5 ? 0.7 : 1.05;
      return {
        date: addDaysIso(startDate, idx),
        unitsUsed: Math.max(0, Math.round(dailyBase * wave)),
      };
    });

    const newMedicine: MedicineRecord = {
      id: `med-${crypto.randomUUID().slice(0, 8)}`,
      name: validated.data.name,
      genericName: validated.data.genericName,
      category: validated.data.category,
      unit: validated.data.unit,
      currentStock: validated.data.currentStock,
      reorderThreshold: validated.data.reorderThreshold,
      supplierLeadTimeDays: validated.data.supplierLeadTimeDays,
      dailyUsageHistory: history,
      updatedAt: new Date().toISOString(),
    };

    db.medicines.unshift(newMedicine);
    db.inventoryLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      medicineId: newMedicine.id,
      medicineName: newMedicine.name,
      changeDelta: newMedicine.currentStock,
      previousStock: 0,
      newStock: newMedicine.currentStock,
      reason: 'Initial inventory record created',
      actorName: actor ? `${actor.name} (${actor.role})` : 'Demo Clinic Staff',
      createdAt: new Date().toISOString(),
    });
    saveDatabase(db);

    const { items } = await scoreMedicines([newMedicine]);
    res.status(201).json({ item: items[0] });
  });

  app.put('/api/inventory/:id', requireStaffIfEnabled, async (req, res) => {
    const validated = validateMedicineInput(req.body ?? {});
    if (!validated.valid) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const db = loadDatabase();
    const idx = db.medicines.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Medicine record not found.' });
      return;
    }

    const prev = db.medicines[idx];
    const actor = getAuthenticatedUser(req);
    const updated: MedicineRecord = {
      ...prev,
      name: validated.data.name,
      genericName: validated.data.genericName,
      category: validated.data.category,
      unit: validated.data.unit,
      currentStock: validated.data.currentStock,
      reorderThreshold: validated.data.reorderThreshold,
      supplierLeadTimeDays: validated.data.supplierLeadTimeDays,
      updatedAt: new Date().toISOString(),
    };

    db.medicines[idx] = updated;
    if (prev.currentStock !== updated.currentStock) {
      db.inventoryLogs.unshift({
        id: `log-${crypto.randomUUID().slice(0, 8)}`,
        medicineId: updated.id,
        medicineName: updated.name,
        changeDelta: updated.currentStock - prev.currentStock,
        previousStock: prev.currentStock,
        newStock: updated.currentStock,
        reason: 'Inventory record edited',
        actorName: actor ? `${actor.name} (${actor.role})` : 'Demo Clinic Staff',
        createdAt: new Date().toISOString(),
      });
    }

    saveDatabase(db);
    const { items } = await scoreMedicines([updated]);
    res.json({ item: items[0] });
  });

  app.post('/api/inventory/:id/adjust', requireStaffIfEnabled, async (req, res) => {
    const delta = Number(req.body?.delta);
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim().slice(0, 120)
        : 'Manual stock adjustment';

    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 50000) {
      res.status(400).json({ error: 'Stock adjustment delta must be a non-zero number.' });
      return;
    }

    const db = loadDatabase();
    const idx = db.medicines.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Medicine record not found.' });
      return;
    }

    const prev = db.medicines[idx];
    const nextStock = Math.max(0, Math.round(prev.currentStock + delta));
    const actualDelta = nextStock - prev.currentStock;
    const actor = getAuthenticatedUser(req);
    const todayIso = new Date().toISOString().slice(0, 10);

    const history = [...prev.dailyUsageHistory];
    if (actualDelta < 0 && history.length > 0) {
      const last = history[history.length - 1];
      if (last.date === todayIso) {
        history[history.length - 1] = {
          ...last,
          unitsUsed: last.unitsUsed + Math.abs(actualDelta),
        };
      } else {
        history.push({ date: todayIso, unitsUsed: Math.abs(actualDelta) });
      }
    }

    const updated: MedicineRecord = {
      ...prev,
      currentStock: nextStock,
      dailyUsageHistory: history.slice(-14),
      updatedAt: new Date().toISOString(),
    };

    db.medicines[idx] = updated;
    db.inventoryLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      medicineId: updated.id,
      medicineName: updated.name,
      changeDelta: actualDelta,
      previousStock: prev.currentStock,
      newStock: nextStock,
      reason,
      actorName: actor ? `${actor.name} (${actor.role})` : 'Demo Clinic Staff',
      createdAt: new Date().toISOString(),
    });
    saveDatabase(db);

    const { items } = await scoreMedicines([updated]);
    res.json({ item: items[0] });
  });

  app.delete('/api/inventory/:id', requireStaffIfEnabled, (req, res) => {
    const db = loadDatabase();
    const idx = db.medicines.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Medicine record not found.' });
      return;
    }

    const [removed] = db.medicines.splice(idx, 1);
    const actor = getAuthenticatedUser(req);
    db.inventoryLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      medicineId: removed.id,
      medicineName: removed.name,
      changeDelta: -removed.currentStock,
      previousStock: removed.currentStock,
      newStock: 0,
      reason: 'Medicine record removed from catalog',
      actorName: actor ? `${actor.name} (${actor.role})` : 'Demo Clinic Staff',
      createdAt: new Date().toISOString(),
    });
    saveDatabase(db);
    res.json({ ok: true, removedId: removed.id });
  });

  // --- Appointments & Slots ---
  app.get('/api/appointments', (_req, res) => {
    const db = loadDatabase();
    const sorted = [...db.appointmentSlots].sort((a, b) =>
      `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
    );
    res.json({
      slots: sorted,
      appointmentTypes: APPOINTMENT_TYPES,
      clinic: db.settings,
      assistantStatus: getAssistantStatus(),
    });
  });

  app.post('/api/appointments/slots', requireStaffIfEnabled, (req, res) => {
    const date = typeof req.body?.date === 'string' ? req.body.date.trim() : '';
    const time = typeof req.body?.time === 'string' ? req.body.time.trim() : '';
    const clinicianLabel =
      typeof req.body?.clinicianLabel === 'string' ? req.body.clinicianLabel.trim() : '';
    const rawTypes = Array.isArray(req.body?.allowedTypes) ? req.body.allowedTypes : [];
    const allowedTypes = rawTypes.filter((t: unknown): t is AppointmentType =>
      APPOINTMENT_TYPES.includes(t as AppointmentType)
    );

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      res.status(400).json({ error: 'Time must be in HH:MM format.' });
      return;
    }
    if (clinicianLabel.length < 2 || clinicianLabel.length > 60) {
      res.status(400).json({ error: 'Clinician label is required (2–60 chars).' });
      return;
    }
    if (allowedTypes.length === 0) {
      res.status(400).json({ error: 'Select at least one allowed non-diagnostic visit type.' });
      return;
    }

    const db = loadDatabase();
    const slot: AppointmentSlot = {
      id: `slot-${crypto.randomUUID().slice(0, 8)}`,
      date,
      time,
      clinicianLabel,
      allowedTypes,
      status: 'open',
    };

    db.appointmentSlots.push(slot);
    saveDatabase(db);
    res.status(201).json({ slot });
  });

  app.delete('/api/appointments/slots/:id', requireStaffIfEnabled, (req, res) => {
    const db = loadDatabase();
    const idx = db.appointmentSlots.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Appointment slot not found.' });
      return;
    }
    const [removed] = db.appointmentSlots.splice(idx, 1);
    saveDatabase(db);
    res.json({ ok: true, removedId: removed.id });
  });

  app.post('/api/appointments/book', (req, res) => {
    const validated = validateBookingInput(req.body ?? {});
    if (!validated.valid) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const db = loadDatabase();
    const slotIdx = db.appointmentSlots.findIndex((s) => s.id === validated.data.slotId);
    if (slotIdx === -1) {
      res.status(404).json({ error: 'Selected appointment slot no longer exists.' });
      return;
    }

    const slot = db.appointmentSlots[slotIdx];
    if (slot.status !== 'open') {
      res.status(409).json({
        error: 'That appointment slot was just booked. Please select another open slot.',
      });
      return;
    }

    if (!slot.allowedTypes.includes(validated.data.appointmentType)) {
      res.status(400).json({
        error: `Selected slot does not support ${validated.data.appointmentType}.`,
      });
      return;
    }

    const bookingId = `BK-${crypto.randomInt(1000, 9999)}`;
    const updatedSlot: AppointmentSlot = {
      ...slot,
      status: 'booked',
      booking: {
        bookingId,
        patientDisplayName: validated.data.patientName,
        contactMasked: maskContact(validated.data.contact),
        appointmentType: validated.data.appointmentType,
        bookedAt: new Date().toISOString(),
      },
    };

    db.appointmentSlots[slotIdx] = updatedSlot;
    saveDatabase(db);
    res.status(201).json({ slot: updatedSlot, bookingId });
  });

  // --- Patient Appointment Assistant ---
  app.get('/api/assistant/status', (_req, res) => {
    res.json(getAssistantStatus());
  });

  app.post('/api/assistant/chat', async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message : '';
    const context =
      req.body?.context && typeof req.body.context === 'object' ? req.body.context : undefined;
    const db = loadDatabase();

    const responsePayload = await runAppointmentAssistant({
      message,
      allSlots: db.appointmentSlots,
      clinic: db.settings,
      context,
    });

    res.json(responsePayload);
  });

  // --- Google Maps JS key fallback & Gemini Maps Grounding ---
  app.get('/api/maps/config', (_req, res) => {
    const rawKey = (
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      ''
    ).trim();
    const isPlaceholder =
      !rawKey || rawKey === 'MY_GOOGLE_MAPS_API_KEY' || rawKey.startsWith('REPLACE_');
    res.json({
      apiKeyConfigured: !isPlaceholder,
      apiKey: isPlaceholder ? '' : rawKey,
    });
  });

  app.get('/api/gemini/status', (_req, res) => {
    res.json({ configured: isGeminiConfigured() });
  });

  app.post('/api/maps/grounding', async (req, res) => {
    const queryText = typeof req.body?.query === 'string' ? req.body.query : '';
    const lat = typeof req.body?.lat === 'number' ? req.body.lat : undefined;
    const lng = typeof req.body?.lng === 'number' ? req.body.lng : undefined;

    try {
      const result = await queryMapsGrounding({ query: queryText, lat, lng });
      res.json(result);
    } catch (err) {
      if (err instanceof GeminiHttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to query Google Maps grounding.',
      });
    }
  });

  // --- Settings & Demo Reset ---
  app.get('/api/settings', async (_req, res) => {
    const db = loadDatabase();
    res.json({
      settings: db.settings,
      modelStatus: await getModelStatus(),
      assistantStatus: getAssistantStatus(),
    });
  });

  app.put('/api/settings', requireStaffIfEnabled, (req, res) => {
    const db = loadDatabase();
    const nextClinicName =
      typeof req.body?.clinicName === 'string' ? req.body.clinicName.trim() : db.settings.clinicName;
    const nextPhone =
      typeof req.body?.phone === 'string' ? req.body.phone.trim() : db.settings.phone;
    const nextEmail =
      typeof req.body?.email === 'string' ? req.body.email.trim() : db.settings.email;
    const nextAddress =
      typeof req.body?.address === 'string' ? req.body.address.trim() : db.settings.address;
    const nextHours =
      typeof req.body?.hours === 'string' ? req.body.hours.trim() : db.settings.hours;
    const requireAuth =
      typeof req.body?.requireStaffAuthForEdits === 'boolean'
        ? req.body.requireStaffAuthForEdits
        : db.settings.requireStaffAuthForEdits;

    if (nextClinicName.length < 2 || nextPhone.length < 5) {
      res.status(400).json({ error: 'Clinic name and contact phone are required.' });
      return;
    }

    db.settings = {
      clinicName: nextClinicName.slice(0, 80),
      phone: nextPhone.slice(0, 40),
      email: nextEmail.slice(0, 80),
      address: nextAddress.slice(0, 120),
      hours: nextHours.slice(0, 80),
      requireStaffAuthForEdits: requireAuth,
    };
    saveDatabase(db);
    res.json({ settings: db.settings });
  });

  app.post('/api/demo/reset', requireStaffIfEnabled, (_req, res) => {
    const db = resetSeedDatabase();
    res.json({ ok: true, medicinesCount: db.medicines.length });
  });

  // --- Vite Dev Middleware / Production Static Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const httpServer = http.createServer(app);
  attachLiveVoiceServer(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`CareSignal server listening on http://localhost:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start CareSignal server:', err);
  process.exit(1);
});
