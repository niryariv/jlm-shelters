# Agent Spec: Jerusalem Shelter Finder PWA

Feed this file to a coding agent to recreate the app from scratch in any directory.

---

## What to build

A zero-cost static PWA (no backend, no build tools, no npm for the frontend) that shows all 544 Jerusalem public bomb shelters on an interactive map and lets the user find the nearest one via GPS.

**Deploy target:** GitHub Pages (or any static host — Cloudflare Pages, Netlify free tier, etc.)

---

## Files to create

Eight files total at the project root:

```
index.html
styles.css
app.js
data.js
sw.js
manifest.json
icon.svg
404.html
```

---

## index.html

Requirements:
- `<html lang="he" dir="rtl">` — Hebrew, right-to-left
- Load **Leaflet 1.9.4** from CDN with NO integrity/crossorigin attributes (SRI hashes cause silent failures on some CDN versions):
  ```html
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  ```
- Load Google Fonts: `Frank Ruhl Libre` (weights 400,700,900), `Heebo` (weights 300,400,500,700,800), `Azeret Mono` (weights 400,600)
- Load `app.js` as `<script type="module">` — must come after the Leaflet script
- Link `manifest.json` and `icon.svg`

### DOM structure (in order inside `<body>`):

```
#chrome                       ← flex-shrink:0, holds everything above the map
  #top-bar (header)           ← app name + shelter count badge
  #offline-banner             ← hidden by default, shown when navigator.onLine=false
  #tab-bar (nav)              ← two tabs: מפה (map) and רשימה (list)
  #controls                   ← always-visible: find button + filter chips
    #find-btn (button)
    #filter-row               ← chips: הכל / ציבורי / חניון / בית ספר / ♿ נגיש

#main-content (main)          ← flex:1, fills remaining height
  #view-map.view.active       ← position:absolute, inset:0
    #map                      ← flex:1, the Leaflet map container
  #view-list.view             ← position:absolute, inset:0, overflow-y:auto
    #shelter-list (ul)
    #footer

#sheet-backdrop               ← fixed, z-index:900, semi-transparent overlay
#detail-sheet (aside)         ← fixed, z-index:1000, slides up from bottom
  .sheet-grip                 ← drag handle bar
  #sheet-header               ← shelter name + close button
  #sheet-body                 ← address, badges, distance, nav buttons
    #sheet-address
    #sheet-badges
    #sheet-distance
    #sheet-nav
      #nav-waze  (a)
      #nav-gmaps (a)
```

---

## styles.css

### Critical layout rules

**The map must fill the remaining viewport height.** Use a flex column layout — NOT `calc(100dvh - ...)` which is fragile:

```css
html, body {
  height: 100%;
}
body {
  display: flex;
  flex-direction: column;
  overflow: hidden; /* prevent body scroll; views scroll internally */
}
#chrome {
  flex-shrink: 0;
}
#main-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}
.view {
  position: absolute;
  inset: 0;
  display: none;
  overflow: hidden;
}
.view.active {
  display: flex;
  flex-direction: column;
}
#map {
  flex: 1;
  width: 100%;
  min-height: 0; /* required for flex shrink to work */
}
```

### Z-index hierarchy

Leaflet's internal panes use z-index 200–700. Set accordingly:

```
#chrome:            z-index: 100
#sheet-backdrop:    z-index: 900
#detail-sheet:      z-index: 1000
```

### Design tokens

```css
:root {
  /* Primary action — calm teal */
  --teal:          #3A8FA8;
  --teal-hi:       #4BA3BE;
  --teal-glow:     rgba(58,143,168,0.28);
  --teal-subtle:   rgba(58,143,168,0.12);

  /* Shelter type colors */
  --parking-color: #C4714A;   /* terracotta */
  --public-color:  #5B9EC9;   /* soft blue   */
  --school-color:  #6BA368;   /* sage green  */
  --access-color:  #6BAA8A;   /* soft mint   */

  /* Warm dark backgrounds */
  --bg:        #1A1816;
  --bg-2:      #201E1B;
  --surface:   #272420;
  --surface-2: #302D29;
  --surface-3: #3A3733;
  --border:    #3A3733;
  --border-hi: #4D4A45;

  /* Warm cream text */
  --text:      #F0EBE3;
  --text-2:    #BDB5AC;
  --text-3:    #8A827A;

  --font-display: 'Frank Ruhl Libre', serif;
  --font-ui:      'Heebo', sans-serif;
  --font-mono:    'Azeret Mono', monospace;
}
```

### Detail sheet — slide-up + transition

