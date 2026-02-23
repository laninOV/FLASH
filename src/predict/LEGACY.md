# Predict Legacy Modules

These modules are retained for compatibility, research history, and tests, but are **not used by the main runtime prediction pipeline** (`orchestrator -> predictor -> predict/dirtPairs`):

- `src/predict/calibration.ts`
- `src/predict/dirtStyle.ts`
- `src/predict/ensemble.ts`
- `src/predict/historyMetrics.ts`
- `src/predict/modulesHistory.ts`
- `src/predict/tpw12.ts`

Why they are kept:

- preserve previously extracted `third_set` logic references
- keep existing test fixtures and historical model experiments
- avoid breaking downstream imports while runtime remains stable

Policy:

- no runtime behavior should depend on these modules
- changes here are maintenance-only unless explicitly requested
