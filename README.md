# CareSignal — Small-Clinic Stockout Forecasting & Appointment Assistant

CareSignal is a responsive healthcare operations prototype for small clinics. It combines **medicine stockout forecasting** (using a project-owned Python `scikit-learn` regression pipeline with a transparent rule-based fallback) and a **non-diagnostic patient appointment assistant** powered by a server-side OpenAI integration (with deterministic fallback).

> **Prototype Disclaimer:** All seeded records in CareSignal are fictional demo data. Do not enter real patient health records. Stockout forecasts are operational estimates for staff review only, and the appointment assistant never diagnoses, recommends treatment, or triages emergencies.

---

## Features

- **Clinic Dashboard (`Dashboard`)**: Summary cards for medicines tracked, high stockout risks, and upcoming appointments; risk-sorted inventory table; recent inventory update log; and upcoming booked appointments.
- **Inventory Management (`Inventory`)**: Search and risk-level filters, medicine detail drawer with 14-day usage bar chart and prediction factors, quick stock adjustments (`-10`, `+50`, or custom dispense/restock with reason), and full add/edit/delete record controls.
- **Appointments, Patient Assistant & Live Voice (`Appointments`)**:
  - **Patient Appointment Assistant**: Guides patients through non-diagnostic visit types (`Routine Visit`, `Follow-up`, `Vaccination`, `Lab Check-in`, `Medication Refill Review`), date/time preferences, real app-supplied open slot selection, minimal contact booking confirmation, and clinic staff escalation / safety boundaries for clinical or emergency queries.
  - **Live Voice Scheduling Helper**: Optional WebSocket (`ws`) audio stream bridged server-side to Gemini Live (`gemini-3.8-live`) for hands-free scheduling navigation (16 kHz PCM capture / 24 kHz playback, strictly non-diagnostic).
  - **Staff Schedule & Slots**: Add open appointment slots and review/remove scheduled slots (patient contact details are masked in staff views).
- **Clinic & Pharmacy Locator (`Clinic Locator`)**:
  - Interactive Google Map (`@vis.gl/react-google-maps`) with Places API (New) nearby & text search for clinics and pharmacies.
  - Server-side **Gemini Maps Grounding** (`gemini-4-hydrogen` with Google Maps tool) returning grounded place links and review snippets.
  - **Firebase Cloud Workspace Sync**: Google Sign-In (`firebase/auth`) with Firestore persistence for saved clinic/pharmacy bookmarks and non-clinical booking receipts.
- **Staff Authentication & Settings (`Settings` + `Sign in / Sign up`)**:
  - Local staff sign-up and sign-in (`clinic.staff@caresignal.demo` / `CareSignal2026!` demo account) plus Google Sign-In for cloud bookmarks/receipts.
  - Clinic contact settings, light/dark theme toggle, runtime status for the ML model and AI keys, and a demo seed reset button.

---

## Environment Variables

Copy `.env.example` to `.env` (never commit real secrets):

- `GEMINI_API_KEY` *(required for Maps Grounding & Live Voice)* — Server-side Gemini API key used by `/api/maps/grounding` and `/api/live-voice`. Never exposed to browser code.
- `VITE_GOOGLE_MAPS_API_KEY` *(required for interactive map)* — Browser-side Google Maps Platform key for Maps JavaScript API and Places API (New). Restrict by HTTP referrer in production.
- `OPENAI_API_KEY` *(optional)* — Server-side OpenAI API key used by `/api/assistant/chat`. When absent or left as a placeholder, CareSignal uses its deterministic scheduling fallback and reports `"Not configured"` in the UI.
- `SESSION_SECRET` *(optional in dev)* — Secret string used to sign staff authentication session cookies. If omitted in development, an ephemeral random secret is generated per server boot.
- `APP_URL` *(optional)* — Hosting URL (`http://localhost:3000` by default).

---

## Running the App

1. **Install Node.js dependencies:**
   ```bash
   npm install
   ```
2. **Run unit tests (stockout math, safety boundaries, slot filtering, auth hashing):**
   ```bash
   npm test
   ```
3. **Start the development server (Express + Vite on port 3000):**
   ```bash
   npm run dev
   ```
4. **Build and run in production mode:**
   ```bash
   npm run build
   npm start
   ```

## Deploying on Railway

1. Push this project to a GitHub repository and create a Railway project from that repository.
2. Add a Railway volume mounted at `/data`, then set the service variable `DATA_DIR=/data` so the demo database persists across deploys and restarts.
3. Set `SESSION_SECRET` to a strong, unique random value. Add `GEMINI_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, and `OPENAI_API_KEY` as needed for their corresponding integrations; never commit these secrets.
4. Configure a public domain in Railway. Railway uses the included `railway.json` build, start, and `/api/health` health-check settings.

CareSignal is a prototype with file-backed demo data and a publicly documented demo account. Do not use real patient information or treat this setup as a production clinical system.

---

## Training the Stockout Prediction Model (Python & scikit-learn)

CareSignal includes a reproducible Python ML pipeline under `ml/`:

1. **Generate the clearly labeled synthetic dataset** (`ml/data/synthetic_clinic_usage.csv`):
   ```bash
   python3 ml/generate_synthetic_data.py
   ```
2. **Install Python ML dependencies and train the model:**
   ```bash
   pip install -r ml/requirements.txt
   python3 ml/train_stockout_model.py
   ```
   - `train_stockout_model.py` uses a **time-ordered split** (first 75% of dates for training, final 25% for evaluation) to avoid future data leakage.
   - It trains a `GradientBoostingRegressor` (`StandardScaler` + `GradientBoostingRegressor`) and compares MAE and RMSE against a naive `current_stock / rolling_7d_avg` baseline, saving `ml/artifacts/stockout_model.joblib` and `ml/artifacts/model_metadata.json`.
3. **Fallback behavior:** If `scikit-learn` or `ml/artifacts/stockout_model.joblib` is unavailable in the runtime environment, `server/mlBridge.ts` automatically uses the transparent rule-based estimator (`src/lib/stockout.ts`) and labels the active source honestly in the UI.

---

## Prototype Limitations

- **Synthetic Training Data:** `ml/data/synthetic_clinic_usage.csv` is synthetically generated (`SYNTHETIC_DEMO_ONLY`) and must not be represented as validated real-world clinical accuracy.
- **File-Backed Persistence:** Demo records are stored locally in `data/clinic-db.json` for hackathon portability rather than an external clinical database.
- **Non-Diagnostic Scope:** The appointment assistant is strictly limited to scheduling navigation and enforces deterministic keyword boundaries for clinical or emergency queries.