```css
#detail-sheet {
  position: fixed;
  bottom: 0;
  inset-inline: 0;
  transform: translateY(100%);
  transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
  max-height: 82vh;
  overflow-y: auto;
}
#detail-sheet.open {
  transform: translateY(0);
}
```

On desktop (≥600px):
```css
@media (min-width: 600px) {
  #detail-sheet {
    left: 50%;
    transform: translateX(-50%) translateY(100%);
  }
  #detail-sheet.open {
    transform: translateX(-50%) translateY(0);
  }
}
```

### Marker colors (Leaflet divIcon circles)
- Public shelter: `#5B9EC9` (soft blue — matches `--public-color`)
- Protected parking: `#C4714A` (terracotta — matches `--parking-color`)
- School shelter: `#6BA368` (sage green — matches `--school-color`)

---

## app.js

ES module. Imports `{ shelters }` from `./data.js`.

At module level, before any functions:
```js
// O(1) shelter lookup
const sheltersById = new Map(shelters.map(s => [s.id, s]));

// Cache 6 icons (3 types × 2 highlight states) — avoids per-render allocation
const ICON_CACHE = {};
```

### Key functions

**`initMap()`**
- `L.map('map', { center: [31.7683, 35.2137], zoom: 13 })`
- OpenStreetMap tile layer: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Create a `L.divIcon` circle marker for each shelter (color by type, 13px default, 18px highlighted)
- Bind popup with shelter name, address, type badge, capacity, and a "פרטים ונווט ›" button
- On `popupopen`: delegate click on `.popup-open-detail` to `openSheet(shelter)` — use `{ once: true }` to prevent listener stacking if the same popup is opened multiple times
- Call `map.invalidateSize()` after a 100ms timeout (fixes grey tiles on first render)

**`haversine(lat1, lon1, lat2, lon2)`** → distance in km

**`findNearest()`**
- `navigator.geolocation.getCurrentPosition(...)`
- Sort all shelters by haversine distance from user
- Place a user location marker (pulsing blue circle divIcon)
- Fit map bounds to show user + nearest shelter
- Call `openSheet(nearest)` after 700ms

**`openSheet(shelter)`**
- Populate `#sheet-name`, `#sheet-addr-he`, `#sheet-addr-en`, `#sheet-badges`, `#sheet-distance`
- Set `#nav-waze` href: `https://waze.com/ul?ll=LAT,LON&navigate=yes`
- Set `#nav-gmaps` href: `https://maps.google.com/?q=LAT,LON&travelmode=walking`
- Add `.open` to `#detail-sheet`, add `.visible` to `#sheet-backdrop`

**`closeSheet()`**
- Clear `sheet.style.transform` before removing `.open` (so CSS transition takes over from drag position)

**`initSheetDrag()`** — pull-to-dismiss gesture
- Touch events on the whole sheet; mouse events on grip + header only
- On touchmove: if dragging down (`deltaY > 0`), call `e.preventDefault()` to block scroll
- Clamp translateY to `Math.max(0, delta)` — can't pull upward past resting position
- On release: close if `translateY > 80px` OR `velocity > 0.4 px/ms`; otherwise snap back
- Disable CSS transition during drag (`sheet.style.transition = 'none'`), re-enable on release
- On desktop: use `translateX(-50%) translateY(Ypx)` to preserve horizontal centering

```js
// Read current translateY regardless of any translateX
function getY(sheet) {
  return new DOMMatrix(window.getComputedStyle(sheet).transform).m42;
}

function setY(sheet, y) {
  const clamped = Math.max(0, y);
  const isDesktop = window.innerWidth >= 600;
  sheet.style.transform = isDesktop
    ? `translateX(-50%) translateY(${clamped}px)`
    : `translateY(${clamped}px)`;
}
```

**`switchView(view)`** — toggle `.active` on `.view` sections and `.tab` buttons; call `map.invalidateSize()` when switching back to map

**`setFilter(filter)`** — filter values: `'all' | 'public' | 'parking' | 'school' | 'accessible'`

**`registerSW()`** — `navigator.serviceWorker.register('./sw.js')`

---

## data.js

```js
export const shelters = [
  // 544 objects, one per shelter
  {
    id:           "1",
    nameHe:       "מקלט ציבורי מספר 609",
    name:         "מקלט ציבורי מספר 609",
    addressHe:    "ישא ברכה 23, ירושלים",
    address:      "ישא ברכה 23, ירושלים",
    neighborhood: "בוכרים",
    lat:          31.79229011,
    lon:          35.2176755,
    type:         "public",    // "public" | "parking" | "school"
    capacity:     200,
    accessible:   false
  },
  // ...
];
```

