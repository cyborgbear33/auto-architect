# Audit log

Append-only — one row per kaizen-audit run. Never edit a prior row.

| Date | Dimension | Scope | Method | Found | Accepted | Rejected (reasons) | Next dimension due |
|---|---|---|---|---|---|---|---|
| 2026-09-26 | Correctness / Functionality | apps/web-ui | Read of the Diagnosis dossier and the recommendation query keys | 2 | 1 ([dossier lookup errors](evidence/dossier-lookup-errors-evidence.md)) | 1 (recommendation list and the next-action card both request open recommendations on the same query key, so they do not disagree) | Security |
