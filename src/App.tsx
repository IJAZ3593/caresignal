import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Activity,
  CalendarDays,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Package,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { api, type DashboardPayload } from './lib/api';
import { auth } from './lib/firebase';
import {
  ensureUserProfile,
  saveAppointmentReceiptToFirestore,
  subscribeSavedAppointments,
  subscribeSavedPlaces,
  type SavedAppointmentReceiptRecord,
  type SavedPlaceRecord,
} from './lib/firestoreSync';
import type {
  AppointmentSlot,
  AssistantStatusInfo,
  AuthUser,
  ClinicSettings,
  MedicineWithPrediction,
  ModelStatusInfo,
} from './lib/types';
import { AuthModal } from './components/AuthModal';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { AppointmentsView } from './components/AppointmentsView';
import { ClinicLocatorView } from './components/ClinicLocatorView';
import { SettingsView } from './components/SettingsView';
import { MedicineDetailDrawer } from './components/MedicineDetailDrawer';
import { MedicineFormModal } from './components/MedicineFormModal';

type NavTab = 'dashboard' | 'inventory' | 'appointments' | 'locator' | 'settings';
type ThemeMode = 'light' | 'dark';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'appointments', label: 'Appointments', icon: CalendarDays },
  { id: 'locator', label: 'Clinic Locator', icon: MapPin },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const DEFAULT_CLINIC_FALLBACK: ClinicSettings = {
  clinicName: 'Oakridge Community Clinic (Demo)',
  phone: '(555) 014-8820',
  email: 'scheduling@oakridgeclinic.demo',
  address: '412 Oakridge Ave, Suite B, Springfield',
  hours: 'Mon-Fri 8:00 AM - 6:00 PM',
  requireStaffAuthForEdits: false,
};

