# Ontology of the 2003 Chevrolet Silverado 2500HD: One Truck as a Layered Physical System
## A dependency-first framework connecting identity, structure, powertrain, drivetrain, chassis, electrical, comfort/safety, and the software diagnostic ontology built on top of it

This manual organizes one specific vehicle — VIN-decoded, not a generic "GMT800 truck" — as a **single layered ontology of a physical system**, in the same spirit as a universal-physics ontology: entities, properties, relationships, states, interactions, dynamics, and emergent structure, applied at truck scale instead of cosmic scale.

> **Central mechanical progression**
> Fuel + Air -> Combustion -> Torque -> Drivetrain -> Wheels -> Motion (+ Heat + Emissions rejected)

A useful generic model for any subsystem in this truck is:

> **Subsystem = Components + Fluids/Energy Carriers + State + Interfaces + Control + Failure Modes**

The aim is to show how the engine, fuel/air path, drivetrain, chassis, electrical system, body, and comfort/safety systems fit into one coherent map — and where the software diagnostic ontology already shipped in the `auto-architect` project sits as a *specialized, evidence-constrained child* of this broader physical ontology, not a replacement for it.

### Provenance legend (used throughout)

Every claim below is tagged so a platform habit never gets mistaken for a fact about *this* VIN:

| Tag | Meaning |
|---|---|
| **[VIN-verified]** | Decoded directly from this VIN via NHTSA vPIC |
| **[NHTSA-primary]** | Read from the NHTSA recall/campaign record for this make, model, and year |
| **[corroborated]** | The OEM's original document was not reached; independent secondary sources agree on the specifics |
| **[platform-typical]** | Published, well-corroborated fact about the 2003 Silverado 2500HD / GMT800 HD line — not a measurement of this VIN |
| **[document-only]** | Appears in this model line's owner's manual table of contents, but is an option not confirmed present on this truck (e.g. features shared across 1500/2500HD/3500 in one printed manual) |
| **[open]** | Genuinely unknown for this VIN — a named way to close it is given, never a guess |

This is the same discipline already used in the project's `docs/silverado-2500hd-field-manual.html` and `docs/ai/OEM_RESEARCH_SOURCES.md`. This document is broader: that file traces *diagnosable* faults; this one is the *whole truck*, wrenchable and non-wrenchable parts alike.

---

# 1. Why a Vehicle Should Be Organized Ontologically

A shop manual usually organizes information by *task* (chapter per repair procedure) or by *system in isolation* (engine chapter, brakes chapter, electrical chapter) with the connections between chapters left implicit. That is efficient for a technician who already holds the whole truck in their head. It is exactly the wrong shape for building that mental model in the first place.

A better organization asks, of every named part or complaint:

- **What entity is this?** (a physical part, a fluid, a control signal, a symptom, a condition, a trend)
- **What properties describe it?** (dimensions, capacity, ratio, pressure, voltage, tolerance)
- **What is it connected to?** (mechanically, electrically, hydraulically, thermally)
- **What interaction produces its behavior?** (combustion, friction, corrosion, wear, hydraulic actuation)
- **What state is it in right now, and what state can it transition to?**
- **What regime does it only make sense in?** (cold vs. warm, idle vs. load, 2WD vs. 4WD, unladen vs. towing at GVWR)
- **What does it feed into, and what feeds it?** (a cascade, not an isolated fact)
- **How sure are we, and where did that certainty come from?**

This produces a dependency graph rather than a stack of chapters — and it is the same discipline the project's ontology (`packages/ontology/dl-ontology.json`) already applies to the narrow slice a scan tool can see. This document extends that discipline to the *entire* truck.

---

# 2. The Vehicle Ontology Family

The whole-truck ontology acts as the parent schema for the subsystem-level "child ontologies" below. None of these are isolated departments; a failure in one routinely presents as a symptom in another (Part 16).

| Child ontology | Principal subject |
|---|---|
| Identity | VIN, build data, RPO codes, GVWR class, plant, model-year facts |
| Powertrain Core | engine block, heads, valvetrain, ignition, fuel injection, knock/timing sensing |
| Fuel, Air & Emissions | intake, fuel delivery, EVAP, catalyst, oxygen sensing — the OBD-visible gas path |
| Drivetrain | transmission, transfer case, driveshafts, front/rear axles |
| Chassis, Brakes & Steering | frame, suspension, hydro-boost brakes, steering linkage, tires/wheels |
| Electrical & Body Control | PCM/BCM, harness, charging/starting, lighting, locks, body control modules |
| Body & Structure | frame, cab, bed, doors, tailgate, glass |
| Comfort, Safety & Restraint | seats, climate control, air bags, safety belts, child-restraint anchors |
| Fluids & Consumables | oil, coolant, transmission/transfer-case/axle fluids, brake fluid, fuel |
| Diagnostics & Control Software | the DL ontology, DTC/PID dictionaries, cartridges, cascade edges — the *provable* slice |
| Maintenance & Lifecycle | scheduled service, inspections, recalls, TSBs, wear/replacement parts |

These are **overlapping views of one truck**, not isolated boxes — a worn serpentine belt (Chassis) can take down charging (Electrical), power steering (Chassis), and brake assist (Chassis) simultaneously, because all three share one physical entity (Part 16.2).

---

# 3. Diagnostics' Proper Place

The auto-architect project's software ontology should not be described as "the truck's ontology." It is better understood as a **narrow, deliberately conservative child ontology** built on top of the physical one, restricted to what a Mode 01–07 scan tool can actually prove.

