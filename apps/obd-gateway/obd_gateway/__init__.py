"""
obd-gateway: the edge layer for auto-architect.

Talks to an OBDLink MX+ (or any ELM327-compatible adapter) directly via
python-OBD — no AlfaOBD, no enhanced-CAN reverse engineering. It only ever
*reads* PIDs/DTCs and POSTs validated `Observation` batches to the API
(`POST /api/vehicles/:id/observations`). It never classifies a fault, never
decides a repair, and never talks to the LOGOS bridge — same "edge devices
only report validated observations" rule garden-architect's edge-gateway
follows. All reasoning happens once inside the API's RecognitionService.
"""

__version__ = "0.1.0"
