# Prompt: Pune Home Hunt Dashboard

Paste everything below the line into a coding assistant (Claude Code or similar) in an empty folder.

---

## Goal
Build an interactive, single-file dashboard to log, score and benchmark the apartments I visit in Pune (Baner, Wakad, Pashan and nearby), for a long-term family home where I plan to start a family.

## My situation
- Budget: up to Rs 1.3 Cr. In-hand salary: Rs 1.7 L/month. Cash on hand: Rs 30 L (down payment).
- Wanted: 2, 2.5 or 3 BHK in or near Baner with all basic amenities.
- Must-haves: no electricity or water issues, no waterlogging in monsoon.
- Nearby: schools, hospitals, malls, gardens and the usual metro-city family facilities.
- Compare every property against current market rates for its locality.

## Decisions already made
- Format: plain HTML/CSS/JS, no build step. Chart.js and Leaflet from a CDN. Keep it simple; move to a real app only if live server data is needed later.
- Data entry: in-dashboard add/edit form, saved in `localStorage`, plus JSON export/import for backup.
- Market data: researched from the web, embedded with source and date, easy to edit.
- Localities: Baner, Balewadi, Mahalunge, Wakad, Pashan, Sus, Bavdhan, Aundh, Kothrud, Pimple Saudagar.

## Files
- `index.html`: UI, logic, charts, map.
- `data/localities.js`: `window.LOCALITIES = [...]`.
- `data/properties.js`: `window.SAMPLE_PROPERTIES = [...]`, 3 fictional samples marked `sample:true`, used only on first load.
- `README.md`: short usage notes.

## Dashboard sections
1. **Overview**
   - Affordability panel with editable inputs: salary, cash, budget, loan rate (default 8.5%), tenure (20 yrs), EMI cap (40% of income), stamp duty + registration (7%), GST (5% only if under construction), other one-time costs (Rs 5 L).
   - KPIs: comfortable max price at the EMI cap, EMI cap, EMI at full budget, loan at full budget and all-in cost.
   - Red warning if EMI at budget exceeds 50% of income, amber if above the cap, green otherwise.
   - Bar chart of scores, bar chart of property Rs/sq ft vs locality average, and a ranked shortlist (deal-breakers last) with an issues column.
2. **Properties**
   - Sortable table filterable by locality, BHK, max price and text.
   - Columns: name, locality, BHK, price, carpet, Rs/sqft (saleable), vs-market badge, status, EMI and % of income, score, edit.
   - Add/edit modal, Export/Import JSON, and "Score weights" editor.
3. **Compare**: tick 2 to 4 properties, radar chart over the ratings, side-by-side table.
4. **Map**: Leaflet pins coloured by score (green 75+, amber 55-74, red below 55 or deal-breaker). Locality circles. Use property lat/lng if given, otherwise the locality centre with a small jitter.
5. **Localities**: one card each with rate band, 2/3 BHK price, waterlogging / water / power risk badges, risk note, pros, cons, schools, hospitals, malls, gardens, transport, and source with date.

## Property fields
id, name, builder, locality (key), bhk (2 | 2.5 | 3), price (Rs), carpet (sq ft), sba (saleable sq ft, optional), status (`ready` | `uc`), rera (bool), reraNo, possession, visitDate, broker, nego, lat, lng, link, notes, scores (object of 1-5 ratings; 0 or missing means unknown).

## Scoring
- Score = weighted average of the ratings that were entered, scaled to 0-100.
- Must-haves (weights 10/10/10/8): `water` (no tanker dependency), `power`, `flood` (no waterlogging), `rera` (RERA / OC / clear title). A must-have rated 1 or 2 is a **deal-breaker**: red flag, and the property is ranked below all others regardless of score.
- Other criteria (weights): schools 8, hospitals 8, mall 5, garden 5, transport 6, commute 6, safety 5, amenities 4, builder 5, resale 4.

## Market comparison logic
- Rate = price / saleable area. If `sba` is blank, use carpet x 1.3.
- Compare with the locality `rateMin`, `rateMax` and `rateAvg`. Below min: "below market" (green). Above max: "premium" (red). More than 5% under average: "good value". Otherwise "fair" (amber). Show the % delta vs average.
- EMI formula: standard reducing-balance. Loan = (price x (1 + stamp% + GST%) + other costs) - cash.

