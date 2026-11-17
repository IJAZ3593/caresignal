"""Train CareSignal's local scikit-learn medicine stockout forecasting model.

Uses a time-ordered train/evaluation split on clearly labeled synthetic clinic
usage data and compares against a naive recent-average baseline.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

try:
    import joblib
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.metrics import mean_absolute_error, root_mean_squared_error
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
except ImportError as exc:
    print(
        f"Missing ML dependency ({exc}). Install with: pip install -r ml/requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

FEATURE_COLUMNS = [
    "current_stock",
    "rolling_7d_avg",
    "rolling_14d_avg",
    "usage_std_7d",
    "usage_cv_7d",
    "trend_7d_vs_14d",
    "supplier_lead_time_days",
    "day_of_week",
]
TARGET_COLUMN = "target_days_until_stockout"


def main() -> None:
    base_dir = os.path.dirname(__file__)
    data_path = os.path.join(base_dir, "data", "synthetic_clinic_usage.csv")
    artifacts_dir = os.path.join(base_dir, "artifacts")
    os.makedirs(artifacts_dir, exist_ok=True)

    if not os.path.exists(data_path):
        raise FileNotFoundError(
            f"Dataset not found at {data_path}. Run: python3 ml/generate_synthetic_data.py"
        )

    df = pd.read_csv(data_path)
    df = df.sort_values(["date", "medicine_id"]).reset_index(drop=True)

    # Time-ordered split (first 75% of unique dates for training, last 25% for evaluation)
    unique_dates = sorted(df["date"].unique())
    split_idx = max(1, int(len(unique_dates) * 0.75))
    cutoff_date = unique_dates[split_idx]

    train_df = df[df["date"] < cutoff_date].copy()
    eval_df = df[df["date"] >= cutoff_date].copy()

    x_train = train_df[FEATURE_COLUMNS]
    y_train = train_df[TARGET_COLUMN]
    x_eval = eval_df[FEATURE_COLUMNS]
    y_eval = eval_df[TARGET_COLUMN]

    # Simple baseline: current_stock / rolling_7d_avg clipped to [0, 60]
    baseline_preds = np.clip(
        eval_df["current_stock"] / np.maximum(0.5, eval_df["rolling_7d_avg"]),
        0.0,
        60.0,
    )
    baseline_mae = float(mean_absolute_error(y_eval, baseline_preds))
    baseline_rmse = float(root_mean_squared_error(y_eval, baseline_preds))

    pipeline = Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "regressor",
                GradientBoostingRegressor(
                    n_estimators=160,
                    max_depth=3,
                    learning_rate=0.06,
                    random_state=42,
                ),
            ),
        ]
    )
    pipeline.fit(x_train, y_train)

    eval_preds = np.clip(pipeline.predict(x_eval), 0.0, 60.0)
    model_mae = float(mean_absolute_error(y_eval, eval_preds))
    model_rmse = float(root_mean_squared_error(y_eval, eval_preds))

    regressor: GradientBoostingRegressor = pipeline.named_steps["regressor"]
    importances = {
        col: round(float(val), 4)
        for col, val in zip(FEATURE_COLUMNS, regressor.feature_importances_)
    }

    model_path = os.path.join(artifacts_dir, "stockout_model.joblib")
    metadata_path = os.path.join(artifacts_dir, "model_metadata.json")

    joblib.dump(pipeline, model_path)

    metadata = {
        "model_type": "scikit-learn GradientBoostingRegressor",
        "data_origin": "SYNTHETIC_DEMO_ONLY",
        "warning": "Trained on synthetic clinic usage data. Metrics are for prototype comparison only, not real-world clinical validation.",
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "time_split": {
            "train_start": unique_dates[0],
            "cutoff_date": cutoff_date,
            "eval_end": unique_dates[-1],
            "train_rows": int(len(train_df)),
            "eval_rows": int(len(eval_df)),
        },
        "baseline_recent_avg": {
            "mae_days": round(baseline_mae, 3),
            "rmse_days": round(baseline_rmse, 3),
        },
        "gradient_boosting_model": {
            "mae_days": round(model_mae, 3),
            "rmse_days": round(model_rmse, 3),
        },
        "feature_importances": importances,
    }

    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"Saved model artifact to {model_path}")
    print(f"Baseline MAE: {baseline_mae:.2f} days | Model MAE: {model_mae:.2f} days")


if __name__ == "__main__":
    main()
