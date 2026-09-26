# OEM_RESEARCH_SOURCES.md

Where to find real VIN, recall, and TSB data for `known-campaigns.json` /
`vehicle-profiles.json`, and how to cite it. For AI assistants and human
contributors alike — read this before researching a new vehicle, campaign, or
TSB, and add to it when a session finds something new (or finds an old entry
stale — bot-protection and DNS reachability drift over time).

Compiled 2026-09-26 while verifying the Jeep Renegade's W80/W84/MultiAir
entries and building out the Silverado 2500HD's profile and recalls from its
VIN. Every URL pattern below was actually exercised that session; the
"blocked" ones were actually hit and failed, not guessed at.

## The rule this exists to serve

[`AI_CODING_RULES.md`](AI_CODING_RULES.md) and the `known-campaigns.json`
schema comments both say it plainly: **never invent a TSB number, VIN
decode, or recall detail.** Every `CampaignEntrySchema` / `TsbEntrySchema`
row requires `sourceType` (`"primary"` | `"corroborated"`) and a `source`
URL — see [`ONTOLOGY_DEV_GUIDE.md`](ONTOLOGY_DEV_GUIDE.md). This doc is the
"how" behind filling those two fields honestly:

- **`"primary"`** — you fetched the actual OEM/NHTSA document text, or the
  claim comes straight from a live official government API/database record
  (the API response *is* the primary source; no PDF needed).
- **`"corroborated"`** — you could not reach the primary document, but
  multiple independent secondary sources agree on the specifics (exact
  bulletin number, exact DTCs, exact affected engines/VIN codes). Say so in
  `reference`, and expect [`CausalBriefPanel.tsx`](../../apps/web-ui/src/components/CausalBriefPanel.tsx)
  to render a "corroborated, not primary-verified" badge on it.

If you can't get above "corroborated" after a genuine multi-angle search
(see the recipe below), that's a fine place to stop — just label it
honestly rather than either inventing a primary source or skipping the
finding entirely.

## Primary sources (government, verified working)