Its foundations come from:

> **Physical Components + SAE J1979/J2012 Signal Vocabulary + Curated OEM Bulletins -> Provable Fault Classes**

The basic progression is:

> Physical part -> electrical/mechanical/fluid behavior -> a PCM-observable signal -> a standardized DTC -> a curated ontology class -> a ranked repair playbook

Crucially, this progression only runs **forward through what the PCM actually monitors**. Most of the truck — frame, brakes, steering, body, restraint systems, half the drivetrain — has no DTC at all and is reasoned about the way a mechanic reasons: by inspection, by sound, and by the causal rules in Part 9 and Part 12, not by a scan tool.

> **A scan tool proving zero DTCs is not the truck reporting "healthy." It means the PCM-observable slice has nothing pending — and that slice is a minority of the truck.**

This is the same caution the project states as "empty honest data is never healthy" (`docs/VEHICLE_OBD_MASTERY_GUIDE.md`). Part 19 below places the shipped software ontology precisely within this larger map.

---

# 4. The Master Scale Ontology

Scale is one of the major organizing dimensions of this vehicle's knowledge, exactly as it is for physical reality generally.

> **Raw Material / Fastener**
> -> **Component** (a knock sensor, a brake pad, a head gasket)
> -> **Subassembly** (a cylinder head, a caliper, a transfer case)
> -> **System** (the fuel-injection system, the braking system)
> -> **Vehicle** (this VIN, as a whole)
> -> **Duty Cycle / Fleet Context** (towing, off-road, daily driving, seasonal exposure)

Each scale supports new stable failure modes, new inspection procedures, and new effective rules. A washer does not "misfire." A cylinder does. A bank does not corrode from water intrusion; a connector does. Naming the correct scale is half of a correct diagnosis.

A complete description of any subsystem should be classified along independent axes:

> **Component description = Scale × Entity Type × Interaction × State × Regime**

For example, the intake manifold gasket (Part 6, Part 9) can be modeled as:

- a static mechanical seal (installed torque, material spec),
- an air-path boundary (vacuum leak potential),
- a coolant-path boundary (a question you can ask; not what the retrieved bulletin answers),
- a thermal-cycling component (fuel pooling and gasket degradation, which is the failure the bulletin names).

The gasket has not changed categories arbitrarily — the *question being asked of it* has changed. The corroborated bulletin for this engine (TSB 05-06-04-029A) documents an unmetered air leak after the upper gasket degrades, named as rough idle, misfire, and P0300. It does not document a coolant-path failure.

---

# 5. Vehicle Entity Ontology

## 5.1 Identity Entities

