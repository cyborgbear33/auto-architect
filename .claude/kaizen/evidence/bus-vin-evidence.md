# Record the VIN the bus actually returned

Problem
Discovery could tell that Mode 09 VIN was supported, and the gateway could read the VIN, but the dossier never showed the string. The operator was asked to type it even when the adapter had already returned one.

Evidence
`read_vin` in `apps/obd-gateway/obd_gateway/client.py` queries `obd.commands.VIN`. `discover_capabilities` stored only `modes.vin.supported`. TopDon TopScan advertises AutoVIN (https://www.topdon.us/products/topscan). OBD Fusion lists Mode 09 vehicle information, including the VIN (https://apps.apple.com/us/app/obd-fusion/id650684932).

Current Behavior
A discover probe keeps the VIN only when it is 17 characters from the ISO alphabet (no I, O, or Q). Anything else is dropped. The discovery report names that string and says it is not saved until the operator records it. On Diagnosis, an empty dossier offers "Record this VIN". If the dossier already has a different VIN, both are shown and neither is changed.

Desired Outcome
The operator can record the VIN the bus returned, and a missing or malformed read stays blank instead of becoming an identity.

Options Considered
Write the bus VIN onto the profile automatically. The operator still confirms, so a wrong read cannot replace a VIN they already entered.

Recommended Change
Return the normalized VIN from discover, show it on the dossier, and save it only when the operator records it.

Architecture/Ontology Impact
None. The VIN is an identity field the operator already could type. No fault class changed.

UX Impact
Diagnosis shows the bus VIN only when discovery actually returned one. A blank dossier stays blank when the read fails.

Security/Privacy Impact
The VIN is vehicle identity. It stays on the local dossier, same as a typed VIN. It is not sent anywhere new.

Migration Impact
Older discovery reports without `value` still load. The field is optional.

Test Plan
Gateway tests: a lowercase 17-character VIN is kept in uppercase, and "NOT-A-VIN" becomes null. Discovery service test: the string appears in the report and the vehicle profile VIN stays unset. Diagnosis page test: the button records that VIN and does not save it before the click.

Success Metrics
Those tests pass.

Rollback Plan
Stop sending `value` from discover and remove the dossier button.

Completed 2026-09-27: discover keeps a valid Mode 09 VIN, and Diagnosis records it only when asked. Verified by `pnpm --filter @auto/api exec vitest run src/services/discovery.test.ts` (5 passed), `pnpm --filter @auto/web-ui exec vitest run src/__tests__/diagnosis-page.test.tsx` (11 passed), and `apps/obd-gateway/.venv/bin/pytest apps/obd-gateway/tests/test_client.py` (13 passed). The live page was not opened in a browser.

Issues Encountered
none

Deviations from the Plan
A VIN that differs from the one already on the dossier is shown and left unchanged.

Known Gaps
Calibration IDs (the other Mode 09 vehicle-info fields OBD Fusion shows) are not read. Calculated fuel economy stays in feature research until speed and airflow are both present and the formula is labeled as calculated.