## Locality data schema
`key, name, lat, lng, rateMin, rateMax, rateAvg` (Rs per sq ft, saleable), `bhk2, bhk3` (text), `floodRisk, waterRisk, powerRisk` ("low" | "medium" | "high"), `risks` (text), `pros[], cons[]`, `schools, hospitals, malls, gardens, transport` (text), `source, asOf`.

## Researched market data (Oct 2026; portals disagree by 10-30%, so treat as a band and re-verify)
Rs per sq ft, saleable area. "avg only" means only the average was sourced and the band is my estimate.

| Locality | Min | Max | Avg | Flood | Water | Notes |
|---|---|---|---|---|---|---|
| Baner | 10,450 | 14,650 | 11,700 | medium | high | 99acres; Ramnadi flood history; tanker use |
| Balewadi | 9,500 | 12,000 | 11,000 | medium | high | tanker use |
| Mahalunge | 6,450 | 10,000 | 7,500 | medium | high | low confidence, avg only |
| Wakad | 9,250 | 11,000 | 10,100 | medium | high | highway underpass collects water |
| Pashan | 9,000 | 13,000 | 10,600 | high | medium | avg only; Ramnadi |
| Sus | 6,500 | 9,500 | 7,250 | medium | high | avg only |
| Bavdhan | 6,900 | 10,300 | 8,600 | high | medium | Ramnadi; Kothrud-Bavdhan hotspot |
| Aundh | 10,850 | 15,500 | 12,500 | medium | medium | registered 10,850 vs asking 15,539 |
| Kothrud | 13,000 | 17,750 | 13,500 | medium | medium | hotspot ward |
| Pimple Saudagar | 8,000 | 11,650 | 9,750 | low | high | PCMC tanker use |

Key findings to reflect in the risk notes:
- Ramnadi corridor (Bavdhan, Pashan, Baner, Aundh) flooded in 2011 and 2019. Baner, Aundh, Kothrud and Bavdhan are on 2026 waterlogging hotspot lists.
- Baner-Balewadi societies use about 250-300 tankers a day (Rs 1,200-2,000 each in 2026). Wakad tankers cost Rs 1,300-1,500, with drinking water up to Rs 3,000. PCMC societies relied on tankers even after the Pavana dam filled.
- Sources used: 99acres, Square Yards, HexaHome, NoBroker, HomeBazaar, Pune Pulse, Punekar News, Wikipedia (Ramnadi).

## Affordability reality check (the dashboard should surface this, not hide it)
- Rs 1 Cr at 8.5% over 20 yrs gives an EMI of about Rs 86.8k.
- At the full Rs 1.3 Cr budget: all-in cost about Rs 1.44 Cr, loan about Rs 1.14 Cr, EMI about Rs 99k, which is 58% of income.
- Comfortable price at a 40% EMI cap is about Rs 96.6 L.

## Implementation notes and pitfalls
- Section ids and element ids must be unique (a section and the map div both using `id="map"` was a bug; use `mapsec` for the section).
- Escape all user text when building HTML.
- Destroy and recreate Chart.js instances on re-render. Call `map.invalidateSize()` when the map tab is shown.
- Make it usable on a phone-width screen, since it is used during site visits.
- Browser automation tools refuse `file://` URLs. Test with `python3 -m http.server 8765` and open `http://localhost:8765/index.html`.
- Tell the user clearly that market rates are researched estimates and that water and waterlogging ratings must be confirmed on site and with residents.

## Verify before finishing
- Page loads with no console errors; syntax check the scripts with `node --check`.
- EMI check: Rs 1 Cr, 8.5%, 20 yrs gives about Rs 86,782.
- Add, edit and delete a property, reload the page, and confirm it persists. Export then import round-trips.
- Changing price moves the vs-market badge. A must-have rated 1 or 2 triggers the deal-breaker flag. Changing weights changes the ranking.
- Check the Compare, Map and Localities tabs.
