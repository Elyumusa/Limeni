# LimaShift — implementation plan

Working name: **LimaShift** ("lima" = to farm, and a Zambian unit of land). Change it freely.

NASA Space Apps 2026 · Challenge: *Field Shift: Adapting Farms with NASA Data* · Solo build · Region: Zambia

---

## 1. What we are building

**One sentence:** a phone-friendly website where a Zambian farmer picks their field, says what they grow now and what they care about, and gets three crop rotations compared side by side, with the NASA evidence behind each one.

**Problem.** Many Zambian smallholders plant maize after maize. That drains soil nitrogen, invites pests such as fall armyworm, and leaves the farm exposed when the rains fail, as in the 2023/24 El Niño drought.

**User.** A smallholder farmer or the extension officer advising them. Limited technical experience, uses a phone, may have a weak connection.

**What the challenge page asks for (our acceptance test):**

- [ ] Uses NASA Earth observation data
- [ ] Combines it with local soil information, crop characteristics and farmer priorities
- [ ] Compares at least 3 rotation strategies, including the existing one
- [ ] For each strategy: why it was suggested, the evidence, the benefits, the information gaps, and the risks needing local review
- [ ] Easy to understand for non-technical farmers
- [ ] Says clearly that it supports, and does not replace, farmer judgment

---

## 2. Features

### Must have (the MVP)

| # | Feature | What the user sees |
|---|---|---|
| F1 | **Pick a field** | Map of Zambia. Tap one of 3 demo locations (stretch: tap anywhere). |
| F2 | **Climate story** | 4–5 plain numbers and 2 charts from 40+ years of NASA data: when the rains start, how much rain you can rely on, dry-spell risk, hot days, the trend. |
| F3 | **Satellite layers** | Toggle NASA map layers: vegetation (wet vs dry season), soil moisture, rainfall. |
| F4 | **Farmer input** | Current rotation (3 seasons, pick crops) and 3 priority sliders: save water, build soil, easy to sell. |
| F5 | **Rotation comparison** | 3 cards side by side: current rotation plus the 2 best alternatives. Each has scores and the why / evidence / benefits / gaps / risks sections. |
| F6 | **Honesty section** | "What this tool can't tell you" and "check with your extension officer". |

### Should have (if on schedule)

| # | Feature |
|---|---|
| S1 | Plain-language summary written by an AI model, with a fixed-template fallback if the API is down |
| S2 | Soil snapshot (pH, texture, organic carbon) from iSDAsoil or SoilGrids, saved for the demo locations |
| S3 | Tap anywhere in Zambia (live NASA POWER request, about 10–20 seconds) |
| S4 | Bemba / Nyanja toggle for the summary |
| S5 | Installable on a phone home screen (PWA) |

### Not building (say so under "future work" in the slides)

User accounts · a trained AI model · ECOSTRESS · map-wide dataset merging · field-boundary drawing · multi-season crops like cassava

---

## 3. Data sources

| Need | Source | How we get it | Status |
|---|---|---|---|
| Daily rainfall, 1981 to now | **CHIRPS** (satellite + rain gauges, ~5 km) through **NASA SERVIR ClimateSERV** | Free API, no login. `npm run data` saves results into the project. | Working |
| Daily max/min temperature, root-zone soil wetness | **NASA POWER** | Free API, no login, same script | Working |
| Vegetation, soil moisture, rainfall map layers | **NASA GIBS** (MODIS NDVI, SMAP, GPM IMERG) | Ready-made map tiles, no login | Working |
| Crop rainfall, temperature and pH needs | **FAO ECOCROP** database | Copied into `src/data/crops.ts`, record codes noted | Verified |
| Soil pH, texture, organic carbon | iSDAsoil or SoilGrids | Look up once for demo locations and save | To do (S2) |
| Crop prices | Ministry of Agriculture (Zambia) Market Bulletin No. 020430, national average market prices, June–August 2025, as the default; farmers can enter their own current and expected prices | Typed into `src/data/crops.ts`; farmer prices in the browser | Done for 8 crops; none found for cowpea, pigeon pea, cotton |
| Crop yields | Zambia Crop Forecasting Survey 2024/25 (Ministerial Statement, 10 June 2025); sweet potato from FAO / ZamStats IAS 2023/24 | Typed into `src/data/crops.ts` | Done for 8 crops |
| Days to maturity | Zambian variety lists (ISSD Africa 2017; Kagezi Seeds) | Typed into `src/data/crops.ts` | Done for 5 crops |