function getInitialTheme(): ThemeMode {
  try {
    return localStorage.getItem('caresignal-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaceRecord[]>([]);
  const [savedReceipts, setSavedReceipts] = useState<SavedAppointmentReceiptRecord[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [medicines, setMedicines] = useState<MedicineWithPrediction[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatusInfo | null>(null);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatusInfo>({
    openAiConfigured: false,
    mode: 'deterministic_fallback',
    modelName: null,
  });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inspectedMedicine, setInspectedMedicine] =
    useState<MedicineWithPrediction | null>(null);
  const [medFormOpen, setMedFormOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] =
    useState<MedicineWithPrediction | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('caresignal-theme', theme);
    } catch {
      // Ignore storage failures
    }
  }, [theme]);

  useEffect(() => {
    function handleQuotaExceeded() {
      setMapsQuotaExceeded(true);
    }
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  useEffect(() => {
    let unsubPlaces: (() => void) | null = null;
    let unsubAppointments: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (nextUser) => {
      if (unsubPlaces) {
        unsubPlaces();
        unsubPlaces = null;
      }
      if (unsubAppointments) {
        unsubAppointments();
        unsubAppointments = null;
      }

      setFirebaseUser(nextUser);

      if (nextUser && nextUser.emailVerified) {
        void ensureUserProfile(nextUser).catch(() => {
          // Non-fatal profile sync error handled via Firebase diagnostics
        });
        unsubPlaces = subscribeSavedPlaces(nextUser.uid, setSavedPlaces);
        unsubAppointments = subscribeSavedAppointments(nextUser.uid, setSavedReceipts);
      } else {
        setSavedPlaces([]);
        setSavedReceipts([]);
      }
    });

    return () => {
      unsubAuth();
      if (unsubPlaces) unsubPlaces();
      if (unsubAppointments) unsubAppointments();
    };
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [meRes, dashRes, apptRes] = await Promise.all([
        api.getMe(),
        api.getDashboard(),
        api.getAppointments(),
      ]);
      setUser(meRes.user);
      setDashboard(dashRes);
      setMedicines(dashRes.medicines);
      setModelStatus(dashRes.modelStatus);
      setClinicSettings(dashRes.settings);
      setAssistantStatus(dashRes.assistantStatus);
      setSlots(apptRes.slots);

      setInspectedMedicine((prev) =>
        prev ? dashRes.medicines.find((m) => m.id === prev.id) ?? null : null
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load CareSignal data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  async function handleLogout() {
    await Promise.allSettled([
      api.logout(),
      firebaseUser ? signOut(auth) : Promise.resolve(),
    ]);
    setUser(null);
    setFirebaseUser(null);
  }

  async function handleSaveMedicine(payload: {
    name: string;
    genericName: string;
    category: string;
    unit: string;
    currentStock: number;
    reorderThreshold: number;
    supplierLeadTimeDays: number;
    estimatedDailyUsage: number;
  }) {
    if (editingMedicine) {
      await api.updateMedicine(editingMedicine.id, payload);
    } else {
      await api.createMedicine(payload);
    }
    await refreshAll();
  }

  async function handleAdjustStock(medicineId: string, delta: number, reason: string) {
    await api.adjustStock(medicineId, { delta, reason });
    await refreshAll();
  }

  async function handleDeleteMedicine(medicineId: string) {
    await api.deleteMedicine(medicineId);
    await refreshAll();
  }

  async function handleSaveSettings(next: ClinicSettings) {
    await api.updateSettings(next);
    await refreshAll();
  }

  async function handleResetDemo() {
    await api.resetDemo();
    await refreshAll();
  }

  const currentHeading =
    activeTab === 'dashboard'
      ? 'Clinic Dashboard'
      : activeTab === 'inventory'
        ? 'Medicine Inventory'
        : activeTab === 'appointments'
          ? 'Appointments & Assistant'
          : activeTab === 'locator'
            ? 'Clinic & Pharmacy Locator'
            : 'Clinic Settings';

  const activeAccountName =
    firebaseUser?.displayName || firebaseUser?.email || user?.name || null;
  const activeAccountRole = firebaseUser
    ? user
      ? `${user.role} · Google Sync`
      : 'Google Cloud Workspace'
    : user?.role ?? null;

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {mapsQuotaExceeded && (
        <div
          role="alert"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
        >
          Google Maps Platform demo quota reached or key unavailable. Switch to your own Google Cloud project API key to continue using Maps features —{' '}
          <a
            href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:text-amber-950"
          >
            learn how to resolve quota errors
          </a>
          .
        </div>
      )}

      <div className="flex flex-1 flex-col md:flex-row min-w-0">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <Activity className="h-5 w-5 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              CareSignal
            </span>
          </div>

          <nav aria-label="Primary navigation" className="flex-1 space-y-1 p-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'text-teal-900 dark:text-teal-200'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="desktop-nav-active-bg"
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 rounded-lg bg-teal-50 dark:bg-teal-950/70"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    className={`relative z-10 h-4 w-4 shrink-0 ${
                      active ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400">
            <p className="font-medium text-slate-700 dark:text-slate-200">
              {clinicSettings?.clinicName ?? 'Oakridge Community Clinic (Demo)'}
            </p>
            <p className="mt-1">Operations &amp; scheduling prototype. Non-diagnostic.</p>
          </div>
        </aside>

        {/* Main Column */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Top Bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen((prev) => !prev)}
                aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
              >
                {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
              <h1 className="truncate font-display text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">
                {currentHeading}
              </h1>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                    <span className="hidden sm:inline">Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                    <span className="hidden sm:inline">Dark</span>
                  </>
                )}
              </motion.button>

              {activeAccountName ? (
                <div className="flex items-center gap-3">
                  <div className="hidden text-right sm:block">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{activeAccountName}</p>
                    {activeAccountRole && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{activeAccountRole}</p>
                    )}
                  </div>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Sign out</span>
                  </motion.button>
                </div>
              ) : (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setAuthModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
                >
                  <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sign in / Sign up</span>
                </motion.button>
              )}
            </div>
          </header>

          {/* Mobile Nav Drawer */}
          <AnimatePresence>
            {mobileNavOpen && (
              <motion.nav
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                aria-label="Mobile navigation"
                className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 md:hidden"
              >
                <div className="grid grid-cols-2 gap-1.5">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileNavOpen(false);
                        }}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                          active
                            ? 'bg-teal-50 dark:bg-teal-950/70 text-teal-900 dark:text-teal-200'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.nav>
            )}
          </AnimatePresence>

          {/* Viewport Content */}
          <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeTab === 'dashboard' && (
                  <DashboardView
                    data={dashboard}
                    loading={loading}
                    error={loadError}
                    onRetry={() => void refreshAll()}
                    onSelectMedicine={(med) => setInspectedMedicine(med)}
                    onNavigate={(tab) => setActiveTab(tab)}
                  />
                )}

                {activeTab === 'inventory' && (
                  <InventoryView
                    medicines={medicines}
                    modelStatus={modelStatus}
                    loading={loading}
                    error={loadError}
                    onAddNew={() => {
                      setEditingMedicine(null);
                      setMedFormOpen(true);
                    }}
                    onEdit={(med) => {
                      setEditingMedicine(med);
                      setMedFormOpen(true);
                    }}
                    onInspect={(med) => setInspectedMedicine(med)}
                    onQuickAdjust={handleAdjustStock}
                    onDelete={handleDeleteMedicine}
                  />
                )}

                {activeTab === 'appointments' && (
                  <AppointmentsView
                    slots={slots}
                    clinic={clinicSettings ?? DEFAULT_CLINIC_FALLBACK}
                    assistantStatus={assistantStatus}
                    loading={loading}
                    error={loadError}
                    savedReceipts={savedReceipts}
                    onBookingSaved={async (receipt) => {
                      if (firebaseUser?.emailVerified) {
                        await saveAppointmentReceiptToFirestore(firebaseUser.uid, receipt);
                      }
                    }}
                    onRefresh={refreshAll}
                  />
                )}

                {activeTab === 'locator' && (
                  <ClinicLocatorView
                    clinic={clinicSettings ?? DEFAULT_CLINIC_FALLBACK}
                    theme={theme}
                    firebaseUser={firebaseUser}
                    savedPlaces={savedPlaces}
                    onOpenAuth={() => setAuthModalOpen(true)}
                  />
                )}

                {activeTab === 'settings' && clinicSettings && modelStatus && (
                  <SettingsView
                    settings={clinicSettings}
                    modelStatus={modelStatus}
                    assistantStatus={assistantStatus}
                    theme={theme}
                    onThemeChange={setTheme}
                    onSaveSettings={handleSaveSettings}
                    onResetDemo={handleResetDemo}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>

          <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <span>CareSignal Clinic Operations Prototype · Fictional demo records only</span>
              <span>Privacy: Minimize personal data; non-diagnostic scheduling assistant</span>
            </div>
          </footer>
        </div>
      </div>

      {/* Drawers & Modals */}
      <MedicineDetailDrawer
        medicine={inspectedMedicine}
        onClose={() => setInspectedMedicine(null)}
        onAdjustStock={handleAdjustStock}
      />

      <MedicineFormModal
        open={medFormOpen}
        editingMedicine={editingMedicine}
        onClose={() => {
          setMedFormOpen(false);
          setEditingMedicine(null);
        }}
        onSave={handleSaveMedicine}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(signedInUser) => setUser(signedInUser)}
        onFirebaseSuccess={(nextFbUser) => setFirebaseUser(nextFbUser)}
      />
    </div>
    </MotionConfig>
  );
}