| Source | URL pattern | Returns | Notes |
|---|---|---|---|
| NHTSA vPIC VIN decoder | `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/{VIN}?format=json` | Make, Model, ModelYear, Series, BodyClass, EngineModel, DisplacementL, EngineCylinders, DriveType, GVWR, FuelTypePrimary, Plant City/State/Country, check-digit validation | No API key. Works via `curl` and `WebFetch` alike. This is the real VIN decode — trust it over guessing at VIN position tables by hand. |
| NHTSA recalls — list by vehicle | `https://api.nhtsa.gov/recalls/recallsByVehicle?make={MAKE}&model={MODEL}&modelYear={YEAR}` | Array of `{NHTSACampaignNumber, Component, Summary, Consequence, Remedy}` | `model` wants the bare model name only (`SILVERADO`, not `SILVERADO 2500HD`) — a qualified model string 400s. |
| NHTSA recalls — campaign detail | `https://api.nhtsa.gov/recalls/campaignNumber?campaignNumber={CAMPAIGN}` | One row per affected Make/Model/ModelYear: `Manufacturer`, `PotentialNumberofUnitsAffected`, `ReportReceivedDate`, `Notes` (often has the OEM's own internal recall number), full `Summary`/`Consequence`/`Remedy` | Filter `results` to your exact make/model/year before trusting a match — the same campaign number often spans many vehicles across years. |
| NHTSA static TSB/bulletin PDF archive | `https://static.nhtsa.gov/odi/tsbs/{year}/{DOC-ID}.pdf` | The actual scanned OEM dealer service bulletin / customer satisfaction notification | `{year}` is the year NHTSA filed the doc, not necessarily the bulletin's own issue year or the vehicle's model year. `{DOC-ID}` (e.g. `MC-10220586-9999`) can't be guessed — find it via web search first, then fetch directly. No directory listing (raw S3; a bare year-folder request 404s with `NoSuchKey`). |
| NHTSA static recall-notice PDF archive | `https://static.nhtsa.gov/odi/rcl/{year}/{DOC-TYPE}-{campaign}-{id}.pdf` | Owner notification letters, dealer repair instructions, Part 573 reports | Document-type prefixes seen: `RCAK` (owner letter), `RCRIT` (dealer/critical repair instructions), `RCONL` (owner notice variant), `RCLRPT` (Part 573 safety recall report). |
| NHTSA Manufacturer Communications (TSBS) dataset docs | `https://static.nhtsa.gov/odi/ffdd/tsbs/TSBS.txt` | Plain-text field-layout documentation for NHTSA's bulk TSB dataset | This is only the README. The actual CSV/TSV bulk files it describes are **not** on this host (checked several plausible filenames under the same path — all 404) — they live on a blocked host, see below. |

## Known blockers — don't re-attempt these without cause

Save a future session the trouble; these were actually hit, not assumed:

| Host / path | What it would give you | What actually happens |
|---|---|---|
| `www.nhtsa.gov` (`/recalls`, `/vehicle`, `/vin-decoder`, the TSB search UI) | The consumer-facing recall/TSB search, incl. searching older bulletins by keyword | **403 on every path tested, including the bare homepage.** This is bot/WAF protection (Cloudflare-style), not a sandbox network policy — more egress access will not fix it. Use the `api.nhtsa.gov` / `static.nhtsa.gov` endpoints above instead. |
| `www-odi.nhtsa.dot.gov` (`/downloads/flatfiles.cfm`, `/downloads/folders/TSBS/FLAT_TSBS.zip`, `/acms/cs/documentList.xhtml`) | The actual bulk TSB dataset (would let you look up a bulletin number's exact filename directly instead of guessing via search) and the individual-document viewer | **DNS does not resolve** (`getaddrinfo ENOTFOUND`) from this sandbox — confirmed via both `curl` and `WebFetch`. Not on the reachable-host allowlist. |
| `static.nhtsa.gov` directory listing (e.g. `/odi/tsbs/2002/`) | Browsing a year's bulletins without already knowing the filename | It's a plain S3 bucket with listing disabled — returns an XML `NoSuchKey` error. You must already have the exact filename (from search) before fetching. |

If either blocked host ever becomes reachable, re-verify the two
`sourceType: "corroborated"` GM TSB entries in `known-campaigns.json`
(`02-06-04-023A`, `05-06-04-029A`) against the real bulk dataset or document
viewer and upgrade them to `"primary"`.

A 2026-09-26 pass found transcriptions and used them to correct the rows.
They are still not primary. `02-06-04-023A` now cites
[jimfancher’s Sierra page](http://www.jimfancher.com/sierra/p0332.htm),
which matches a Corvette Action Center repost and an Underhood Service tech
tip: 1999–2002 trucks, P0332 only, rear sensor P/N 10456603, RTV bead left
open at the rear. This profile is a 2003. An Amazon kit listing had been
the source and had bundled intake gaskets the bulletin does not list.
`05-06-04-029A` now cites an [Operation CHARM transcription](https://charm.li/Chevrolet/2003/Silverado%20SS%20AWD%20V8-6.0L%20VIN%20N/Repair%20and%20Diagnosis/Powertrain%20Management/Technical%20Service%20Bulletins/By%20Symptom/Customer%20Interest/Engine%20-%20Rough%20Idle%2FMisfire%2FMIL%20ON%2FDTC%20P0300/)
(a second CHARM page, 2004 Express VIN U, agreed). Full-page fetch returned
504; the row is from search-index excerpts. Named complaint is rough idle,
misfire, and P0300 on L59, with LQ4 VIN U in a may-apply sentence. The
excerpt does not name P0171, P0174, or a coolant leak. Do not copy a warpage
limit in from a separate service-manual page.

## A research draft that does not close specs

A 2026-09-26 whole-truck draft (the file the operator saved as a deep-research report) has a section “Missing Numerical Parameters & Provenance.” It lists engine torques, oil-filter torque, coolant-cap pressure, fan-clutch temperature, starter draw, fuse amperages, transmission capacity, oil pressure, and cam offset, and it marks every one **unspecified**. It also writes the truck as an 8.1L L18. This profile is the VIN-confirmed LQ4 6.0. Do not treat that draft as a `source` for a campaign, a torque, or a capacity. The open list is recorded in the field manual (Part 10) and in the pretty-print ontology (section 6.1). Close a row only after the LQ4 / this-VIN page of a service manual or schematic is actually read, and tag it `primary` only then.

## Secondary / corroborating sources

Use these only after a genuine attempt at the primary sources above comes up
empty (older, pre-~2010 scanned bulletins are indexed far less reliably than
recent ones). Tag anything sourced only from this tier as
`sourceType: "corroborated"` and name what corroborated it in `reference` —
don't just cite one forum post as if it settles the question; look for
independent agreement (a parts vendor citing the same bulletin number *and*
a technician describing the same repair *and* the DTCs matching is much
stronger than any one alone).

| Source | Best for | Caveat |
|---|---|---|
| [JustAnswer.com](https://www.justanswer.com) | Technicians sometimes transcribe actual OEM bulletin text/tables verbatim in an answer | Paid Q&A site — verify the transcription is specific (part numbers, exact tables), not a paraphrase |
| eBay / Amazon parts listings | Confirming a bulletin number is real and its rough scope — repair-kit vendors cite the exact TSB # + DTC for marketing/compliance | Never a source for full bulletin text, only for "this number exists and covers roughly this" |
| [FullSizeChevy.com](https://fullsizechevy.com) | GMT800/LS-platform-specific technical writeups | Enthusiast site, not OEM |
| [SilveradoSierra.com](https://www.silveradosierra.com), [GM-Trucks.com](https://www.gm-trucks.com), [GMFullSize.com](https://www.gmfullsize.com) | Real-world diagnostic threads for a specific platform; gauging how widely-reported an issue is | Forum consensus, not documentation |
| [Go-Parts.com](https://www.go-parts.com) `/garage/obd-XXXX-...` | Structured per-DTC, per-vehicle cause/fix reference pages | Consumer-facing summaries, not primary |
| [CarComplaints.com](https://www.carcomplaints.com) | TSB archive + consumer complaint database (used for the FCA/Jeep MultiAir corroboration in the prior session) | Aggregator — check it names the actual bulletin number |
| Model-specific enthusiast forums (Jeep Renegade Forum, Fiat500USAForum, 200Forums, DieselPlace, LS1Tech, …) | Triangulating whether an issue is widely reported vs. a one-off | Same as above — consensus, not documentation |
| [data.transportation.gov](https://data.transportation.gov) / [catalog.data.gov](https://catalog.data.gov) | Discovering that a USDOT/NHTSA bulk dataset exists and reading its field docs | The dataset listing pages work; the actual data endpoints they point to may not (see blockers) |
| Wikipedia | General background/history orientation (e.g. an engine family's history) | Never cite it as the `source` for a campaign/TSB entry — orientation only |
| Claude's built-in `WebSearch` | The actual discovery mechanism behind nearly every URL above | Indexing of older (pre-~2010) scanned NHTSA PDFs is noticeably weaker than recent ones — expect to need several phrasing angles (exact bulletin number, exact DTC, exact distinctive phrases from the document header) before concluding a primary source isn't findable |

## Recipe: verifying a campaign/recall/TSB from scratch

1. **Decode the VIN first** (vPIC) if you have one — don't trust a
   vehicle-profile's engine/trim guess when you can confirm it directly.
2. **Query `recallsByVehicle`** for the make/model/year. Skip anything whose
   `Manufacturer` isn't the actual OEM (aftermarket-parts voluntary recalls
   show up here too — a headlamp or bedliner manufacturer, not the OEM,
   means it only applies if that aftermarket part was installed).
3. **Confirm each candidate with `campaignNumber`**, filtering `results` to
   your exact make/model/year — the population size and manufacturer's own
   recall number live here too.
4. **For TSBs**, search for the exact bulletin number / DTCs / distinctive
   header phrases against `static.nhtsa.gov`. If you get a hit, fetch the
   PDF directly (`WebFetch` saves it locally; large ones need `Read` with a
   `pages` range) and read it — don't rely on a search engine's paraphrase.
5. **If no primary document surfaces**, widen to the secondary-source table
   above and look for independent agreement across at least two source
   *types* (e.g. a parts vendor + a technician transcription), not just
   multiple forum posts repeating each other.
6. **Write the ontology entry honestly**: `sourceType: "primary"` only if
   you actually read the document/API record yourself; `"corroborated"`
   otherwise, with `reference` explaining what corroborated it and what you
   tried and couldn't reach.
7. **Tie `relatedClasses` to an existing DL fault class** where the DTCs
   already have one (check `dl-ontology.json`'s `generic` view first) —
   most GM/Vortec-era DTCs already have an SAE-generic class; you usually
   don't need a new OEM-specific class or view just to cite a TSB.