**Known limits to state openly:** rainfall is a satellite estimate for about 5 km and temperature for about 50 km, so both describe the area, not the exact field. Crop values are general, not variety-specific.

**Why CHIRPS for rainfall:** we compared three sources for Sinazongwe. NASA POWER's model rainfall missed the 2023/24 drought (754 mm, above normal). IMERG through POWER shows an unexplained drop from late 2020. CHIRPS shows both known droughts (2018/19: 366 mm, 2023/24: 488 mm with a 37-day dry spell) and matches Zambia's official rainfall zones. This comparison is worth a slide.

---

## 4. How it fits together

```
NASA POWER API ──(npm run data)──> src/data/climate/<location>.json
                                          │
src/lib/climate.ts   season numbers ──────┤
src/data/crops.ts    crop table ──────────┼──> src/lib/rotation.ts ──> comparison cards
farmer input         rotation + priorities┘         (scores + reasons)
NASA GIBS tiles ─────────────────────────────> map layers
```

- **Stack:** Next.js (TypeScript), Tailwind, Leaflet for the map, Recharts for charts.
- **No database.** Everything is files plus browser state.
- **Demo data is saved in the project**, so the live demo never depends on a slow API.

Key files:

| File | Purpose |
|---|---|
| `src/data/locations.ts` | The 3 demo locations |
| `scripts/build-climate.ts` | Fetches NASA POWER and writes the climate files |
| `src/lib/climate.ts` | Turns daily data into season numbers |
| `src/data/crops.ts` | Crop table |
| `src/data/gibs.ts` | NASA map layer settings |
| `src/lib/rotation.ts` | Rotation scoring (**to build**) |
| `src/components/` | Map, climate story, input form, comparison cards |

---

## 5. Season numbers (already implemented)

A season runs 1 July to 30 June and is named by its starting year.

| Number | Definition |
|---|---|
| Rain onset | First day from 1 Oct with 20 mm or more over 3 days, not followed by a 10-day dry spell in the next 30 days |
| Season end | First 20-day dry run starting after 1 March |
| Season length | Onset to season end, in days |
| Season rainfall | Total, 1 Oct to 30 Apr |
| Reliable rainfall | The amount reached in 4 seasons out of 5 (20th percentile) |
| Mid-season dry spell | Longest run of days under 1 mm in January–February |
| Hot days | Days above 32 °C, December–March |
| Drought season | Rainfall under 75% of the long-term median |
| Trend | Straight-line change per decade |

---

## 6. Rotation scoring (to build — keep it this simple)

A rotation is 3 seasons of crops, for example maize → soybean → groundnut.

**Step 1 — is each crop suited to this field?** Score 0–100 from:

