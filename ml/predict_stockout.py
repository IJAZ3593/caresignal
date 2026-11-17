"""Local inference script called by CareSignal server when scikit-learn artifact exists."""

from __future__ import annotations

import json
import os
import sys

try:
    import joblib
    import numpy as np
    import pandas as pd
except ImportError as exc:
    print(json.dumps({"ok": False, "error": f"missing_dependency: {exc}"}))
    sys.exit(2)

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


def main() -> None:
    base_dir = os.path.dirname(__file__)
    model_path = os.path.join(base_dir, "artifacts", "stockout_model.joblib")
    if not os.path.exists(model_path):
        print(json.dumps({"ok": False, "error": "artifact_not_found"}))
        sys.exit(3)

    payload = json.loads(sys.stdin.read() or "[]")
    if not payload:
        print(json.dumps({"ok": True, "predictions": []}))
        return

    pipeline = joblib.load(model_path)
    frame = pd.DataFrame(payload)[FEATURE_COLUMNS]
    preds = np.clip(pipeline.predict(frame), 0.0, 60.0)

    results = [round(float(val), 1) for val in preds]
    print(json.dumps({"ok": True, "predictions": results}))


if __name__ == "__main__":
    main()