**Data source:** Jerusalem Municipality open data at `jerusalem.muni.il/he/residents/map/?ids=2488`

Export from the municipality portal as CSV. Parse with:
```python
import csv, json

shelters = []
with open('Records.csv', encoding='utf-8-sig') as f:
    for i, row in enumerate(csv.DictReader(f)):
        try:
            lat = float(row['קואורדינטות ציר x'])
            lon = float(row['קורדינטות ציר y'])
        except (ValueError, KeyError):
            continue
        cat = row.get('קטגוריה', '')
        stype = 'parking' if 'חניון' in cat else 'school' if 'ספר' in cat else 'public'
        shelters.append({
            'id': str(i + 1),
            'nameHe': row.get('מספר מקלט', '').strip(),
            'name':   row.get('מספר מקלט', '').strip(),
            'addressHe': row.get('כתובות למפה', '').strip(),
            'address':   row.get('כתובות למפה', '').strip(),
            'neighborhood': row.get('שם השכונה', '').strip(),
            'lat': lat, 'lon': lon,
            'type': stype,
            'capacity': int(row.get("מס' נפשות", 0) or 0),
            'accessible': bool(row.get('נגישות', '').strip() not in ['', 'לא', '-']),
        })

with open('data.js', 'w', encoding='utf-8') as f:
    f.write('export const shelters = ' + json.dumps(shelters, ensure_ascii=False, indent=2) + ';\n')
```

---

## sw.js

Cache-first service worker. Use `self.registration.scope` for all local asset URLs — **not** absolute paths like `/index.html` — so it works on GitHub Pages subpaths like `/jlm-shelters/`.

```js
const CACHE = 'jlm-v2';
const BASE  = self.registration.scope;

const PRECACHE = [
  BASE,
  BASE + 'index.html',
  BASE + 'styles.css',
  BASE + 'app.js',
  BASE + 'data.js',
  BASE + 'manifest.json',
  BASE + 'icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];
```

Fetch strategy:
- OSM tiles (`tile.openstreetmap.org`): network-first, cache on success
- Everything else: cache-first, network fallback
- On navigate fail: serve `BASE + 'index.html'` from cache

---

## manifest.json

```json
{
  "name": "עיר מקלט - Jerusalem Shelter Finder",
  "short_name": "מקלט",
  "description": "Find the nearest bomb shelter in Jerusalem",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#1A1816",
  "theme_color": "#3A8FA8",
  "lang": "he",
  "dir": "rtl",
  "icons": [{ "src": "icon.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

---

## icon.svg

Red shield (`#C62828`) with a white house silhouette inside. Any simple 24×24 SVG works.

---

## 404.html

Required for GitHub Pages SPA fallback:

```html
<!DOCTYPE html>
<html>
<script>sessionStorage.redirect = location.href;</script>
<meta http-equiv="refresh" content="0;URL='./'">
</html>
```

---

## Deploy to GitHub Pages

```bash
git init && git add .
git commit -m "Initial commit"
gh repo create MY_REPO_NAME --public --source=. --remote=origin --push
gh api repos/MY_USERNAME/MY_REPO_NAME/pages \
  --method POST --input - <<< '{"source":{"branch":"main","path":"/"}}'
```

Live at `https://MY_USERNAME.github.io/MY_REPO_NAME/` in ~30 seconds. Cost: $0/month forever.

---

## Common pitfalls

| Pitfall | Fix |
|---------|-----|
| Map doesn't show | Use flex layout for height, not `calc(100dvh - ...)`. Call `map.invalidateSize()` after 100ms. |
| Leaflet script blocked | Do NOT add `integrity=` / `crossorigin=` attributes — SRI hash mismatches silently block the script |
| Detail sheet appears under map | Leaflet panes use z-index up to 700. Set sheet to `z-index: 1000` |
| Service worker breaks on GitHub Pages | Use `self.registration.scope` prefix, not `/` absolute paths |
| Drag + desktop centering breaks | On desktop use `translateX(-50%) translateY(Ypx)` together, not just `translateY` |
| RTL layout breaks map controls | Leaflet controls are LTR; do not set `direction: rtl` on `.leaflet-container` |
| Popup "details" button fires multiple times | `popupopen` fires on every open; use `{ once: true }` on the listener to prevent stacking |
| List card listeners multiply on filter change | Wire click/keydown delegation once on `#shelter-list` parent at boot, not inside `renderList()` |
| Drag grip renders as wide rectangle | Hit-area padding expands the element background; use a transparent container + `::before` pseudo-element for the visual pill |
