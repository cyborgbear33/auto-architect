# Discover docs still say the probe returns no values

Problem
The edge contract and the mastery guide said discovery only reports support flags. The probe now also returns a Mode 09 VIN when the string is valid. An operator following the guide would not look for that VIN, and a later change could delete the read because the contract forbids "values."

Evidence
`docs/ai/OBD_EDGE_CONTRACT.md` said discover must not dump values, and named VIN only as a support probe. `docs/VEHICLE_OBD_MASTERY_GUIDE.md` said discovery is "support, not values" and told the operator to check "VIN flags." `discover_capabilities` in `apps/obd-gateway/obd_gateway/client.py` sets `modes.vin.value` from `read_vin`.

Current Behavior
The contract says discover may return one 17-character VIN and still must not dump PID values. The mastery guide says the same, and that the string is not on the dossier until the operator records it.

Desired Outcome
The docs match the probe: a valid VIN can come back, PID values still do not, and the dossier does not change by itself.

Options Considered
Stop returning the VIN so the old sentences stay true. The read is the feature that just shipped. The sentences were the part that lagged.

Recommended Change
Update the edge contract and the mastery guide discovery and Diagnosis chapters.

Architecture/Ontology Impact
None.

UX Impact
The in-app Guide uses the mastery guide text, so the Discovery chapter now mentions the VIN the probe can return.

Security/Privacy Impact
None. The docs do not add a new place the VIN is stored.

Migration Impact
None.

Test Plan
Read the two edited sections against `discover_capabilities`. No code behavior changed.

Success Metrics
The contract and the guide both say a valid VIN may be returned and is not saved until the operator records it.

Rollback Plan
Restore the "support, not values" and "VIN flags" sentences.

Completed 2026-09-27: the edge contract and the mastery guide match the Mode 09 VIN read.

Issues Encountered
none

Deviations from the Plan
none

Known Gaps
Calculated fuel economy and manufacturer maintenance intervals remain feature-research notes, not docs to correct. Local uncommitted edits in several operator docs were not part of this change.