- VIN **[VIN-verified]**
- RPO (Regular Production Option) code set — the glovebox/door-jamb label naming exact transmission, axle, and options **[platform-typical structure; codes for this VIN are open]**
- Service Parts Identification label **[platform-typical — a real, named label in the owner's manual, section "Vehicle Identification"]**

## 5.2 Structural Entities

- Ladder frame
- Cab (extended cab, this VIN) **[VIN-verified body style]**
- Pickup bed
- Tailgate, including its support cables **[NHTSA-primary — recall 04V129000 names this exact entity]**
- Doors, glass, weatherstripping

## 5.3 Powertrain Entities

- Engine block (cast iron), cylinder heads (cast aluminum) **[platform-typical]**
- Valvetrain: pushrod OHV, 2 valves/cylinder **[platform-typical]**
- Crankshaft, camshaft, and their position sensors
- 8 ignition coils, coil-near-plug **[platform-typical]**
- 8 fuel injectors, sequential port injection **[platform-typical]**
- 2 knock sensors, in the lifter valley under the intake, front and rear **[platform-typical]**; the corroborated bulletin names only the rear sensor, and only through 2002
- Throttle body

## 5.4 Fuel, Air & Emissions Entities

- Intake manifold and its upper gasket (air-path seal in TSB 05-06-04-029A; the retrieved text does not make it a coolant boundary)
- Mass airflow (MAF) and manifold absolute pressure (MAP) sensors
- Fuel tank, fuel pump, fuel rail
- EVAP canister, purge solenoid, vent solenoid
- Catalytic converters, one per bank
- 4 oxygen sensors: 2 banks × upstream/downstream

## 5.5 Drivetrain Entities

- Transmission (identity **[open]** — Part 7.1)
- Transfer case (4×4, part-time) **[platform-typical — Part 7.2]**
- Front differential/axle **[platform-typical — Part 7.3]**
- Rear differential/axle **[platform-typical — Part 7.3]**
- Driveshafts, U-joints, CV joints (front, because this truck is independent-front)

## 5.6 Chassis, Brake & Steering Entities

- Torsion bars (front suspension) **[platform-typical]**
- Leaf springs (rear suspension) **[platform-typical]**
- Shocks, all four corners
- Brake pads, rotors, calipers, per corner
- Hydro-boost brake assist unit **[NHTSA-primary — recall 04V045000 confirms this is hydraulic, not vacuum, assist]**
- Power-steering pump, belt, and fluid (also feeds hydro-boost — Part 16.3)
- Steering linkage
- Wheel hubs and bearings

## 5.7 Electrical & Control Entities

- PCM (Powertrain Control Module) — owns every sensor input/actuator output in 5.3–5.4
- BCM-class body control functions: door locks, Passlock theft deterrent **[document-only]**
- Wiring harness — the physical medium every "electricity"-aspect fault in Part 8/12 lives in
- Battery, alternator, starter **[platform-typical: single-battery, single-alternator gas HD layout]**
- Instrument cluster and its warning lights/gauges (Part 15)

## 5.8 Comfort, Safety & Restraint Entities

- Seats (manual and/or power, per trim) **[document-only]**
- Dual climate control system **[document-only]**
- Driver Information Center (DIC) **[document-only]**
- Air bag modules, passenger sensing system **[document-only]**
- Safety belts, LATCH child-restraint anchors **[document-only]**
- Remote keyless entry **[document-only]**

## 5.9 Fluid & Energy-Carrier Entities

- Engine oil, engine coolant, power-steering fluid, brake fluid
- Automatic or manual transmission fluid (Part 7.1 — type depends on the open transmission identity)
- Transfer-case fluid, front and rear axle gear oil
- Gasoline (this truck is gasoline, not diesel) **[VIN-verified]**

## 5.10 Structural Context

Every entity above sits inside a **system**, has a **boundary** (a gasket, a connector, a seal), and exchanges something across that boundary with its **environment** (heat, current, hydraulic pressure, or a fluid). Most single-part diagnoses in this manual are really questions about whether a specific boundary is still doing its job.

---

# 6. Property and Quantity Ontology

Every component above is characterized by measurable properties. Each property recorded in this manual carries: a value, a **source tag** (Part 0's legend), and — where it matters for diagnosis — a **tolerance or normal range** left to the factory service manual rather than guessed here.

| Property class | Examples on this truck | Tag |
|---|---|---|
| Geometric | bore × stroke 4.00 in × 3.622 in; displacement 6.0 L / 364 cu in / 5,967 cc | **[platform-typical]** |
| Mechanical ratio | compression ratio ≈ 9.4:1; final drive 4.10 standard (RPO GT5), 3.73 optional (RPO GT4) | **[platform-typical]** |
| Power/torque | 300 hp @ 4,400 rpm; 360 lb-ft @ 4,000 rpm (brochure rating) | **[platform-typical]** |
| Electrical | 8 coil circuits, 8 injector circuits, single battery/alternator | **[platform-typical]** |
| Fluid capacity | engine oil, coolant, transmission, axle, transfer-case fill volumes | **[open — see the printed "Capacities and Specifications" section of the owner's manual; not reproduced here to avoid a guessed number]** |
| Load rating | GVWR class 2H, 9,001–10,000 lb | **[VIN-verified]** |
| Identity | VIN check-digit, RPO codes | **[VIN-verified structure; specific RPOs open]** |

**Discipline:** a number without a source tag in this document is a bug in the document, not a fact about the truck. This mirrors `docs/ai/OEM_RESEARCH_SOURCES.md`'s rule for the software ontology: never invent a spec, a VIN decode, or a recall detail.

## 6.1 Numerical parameters the research draft left unspecified **[open]**

A whole-truck research draft (`deep-research-report`, 2026-09-26) includes a section “Missing Numerical Parameters & Provenance.” That section marks each value **unspecified** and names a place to look. It does not contain the numbers. The same draft models this truck as an **8.1L Vortec, RPO L18**. vPIC says this VIN is an **LQ4 6.0L**. Engine torque, bore, firing order, and capacity from that draft do not transfer. The rows below are the gap list, still blank, aimed at the LQ4 and at this VIN’s open transmission.

| Parameter | Subsystem | Value | Recommended source | Why it stays blank |
|---|---|---|---|---|
| Main bearing cap bolt torque | Engine | Unspecified | GM service manual, engine section, LQ4 | Draft marks it low-confidence and supplies no figure |
| Rod bolt torque | Engine | Unspecified | GM service manual, LQ4 | Same |
| Cylinder head bolt torque | Engine | Unspecified | GM service manual, LQ4 | Same |
| Oil-filter tighten torque | Lubrication | Unspecified | GM service information for this filter | Draft calls a common value “medium” confidence. A common value is not this truck’s spec |
| Coolant system pressure-cap rating | Cooling | Unspecified | GM service manual, cooling, or the cap stamping | No PSI in the draft |
| Fan-clutch engagement temperature | Cooling | Unspecified | GM service information for this clutch | No temperature in the draft |
| Starter current draw | Electrical | Unspecified | Specification for the starter on this truck | No amperage in the draft |
| Fuse amperages | Electrical | Unspecified | GM electrical schematics for this body | Draft says “partially listed” and mentions fuse 16 (10A), fuse 29 (10A), and EBCM at 60A, with the citations promised in an appendix that is not in the file. Those three figures stay out until a schematic is read |
| Transmission fluid capacity | Transmission | Unspecified | GM service information for the named transmission | Draft marks this worth sourcing. This VIN’s gearbox is still open (MT1, MW3, ML6, or M74), so one liter value would be the wrong gearbox |
| Oil pressure at idle and at rpm | Lubrication | Unspecified | GM LQ4 engine specifications | No PSI in the draft |
| Camshaft calibration offset | Engine control | Unspecified | A bulletin or calibration procedure that states the offset | No offset in the draft |

Do not fill any cell from the draft’s 8.1L narrative (4.25 in bore, L18 injection, NV4500 as the HD gearbox, coil-spring front suspension, 9.5 in Detroit axle, rear drums). This VIN’s map already records an LQ4, a torsion-bar IFS front, and an AAM axle pattern. Those conflicts are identity errors in the draft, not missing fields to copy.

---

# 7. Drivetrain — the Least-Observed, Most-Consequential System

The drivetrain has no DTC coverage at all on this platform, yet gates which recalls apply and how the truck actually fails. It gets its own section because "open unknown" here is not a minor gap — it is the single biggest lever on this whole manual's accuracy.

## 7.1 Transmission — **[open]**

The 2003 2500HD gas lineup lists four transmissions: Hydra-Matic 4L80-E (4-speed automatic, RPO MT1), a 5-speed manual (RPO MW3), the ZF S6-650 6-speed manual (RPO ML6), and the Allison 1000 (5-speed automatic, RPO M74) **[platform-typical]**. Independent brochures disagree on whether MW3 is printed as "NVG 3500" or "NVG 4500"; the quoted 5.61:1 first-gear ratio matches the heavier 5-speed. The ZF and Allison pairings in those same brochures skew toward the 8.1L and Duramax rather than the gas 6.0L, but none of the tables assign exactly one gearbox to the LQ4 with certainty.

**How to close it:** read the glovebox RPO label — the transmission code almost always starts with `M` (e.g. `MT1`, `MW3`, `ML6`, `M74`). A clutch pedal only tells you manual vs. automatic, not which manual.

**Why it matters:** it changes the fluid type and service interval (Part 5.9), and it gates NHTSA recall 05V161000 entirely — that campaign applies **only** if this truck has a manual transmission with a PBR or TRW parking brake.

## 7.2 Transfer Case — **[platform-typical, corroborated]**

4×4 is VIN-verified. The 2500HD/3500 line uses one of two heavy-duty, chain-driven, part-time New Venture units, both with 32-spline input and output shafts and 2HI/4HI/Neutral/4LO only — **no Auto-4WD mode on this HD line** (that "AutoTrac"/NV246 feature belongs to the 1500/1500HD, not this truck):

| Case | Actuation | RPO | Modes |
|---|---|---|---|
| NV261HD | Floor lever (manual) | NP2 | 2HI / 4HI / N / 4LO |
| NV263HD | Push-button (electric) | NP1 | 2HI / 4HI / N / 4LO |

**How to close it:** the tag on the case itself, or the RPO label (`NP1` or `NP2`). Do not assume "4WD light on the dash means AutoTrac" — this line does not have that mode.

## 7.3 Front and Rear Axles — **[platform-typical, corroborated]**

The 2001–2007 2500HD 4×4 uses an **independent** torsion-bar front end with an AAM 9.25-inch IFS differential — not the older solid front axle, and not the 1500's lighter 8.6-inch unit. The rear axle on these HD trucks is commonly the AAM 11.5-inch **full-floating** unit (hub-flange bolts visible at each rear wheel), not the older corporate "14-bolt" semi-floating axle sometimes assumed from earlier GM truck generations.

Axle ratio is an RPO code, not a VIN fact: `GT4` = 3.73:1, `GT5` = 4.10:1 (4.10 is standard with the Vortec 6000). `G80` on the label means an Eaton automatic locking rear differential is fitted; `GQ1` means an open rear differential. **[open for this VIN — read the label]**

**Why it matters:** front axle type changes the entire front failure model. A solid axle has kingpins and a straight tube; this truck's IFS has upper/lower ball joints and CV-jointed halfshafts instead (Part 12's CV-click rule assumes IFS and is correct for this platform).

---

# 8. Interaction Ontology

At the physical level, everything this truck does reduces to a small set of interaction types:

- **Mechanical** — contact, friction, combustion force, torque transfer
- **Electrical** — current through a circuit, a signal voltage, a ground path
- **Hydraulic** — fluid pressure doing work (brakes, hydro-boost, power steering, automatic transmission)
- **Pneumatic** — vacuum/pressure in the intake and EVAP paths
- **Thermal** — heat generation (combustion, friction) and heat rejection (cooling system, brakes)
- **Chemical** — combustion itself, and slow chemical interactions like corrosion and fluid degradation

From these fundamental interactions, this specific truck's documented failures emerge as **effective interactions** — the same "fundamental vs. effective" distinction a physical ontology draws for friction or chemical bonding:

> **Fundamental Interaction -> Effective, Truck-Specific Failure Mode**

Examples actually documented for this truck (Part 9, Part 14):

- Fuel pooling on an upper intake gasket -> **an unmetered air leak, named as rough idle, misfire, and P0300** (TSB 05-06-04-029A; L59 is the titled engine, LQ4 is in the may-apply sentence; the retrieved text does not name a coolant leak)
- Water in the rear knock-sensor cavity -> **P0332 on trucks the bulletin lists through 2002, with spark knock as a customer comment** (TSB 02-06-04-023A; this profile is a 2003; the text does not say the code rules detonation out)
- Friction + heat + time -> **brake pad wear, then rotor scoring, then hub-bearing stress** (Part 12's chassis cascade)
- An out-of-spec bore + hydraulic pressure -> **a fractured relief-valve O-ring, felt as pedal effort** (recall 04V045000)

None of these are "additional fundamental forces." They are how the fundamental interactions above actually show up on *this* truck, and naming them correctly is what separates a diagnosis from a guess.

---

# 9. State Ontology

Every subsystem needs a way to represent its current condition. This truck uses several state vocabularies simultaneously, and confusing them is a common source of misdiagnosis.

## Operating state (engine/PCM)

> off -> crank -> cold idle (open loop) -> warm idle/run (closed loop) -> load -> WOT -> decel/return-to-idle

Closed-loop fuel control, and therefore several fault classes in Part 12, only apply once the engine and its oxygen sensors are warm — a cold-start rich condition is not the same entity as `RichFuelBank1`.

## Fault state (software ontology, Part 3/19)

> no fault -> pending DTC -> stored (confirmed) DTC -> MIL commanded on -> permanent DTC (survives a clear)

## Fluid state

> full & correct spec -> low -> contaminated/degraded -> wrong viscosity/type

A starved or wrong fluid can *mimic* an actuator failure (Part 8's caution applies directly to oil and coolant on this truck).

## Structural/mechanical condition state

> sound -> worn -> damaged -> failed

This is the vocabulary the *non-scanned* half of the truck (Part 7, Part 12) actually lives in — brakes, bearings, joints, cables. A DTC vocabulary does not apply here at all.

## Environmental/regime state

> unladen -> loaded -> towing at or near GVWR; 2WD-High -> 4WD-High -> 4WD-Low; on-road -> off-road

---

# 10. Transformation & Dynamics Ontology

The truck's core dynamic loop, end to end:

> **Fuel + Air -> Combustion (chemical + thermal) -> Cylinder Pressure (mechanical) -> Crankshaft Torque -> Transmission -> Transfer Case (if engaged) -> Axle(s) -> Wheels -> Motion**

Every major subsystem is a stage in, or a support loop around, that chain:

- **Ignition** times the combustion stage (Part 5.3).
- **Fuel/air metering** sets the combustion stage's mixture (Part 5.4); its correctness is judged downstream by fuel trim and oxygen sensors.
- **Cooling** removes waste heat from the combustion stage so it can keep running (Part 5.6, Part 16.4).
- **EVAP/catalyst** manage the *byproducts* of combustion, not the combustion stage itself.
- **Hydraulic braking** is the inverse transformation: kinetic energy -> heat, at the pads/rotors, assisted by the same pump that also does power steering (Part 16.3).
- **Corrosion, wear, and thermal cycling** are slow transformations running in the background of every stage above, and are what actually produces most of this truck's real-world failures (Part 12).

---

# 11. Conservation and the Energy Ladder

Across every transformation in Part 10, physical conservation still applies — it just is not usually the *interesting* question for a truck the way it is for a physics problem. What *is* interesting is where energy and mass are lost on purpose or by failure:

> **Chemical energy in fuel -> Thermal energy (combustion) -> Mechanical energy (crankshaft torque) -> [Kinetic energy of the truck] + [Heat rejected by cooling] + [Friction losses in drivetrain/brakes] + [Unburned fuel / emissions]**

Two conservation-flavored facts do real diagnostic work on this truck:

- **Fuel mass balance:** fuel metered in should equal fuel burned plus fuel vapor properly routed through EVAP. A lean or rich code (Part 12) is exactly a claim that this balance is off on one bank.
- **Coolant volume balance:** coolant should stay in the cooling loop. A loss with no puddle still has to be found in the hoses, radiator, heater core, and water pump. TSB 05-06-04-029A’s retrieved text does not add the intake gasket as that path.

---

# 12. Regimes, Cascades, and Domains of Validity

No single fault class or fluid check applies unconditionally. Each carries an implicit `HAS_DOMAIN_OF_VALIDITY`.

## Regime gates (examples)

- Closed-loop fuel trim fault classes -> **only valid once warm and in closed loop**
- `MisfireUnderLoad` -> **requires a high-load condition or a recurring high-load trend**, not just any misfire code
- 4WD-specific driveline stress -> **only in 4WD-engaged regimes**
- Towing-related brake/cooling stress -> **only near or at GVWR**

## The forward cascade — what to watch for once something is already confirmed

These are shop priors (Watch / Elevated / High), never certainties, and never a claim that the consequent has already happened. They are transcribed from the project's own `packages/ontology/cascade-edges.json` and `vehicle-system-aspects.json` so this manual stays aligned with what the software actually reasons with — see Part 19.

**Powertrain:**

| Antecedent (confirmed) | Watch for | Band |
|---|---|---|
| Cam/crank correlation fault | Misfire under load | Elevated |
| Ignition coil circuit fault | Misfire under load | Elevated |
| Injector circuit fault | Misfire under load | Elevated |
| Misfire under load (even if still an open case) | Catalyst efficiency fault | Elevated |
| Rising long-term fuel trim | Lean fuel condition | Watch |
| EVAP purge system fault | Lean fuel condition | Watch |
| Lean fuel condition | Catalyst efficiency fault | Watch |
| Upstream O2 performance fault | Catalyst efficiency fault | Watch |

**Chassis (operator-observed conditions — never inferred from OBD):**

| Antecedent (observed) | Watch for | Band |
|---|---|---|
| Brake pads thin | Rotor scoring | Elevated |
| Pads metal-on-metal | Rotor damage | High |
| Caliper seized | Tapered pad wear + rotor heat spot | Elevated / High |
| Brake fluid dark/overdue | Hydraulic system corrosion | Elevated |
| Rotor scored (confirmed) | Hub-bearing noise | Watch |
| Hub-bearing growl | Wheel-hub failure | High |
| CV-joint click on a turn | CV-joint failure | Elevated |
| Serpentine belt cracked | Accessory-drive loss (alternator + power steering + **brake assist**, all at once — Part 16.2) | Elevated |
| Coolant hose soft/swollen | Coolant leak | Watch |

---

# 13. Emergence as a First-Class Category

A single loose connector, a single worn pad, a single stretched cable is rarely the whole story on this truck. The interesting failures are **emergent**: several small, individually unremarkable facts combine into a named, actionable condition.

> Individual entity fact -> Interaction over time -> Accumulated condition -> Emergent, named failure -> Effective repair rule

Examples already documented for this truck:

- Water at the rear knock sensor -> P0332, on the 1999–2002 trucks TSB 02-06-04-023A lists. The bulletin’s own condition includes audible spark knock. This profile is a 2003, and P0327 is not that bulletin.
- A degraded upper intake gasket -> an unmetered air leak that TSB 05-06-04-029A names as rough idle, misfire, and P0300. The retrieved text does not add both-bank lean codes or a coolant leak.
- A cracked serpentine belt -> simultaneous loss of charging, power steering, **and** brake assist, because all three systems share one physical belt (Part 16.2). None of the three individual systems is "broken" in isolation; the belt is.
- Corroded tailgate support cables -> silent until both fail together, at which point the tailgate itself (a large, otherwise-unremarkable panel) becomes the safety event.

This is the same principle a physical ontology states as **reduction does not imply elimination**: a proven software fault class (Part 19) does not eliminate the physical part underneath it, and a physical part's condition does not, by itself, guarantee a fault class will ever be proven — most of this truck has no code to prove it by at all.

---

# 14. Canonical Universal Vehicle Ontology

### Physical Vehicle

**Entity**
- structure, powertrain component, drivetrain component, chassis component, electrical component, fluid, control signal

**Property / Quantity**
- dimension, mass, torque, ratio, pressure, voltage, current, resistance, capacity, tolerance, load rating

**State**
- operating, fault, fluid, structural condition, environmental/regime

**Interaction**
- mechanical, electrical, hydraulic, pneumatic, thermal, chemical (fundamental)
- combustion, friction wear, corrosion, hydraulic leak-down, vacuum leak (effective/truck-specific)

**Structure**
- component, subassembly, system, vehicle, duty-cycle context

**Dynamics**
- combustion cycle, torque transfer, heat rejection, hydraulic actuation, corrosion/wear accumulation

**Transformation**
- fuel/air metering, ignition timing, energy conversion (chemical->thermal->mechanical->kinetic), braking (kinetic->thermal)

**Convention** *(this domain's analog of physical symmetry — human-imposed but load-bearing)*
- cylinder numbering, bank assignment, RPO code system, VIN structure, DTC standardization (SAE J2012)

**Invariant / Conservation**
- fuel mass balance, coolant volume balance, torque balance across the drivetrain, energy ladder (Part 11)

**Scale**
- fastener/material, component, subassembly, system, vehicle, fleet/duty-cycle

**Regime**
- cold/open-loop vs. warm/closed-loop, idle vs. load vs. WOT, 2WD vs. 4WD, unladen vs. towing-at-GVWR

**Emergence**
- accumulated wear/corrosion, multi-symptom single-cause failures, cascading shared-part loss

**Observation and Measurement**
- DTC, PID, Mode 06 monitor, operator-observed condition, odometer/mileage trend

**Provenance** *(this domain's analog of theory status / domain of validity — carried on every claim, Part 0)*
- VIN-verified, NHTSA-primary, corroborated, platform-typical, document-only, open

---

# 15. Instrument-Panel Ontology — the Truck's Own Self-Reporting Layer

Before any external scan tool is connected, this truck already reports on itself through the instrument cluster. These are real, named indicators from this model line's owner's manual (document "Warning Lights, Gages and Indicators" section) — **[document-only]** unless cross-referenced against an actual live session:

| Indicator | Entity it reports on |
|---|---|
| Malfunction Indicator Lamp (MIL) | The PCM fault-state layer (Part 9, Part 19) — the only indicator that maps onto the software ontology |
| Battery Warning Light / Voltmeter Gage | Charging system (Part 5.7, Part 16.2) |
| Brake System Warning Light | Hydraulic brake circuit / hydro-boost (Part 5.6) |
| Anti-Lock Brake System Warning Light | ABS-specific electronics, a layer this manual does not otherwise cover |
| Traction Off Light | Traction Assist System **[document-only]** |
| Engine Coolant Temperature Gage | Cooling loop (Part 5.4, Part 16.4) |
| Transmission Temperature Gage | Automatic transmission thermal state (Part 7.1) |
| Oil Pressure Gage | Engine lubrication (Part 5.9) |
| Four-Wheel-Drive Light | Transfer-case engagement state (Part 7.2) |
| Tow/Haul Mode Light | A drivetrain regime selector, not a fault indicator |
| Low Fuel Warning Light | Fuel entity (Part 5.4, Part 5.9) |

Only the MIL connects to the provable software ontology. Every other light on this list is the truck reporting on a system this document's Parts 5–9 cover but the shipped DTC dictionary does not.

---

# 16. Major Relationship Graphs

## 16.1 Powertrain -> drivetrain graph

- **Combustion** (Part 5.3) produces crankshaft torque
- **Torque** passes through the transmission (Part 7.1, gear-multiplied)
- Through the **transfer case** (Part 7.2) when 4WD is engaged
- Into the **front and/or rear axle** (Part 7.3), which changes torque direction and final ratio
- Out to the **wheels** as motion

A fault anywhere in this chain (a slipping clutch, a worn transfer-case chain, a failing U-joint) can present as "loss of power" indistinguishable, to the driver, from an engine-side cause — but none of it sets a DTC on this platform.

## 16.2 The shared-belt electrical/hydraulic graph

One serpentine belt (Part 5.6) drives:

- the **alternator** (Part 5.7, charging)
- the **power-steering pump** (Part 5.6)
- which also feeds **hydro-boost brake assist** (Part 5.6, recall 04V045000)

This is the single most consequential "hidden" relationship on the whole truck: a belt failure is simultaneously an electrical event, a steering event, and a **braking** event, and the driver may only notice the steering getting heavy — not that brake assist is also degrading.

## 16.3 The dual-boundary gasket graph

The upper intake gasket (Part 5.4) is the air-path seal TSB 05-06-04-029A is about: fuel pools on it, it degrades, and the result the bulletin names is an unmetered air leak with rough idle, misfire, and P0300. The retrieved text does not make it a coolant-path boundary.

## 16.4 The cooling/thermal bridge

- **Combustion heat** (Part 5.3) is absorbed by coolant
- **Coolant** carries it to the radiator, rejected to outside air by the fan
- **Cabin heat** is a tap on the same loop
- **Transmission fluid** (on automatic-equipped trucks) may share a cooler in the same loop

A fault in any one tap (a bad thermostat, a clogged radiator, a failed water pump) reads, to the driver, as "overheating" regardless of which specific component actually failed — Part 9's environmental-regime state and Part 5.4's coolant-path entity both have to be checked before condemning a part.

## 16.5 The evidence-to-fault-class bridge

This is the graph the software ontology actually runs (Part 19):

> **Raw signal (PID) -> Symptom (DTC) and/or Condition (a threshold now) and/or Trend (a pattern over samples) -> Proven fault class -> Cascade watch -> Ranked repair playbook**

Every fault class in Part 19's linked table is exactly this graph, instantiated once per class.

---

# 17. Recommended Reading Order for This Truck

The efficient approach is not to memorize every part number first. Begin with:

> **Identity (Part 0, Part 5.1) — know which VIN and which real facts are actually confirmed**

Then proceed in roughly this dependency order:

1. Identity and provenance discipline (Parts 0, 5.1)
2. Powertrain core (Part 5.3) — everything else depends on understanding combustion and its sensing
3. Fuel, air & emissions (Part 5.4) — the OBD-visible gas path
4. Drivetrain (Part 7) — the least-observed, highest-unknown system; resolve its open items early
5. Chassis, brakes & steering (Part 5.6, Part 16.2/16.3) — where recall-confirmed facts live
6. Electrical & body control (Part 5.7) — the medium every "electricity"-aspect fault runs through
7. Comfort, safety & restraint (Part 5.8) — lower diagnostic urgency, real entities nonetheless
8. Regimes and cascades (Part 12) — how confirmed facts propagate forward
9. Diagnostics & control software (Part 19) — the provable, shipped slice, last, because it only makes sense once the physical entities under it are understood
10. Maintenance & lifecycle (Part 20's checklist) — recalls, TSBs, and the scheduled-service structure

---

# 18. Canonical Vehicle Component Record

Every significant component in this manual can inherit a common schema — the same discipline a universal ontology gives every physical concept, adapted to a wrenchable object:

**Identity**
- name, part-family, RPO code (if applicable)

**Classification**
- parent subsystem, child components, scale (Part 4)

**Physical character**
- material, dimensions, mounting/interface, entity type (Part 5)

**Relations**
- mechanically connected to, electrically connected to, hydraulically/pneumatically connected to, thermally coupled to (Part 16)

**Dynamics**
- normal operating cycle, allowed state transitions (Part 9), characteristic wear timescale

**Energy / Fluid role**
- what it carries, converts, or seals (Part 10, Part 11)

**Convention**
- numbering/bank/cylinder assignment that applies to it, if any (Part 14)

**Measurement**
- is it PID/DTC-observable at all? If yes, which signal; if no, which inspection method (Part 15, Part 19)

**Failure & repair status**
- documented failure modes for *this* platform, ranked repair order, citing the specific recall/TSB if one exists (Part 12, Part 20)

**Provenance**
- one of the six tags in Part 0's legend, on every non-obvious claim

This schema is exactly why Parts 5–9 above read the way they do — every entity was written by filling in this record, not by free-associating facts about "old GM trucks."

---

# 19. This Truck Within the Larger Auto-Architect System

With this document as the physical foundation, the larger knowledge architecture around this specific VIN becomes:

> **This Ontology (whole-truck, all components)**
> -> **Owner's manual + factory service literature** (capacities, procedures, torque specs — not reproduced here to avoid guessed numbers)
> -> **Curated OEM knowledge** (`packages/ontology/known-campaigns.json` — 3 NHTSA-primary recalls, 2 corroborated TSBs)
> -> **Software-provable diagnostic ontology** (`packages/ontology/dl-ontology.json`, `generic` view — SAE-portable fault classes only)
> -> **GM-specific framing** (`packages/cartridges/src/gm-vortec-6.0-stub.ts` — re-frames `KnockSensorCircuitFault` and `LeanFuelBank1`/`LeanFuelBank2` from the two corroborated TSBs; no new OEM-only class exists yet)
> -> **Applied trace for this VIN** (`docs/silverado-2500hd-field-manual.html` — the two GM cause chains, corrected bank map, quick-trace index)
> -> **Live evidence** (an actual OBDLink MX+ session against `veh:silverado-2500hd-2003`)

This should not be read as "every level trivially reduces to the level below." The software ontology *deliberately* proves less than this document describes — it only claims what SAE J1979/J2012 signals and curated OEM text can actually support (`docs/ai/OEM_RESEARCH_SOURCES.md`'s discipline). The gap between "what this document describes" and "what the software proves" is not a bug to close; it is the honest boundary between *general vehicle knowledge* and *evidence the PCM can actually produce*.

For the DTC-by-DTC table, the AEMF aspect tags, and the two GM cause chains applied step by step, see `docs/silverado-2500hd-field-manual.html` rather than duplicating that table here.

---

# 20. Canonical Definition

> **This vehicle is a physical system of structural, powertrain, drivetrain, chassis, electrical, and comfort/safety components, joined by mechanical, electrical, hydraulic, pneumatic, thermal, and chemical interactions, operated across a small set of states and regimes, a minority of which is directly observable through standardized on-board diagnostics — the remainder reasoned about through inspection, cascade rules, and documented failure history.**

The truck can therefore be summarized as:

> **This Vehicle = Structure + Powertrain + Drivetrain + Chassis/Brakes/Steering + Electrical/Control + Comfort/Safety + Fluids, operated across Regimes, observed partially through Measurement, and reasoned about through Rules and Provenance**

---

# 21. Final Master Map — Every System, One Truck

**IDENTITY**
- Chevrolet Silverado 2500 HD, 2003, extended-cab pickup **[VIN-verified]**
- LQ4 (Vortec 6000) 6.0L V8, gasoline, 4WD, GVWR class 2H **[VIN-verified]**
- Pontiac, MI assembly plant **[VIN-verified]**
- Trim (LS/LT/WT), exact RPO set **[open]**

**POWERTRAIN CORE**
- Cast-iron block, aluminum heads, OHV pushrod **[platform-typical]**
- 8 coils, 8 injectors, 2 knock sensors (valley, front/rear) **[platform-typical]**; bulletin 02-06-04-023A names only the rear sensor, through 2002
- No physical EGR valve or secondary-air pump on this engine as built in 2003 **[corroborated]**

**FUEL, AIR & EMISSIONS**
- Upper intake gasket as an air-path seal (unmetered air, P0300; L59 titled, LQ4 may apply) **[corroborated — TSB 05-06-04-029A]**
- EVAP canister/purge/vent, 2 catalytic converters, 4 oxygen sensors **[platform-typical]**

**DRIVETRAIN**
- Transmission: one of 4L80-E / 5-spd manual / ZF S6-650 / Allison 1000 **[open — Part 7.1]**
- Transfer case: NV261HD or NV263HD, part-time, 32-spline, no Auto-4WD **[platform-typical / corroborated]**
- Front axle: AAM 9.25 in IFS (independent) **[platform-typical]**
- Rear axle: AAM 11.5 in full-floating; ratio and locker via RPO **[platform-typical / open]**

**CHASSIS, BRAKES & STEERING**
- Torsion-bar front, leaf-spring rear **[platform-typical]**
- Hydro-boost brake assist, fed by the power-steering pump **[NHTSA-primary — recall 04V045000]**
- Shared serpentine belt drives alternator + power steering + brake assist **[platform-typical — Part 16.2]**

**ELECTRICAL & BODY CONTROL**
- Single battery, single alternator, PCM, wiring harness **[platform-typical]**
- Tailgate support cables (named recall entity) **[NHTSA-primary — recall 04V129000]**
- Parking-brake friction linings, conditional on manual transmission **[NHTSA-primary, conditional — recall 05V161000]**

**COMFORT, SAFETY & RESTRAINT**
- Air bags + passenger sensing, safety belts, LATCH anchors **[document-only]**
- Dual climate control, Driver Information Center **[document-only]**
- Traction Assist System, locking rear axle option **[document-only / RPO-gated]**
- QUADRASTEER four-wheel steering — offered on 1500/1500HD this model year, **not** on the 2500HD; appears in this model line's combined owner's manual but does not apply to this truck **[document-only, explicitly not applicable]**

**FLUIDS**
- Engine oil, coolant, power-steering fluid, brake fluid, gasoline **[VIN-verified fuel type; capacities open]**
- Transmission, transfer-case, and axle fluids — type depends on the open transmission/axle identity

**MAINTENANCE & LIFECYCLE**
- 3 confirmed NHTSA recalls (04V045000, 04V129000, 05V161000 conditional) **[NHTSA-primary]**
- 2 corroborated GM TSBs (02-06-04-023A: 1999–2002 P0332 rear sensor, not a listed year for this 2003; 05-06-04-029A: L59 rough idle / P0300, LQ4 may apply) **[corroborated]**
- Owner's manual Part A–E maintenance structure: scheduled services, owner checks, periodic inspections (steering/suspension, exhaust, fuel system, cooling, throttle, transfer case & front axle, brakes), fluids/lubricants, maintenance record **[document-only structure, real section names]**

**DIAGNOSTICS & CONTROL SOFTWARE**
- `generic` DL view — SAE-portable fault classes only, no OEM-only class yet
- `gm-vortec-6.0-stub.ts` — GM framing on two existing classes, from the two corroborated TSBs above
- Full DTC table, AEMF aspects, and cascade edges: `docs/silverado-2500hd-field-manual.html`

The result is not a stack of disconnected chapters. It is a **multi-scale ontology of one specific truck**, viewed through different levels of resolution — from a single connector's corrosion state up through the cascades that connector can start, and down through the six-tag provenance discipline that keeps every claim honest about how well it is actually known.
