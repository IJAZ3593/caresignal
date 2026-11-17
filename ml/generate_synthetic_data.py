"""Generate clearly labeled SYNTHETIC small-clinic medicine usage data for CareSignal.

NOTE: All records created by this script are fictional synthetic data generated
for prototype training and evaluation. Do not treat metrics from this dataset
as validated real-world clinical performance.
"""

from __future__ import annotations

import csv
import math
import os
import random
from datetime import date, timedelta

SEED = 42
DAYS_COUNT = 180

MEDICINES = [
    {"id": "med-amox", "name": "Amoxicillin 500mg", "base_daily": 18.0, "lead_time": 4, "restock_qty": 260},
    {"id": "med-ibup", "name": "Ibuprofen 400mg", "base_daily": 22.0, "lead_time": 3, "lead_jitter": 1, "restock_qty": 320},
    {"id": "med-metf", "name": "Metformin 500mg", "base_daily": 15.0, "lead_time": 5, "restock_qty": 240},
    {"id": "med-albu", "name": "Albuterol Inhaler 90mcg", "base_daily": 4.2, "lead_time": 7, "restock_qty": 60},
    {"id": "med-azit", "name": "Azithromycin 250mg", "base_daily": 9.5, "lead_time": 6, "restock_qty": 150},
    {"id": "med-ors", "name": "Oral Rehydration Salts", "base_daily": 12.0, "lead_time": 4, "restock_qty": 190},
    {"id": "med-flu", "name": "Seasonal Influenza Vaccine", "base_daily": 7.5, "lead_time": 8, "restock_qty": 120},
    {"id": "med-ceti", "name": "Cetirizine 10mg", "base_daily": 14.0, "lead_time": 3, "restock_qty": 210},
]


def main() -> None:
    rng = random.Random(SEED)
    out_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "synthetic_clinic_usage.csv")

    start_date = date(2026, 5, 1)
    rows: list[dict[str, object]] = []

    for med in MEDICINES:
        base = float(med["base_daily"])
        lead_time = int(med["lead_time"])
        restock_qty = int(med["restock_qty"])
        stock = restock_qty
        daily_series: list[float] = []

        for day_idx in range(DAYS_COUNT):
            current_day = start_date + timedelta(days=day_idx)
            dow = current_day.weekday()
            # Small clinics typically see lower outpatient dispensing on weekends.
            weekday_factor = 0.55 if dow >= 5 else (1.12 if dow in (0, 1) else 1.0)
            seasonal_wave = 1.0 + 0.16 * math.sin((2.0 * math.pi * day_idx) / 45.0)
            noise = rng.gauss(1.0, 0.22)
            usage = max(0, round(base * weekday_factor * seasonal_wave * noise))

            stock = max(0, stock - usage)
            daily_series.append(float(usage))

            if day_idx >= 14:
                recent_7 = daily_series[-7:]
                prior_7 = daily_series[-14:-7]
                avg_7 = sum(recent_7) / 7.0
                avg_14 = sum(daily_series[-14:]) / 14.0
                mean_7 = avg_7
                std_7 = math.sqrt(sum((x - mean_7) ** 2 for x in recent_7) / 7.0)
                cv_7 = (std_7 / mean_7) if mean_7 > 0 else 0.0
                trend = (avg_7 / (sum(prior_7) / 7.0)) if sum(prior_7) > 0 else 1.0

                rows.append(
                    {
                        "data_origin": "SYNTHETIC_DEMO_ONLY",
                        "date": current_day.isoformat(),
                        "medicine_id": med["id"],
                        "medicine_name": med["name"],
                        "day_of_week": dow,
                        "current_stock": stock,
                        "rolling_7d_avg": round(avg_7, 3),
                        "rolling_14d_avg": round(avg_14, 3),
                        "usage_std_7d": round(std_7, 3),
                        "usage_cv_7d": round(cv_7, 4),
                        "trend_7d_vs_14d": round(trend, 4),
                        "supplier_lead_time_days": lead_time,
                        "daily_units_used": usage,
                    }
                )

            # Simulate periodic clinic replenishment when stock gets low
            if stock <= round(base * (lead_time + 2)):
                stock += restock_qty

        # Compute forward-looking days_until_stockout target without future leakage during feature prep
        med_rows = [r for r in rows if r["medicine_id"] == med["id"]]
        for idx, row in enumerate(med_rows):
            remaining = float(row["current_stock"])
            days_to_zero = 0.0
            if remaining > 0:
                for fwd_idx in range(idx + 1, min(len(med_rows), idx + 60)):
                    fwd_use = float(med_rows[fwd_idx]["daily_units_used"])
                    if remaining <= fwd_use:
                        days_to_zero += remaining / max(1.0, fwd_use)
                        remaining = 0.0
                        break
                    remaining -= fwd_use
                    days_to_zero += 1.0
                if remaining > 0:
                    avg_u = max(0.5, float(row["rolling_7d_avg"]))
                    days_to_zero += remaining / avg_u
            row["target_days_until_stockout"] = round(min(60.0, days_to_zero), 2)

    fieldnames = [
        "data_origin",
        "date",
        "medicine_id",
        "medicine_name",
        "day_of_week",
        "current_stock",
        "rolling_7d_avg",
        "rolling_14d_avg",
        "usage_std_7d",
        "usage_cv_7d",
        "trend_7d_vs_14d",
        "supplier_lead_time_days",
        "daily_units_used",
        "target_days_until_stockout",
    ]

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows)} synthetic rows at {out_path}")


if __name__ == "__main__":
    main()
