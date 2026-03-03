# מצאו מקלט — Jerusalem Shelter Finder

A zero-cost static PWA that helps Jerusalem residents find the nearest public bomb shelter (מקלט) during an emergency.

**Live:** https://niryariv.github.io/jlm-shelters/

---

## What it does

- **Interactive map** of 544 shelters across Jerusalem (Leaflet + OpenStreetMap)
- **GPS "Find Nearest"** — locates your position and highlights the closest shelter with walking distance
- **Filter** by type: public shelter, protected parking, school shelter, wheelchair-accessible
- **Detail sheet** — pull-up panel with address, capacity, accessibility info, and one-tap navigation to Waze or Google Maps
- **Works offline** — Service Worker caches all assets after first load
- **Hebrew-first, RTL** — full right-to-left layout with bilingual labels

## Data

544 shelters sourced from the **Jerusalem Municipality** open data (`jerusalem.muni.il/he/residents/map/?ids=2488`):

| Type | Count |
|------|-------|
| Public shelters (מקלט ציבורי) | 149 |
| Protected parking (חניון מוגן) | 49 |
| School shelters (בית ספר) | 346 |
| **Total** | **544** |

363 shelters are wheelchair-accessible. Data last updated February 2026.

> **Not an official government service.** Follow official Home Front Command (פיקוד העורף) instructions during emergencies: [oref.org.il](https://www.oref.org.il)

## Tech stack

| Layer | Choice | Cost |
|-------|--------|------|
| Hosting | GitHub Pages | $0 |
| Map tiles | OpenStreetMap via Leaflet 1.9.4 | $0 |
| Fonts | Google Fonts (Frank Ruhl Libre, Heebo, Azeret Mono) | $0 |
| Backend | None | $0 |
| Database | None — data is a static JS file | $0 |

**Total monthly cost: $0.**

No build tools, no npm, no framework. Pure HTML + CSS + ES modules.

## Files

```
index.html    — App shell (RTL, PWA meta, Leaflet CDN links)
styles.css    — Dark theme, flex layout, Hebrew typography
app.js        — Map init, geolocation, filtering, drag sheet
data.js       — 544 shelters as an ES module export
sw.js         — Service Worker (cache-first, offline support)
manifest.json — PWA manifest (Add to Home Screen)
icon.svg      — Red shield icon
404.html      — GitHub Pages SPA fallback
```

## Deploy your own copy

```bash
git clone https://github.com/niryariv/jlm-shelters
cd jlm-shelters

# Deploy to GitHub Pages
gh repo create my-shelter-finder --public --source=. --remote=origin --push
gh api repos/YOUR_USERNAME/my-shelter-finder/pages \
  --method POST --input - <<< '{"source":{"branch":"main","path":"/"}}'
```

Live in ~30 seconds at `https://YOUR_USERNAME.github.io/my-shelter-finder/`.

## Update shelter data

Replace `data.js` with a new export. The expected shape per shelter:

```js
{
  id:           "1",           // string
  nameHe:       "מקלט ציבורי מספר 609",
  name:         "מקלט ציבורי מספר 609",
  addressHe:    "ישא ברכה 23, ירושלים",
  address:      "ישא ברכה 23, ירושלים",
  neighborhood: "בוכרים",
  lat:          31.79229011,   // WGS84
  lon:          35.2176755,
  type:         "public",      // "public" | "parking" | "school"
  capacity:     200,
  accessible:   false
}
```

## License

Shelter data: Jerusalem Municipality open data (ODbL).
Code: MIT.