- Water: the FAO EcoCrop rainfall rule applied to every past season (0 below the crop's absolute minimum, 1 inside its ideal range), then averaged
- Season: crop's days to maturity vs the field's reliable season length
- Heat: field's hot days vs the top of the crop's ideal temperature range (ECOCROP)
- Soil pH (once soil data is in)

**Step 2 — score the whole rotation, 0–100 each:**

| Score | Rule |
|---|---|
| Water risk | Share of past seasons where rainfall fell below each crop's minimum need |
| Soil health | Legumes add nitrogen, heavy feeders remove it; deep roots and ground cover add points |
| Pest break | Penalty for the same crop family two seasons in a row |
| Easy to sell | Rough 1–3 market rating per crop, until real prices and yields are added |

**Step 3 — rank.** Weight the four scores by the farmer's priority sliders. Show the current rotation plus the top 2 alternatives that differ from each other.

**Step 4 — explain.** Every score keeps a list of plain reasons with the numbers that produced it ("soybean needs at least 450 mm; this field got that in 41 of 45 seasons"). The cards print those reasons. This is the "evidence" the challenge asks for, and it is why we use rules, not a black-box model.

---

## 7. Build phases

Each phase ends with something that works. Do not start a phase until the one before it is done.

### Phase 0 — Foundation (starter project) ✅
- [x] Project scaffolded, runs locally
- [x] NASA POWER fetch script and saved data for 3 demo locations
- [x] Season calculations
- [x] Map with demo locations and NASA satellite layers
- [x] Climate story panel
- [x] Starter crop table

### Phase 1 — Verify the science (before or at the start of the event, ~4 h)
- [x] Rainfall, temperature and pH needs in `src/data/crops.ts` replaced with FAO ECOCROP values
- [x] Days to maturity checked against Zambian variety lists for groundnut, sorghum, pearl millet, sunflower, pigeon pea
- [ ] Still unverified: days to maturity for maize, soybean, cowpea, common bean, cotton, sweet potato (ask an extension officer or check SeedCo / ZARI catalogues); dry-spell tolerance ratings; the 1–3 market rating
- [x] Fix the 2023/24 drought gap: rainfall switched from NASA POWER to CHIRPS
- [x] Add prices (8 crops) and yields (6 crops) from official sources
- [x] Normal-season yields: Crop Forecasting Survey 2024/25 (Minister's statement to Parliament, 10 June 2025) for 7 crops
- [ ] Still missing: farm-gate prices (only market prices found); prices for cowpea, pigeon pea, cotton; yields for pearl millet, pigeon pea, cotton
- [ ] Talk to one farmer or extension officer; write down what they'd want

**Done when:** you would be comfortable defending every number to a judge.

### Phase 2 — Rotation engine (~6 h)
- [x] `src/lib/rotation.ts`: crop suitability, rotation scores, ranking, reasons
- [x] Quick test script (`npm run check`): print the top rotations for each demo location and check they make agronomic sense (drier south should favour sorghum, millet, cowpea; wetter north should not)

**Done when:** results for the 3 locations look sensible and differ from each other.

### Phase 3 — Farmer flow (~10 h)
- [x] Input form: current rotation pickers and 3 priority sliders
- [x] Comparison cards with scores and the five explanation sections
- [x] Honesty section
- [x] "Just starting out" path (compares against maize every season) and "Nothing (land rested)" season option
- [x] Beginner-friendly page: photo hero, "What is crop rotation?" explainer with a live example, numbered steps 1–4
- [ ] Phone layout check on a real phone

**Done when:** you can go from picking a field to reading 3 compared rotations on a phone, with no dead ends. **This is the MVP. Everything after is extra.**

### Phase 4 — Extras, in this order (~6 h, stop when time runs out)
- [x] S1 AI summary with fallback (`/api/summary`, DeepSeek `deepseek-flash`; needs `DEEPSEEK_API_KEY`, otherwise shows the standard summary)
- [x] S2 Farmer's soil: type in pH (water or CaCl₂), texture, drainage, organic carbon or fertility, or upload a photo / PDF of a soil test (read by DeepSeek, checked by the farmer). Scored with FAO ECOCROP pH, texture, fertility and drainage limits
- [x] Small screens: checked at 320 px; price list stacks, larger tap targets, compact step headers
- [ ] Optional later: SoilGrids / iSDAsoil estimate for farmers with no soil information
- [ ] Map legends for the satellite layers
- [x] S3 Tap anywhere in Zambia, plus place search with autocomplete (Photon / OpenStreetMap). Live CHIRPS + NASA POWER via `/api/climate`; takes 20 s–2 min because ClimateSERV is a queue
- [x] Farmer-entered crop prices, now and expected at harvest, saved on the device; change the rough value, not the ranking
- [ ] S4 Local language toggle
- [ ] S5 PWA

### Phase 5 — Submission (last 8 h, protected)
- [ ] Deploy to a public link (Vercel)
- [ ] Record the demo video
- [ ] Slides: problem → farmer → demo → data and method → limits → future work
- [ ] Project page text, list every dataset used
- [ ] Public code repository link

---

## 8. Demo script (build towards this)

1. "In 2024, drought wiped out much of Zambia's maize." Show Sinazongwe's chart: 2023/24 is a marked drought season with a 37-day dry spell.
2. Tap the field. Read the climate story: the rains, the dry spells, the trend.
3. Switch the satellite layer from wet season to dry season vegetation.
4. Enter maize → maize → maize, set "build soil" high.
5. Show the 3 cards. Read one "why" and one "risk".
6. End on the honesty section and the farmer quote.

---

## 9. Risks

| Risk | What we do |
|---|---|
| Crop numbers are wrong | Phase 1 verification, sources listed in the app |
| NASA API slow or down during judging | Demo locations use saved data |
| Running out of time | Phases 0–3 are the product; Phase 5 hours are never borrowed |
| Rules on code written before the event | Check the Space Apps rules; if needed, rebuild from this plan during the event |
| Advice taken as a guarantee | Honesty section, and "check locally" on every card |
