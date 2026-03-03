/**
 * Jerusalem Shelter Finder — app.js
 * Pure ES module. No build tools.
 */

import { shelters } from './data.js';

// ── State ──────────────────────────────────────────────
const state = {
  map:            null,
  markers:        {},       // id → L.marker
  userMarker:     null,
  userLatLon:     null,     // { lat, lon }
  activeFilter:   'all',
  activeView:     'map',
  activeShelter:  null,
  sorted:         [...shelters],
};

// ── Haversine distance (km) ─────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R   = 6371;
  const rad = d => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(km) {
  return km < 1 ? Math.round(km * 1000) + ' מ\'' : km.toFixed(1) + ' ק"מ';
}

// ── Marker icons ────────────────────────────────────────
function makeIcon(shelter, highlight = false) {
  const color = shelter.type === 'parking' ? '#E53935'
              : shelter.type === 'school'  ? '#66BB6A'
              : '#42A5F5';
  const sz = highlight ? 18 : 13;
  const bw = highlight ? 3  : 2;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${sz}px;height:${sz}px;
      background:${color};
      border:${bw}px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.6);
      ${highlight ? 'animation:nearest-pulse 1.5s ease-in-out 3;' : ''}
    "></div>`,
    iconSize:    [sz, sz],
    iconAnchor:  [sz / 2, sz / 2],
    popupAnchor: [0, -(sz / 2 + 4)],
  });
}

// ── Popup HTML ──────────────────────────────────────────
function popupHTML(s) {
  const typeLabel = s.type === 'parking' ? 'חניון מוגן'
                 : s.type === 'school'  ? 'בית ספר'
                 : 'מקלט ציבורי';
  const typeCls   = s.type === 'parking' ? 'badge-parking'
                 : s.type === 'school'  ? 'badge-school'
                 : 'badge-public';
  return `
    <div class="popup-inner">
      <div class="popup-name">${s.nameHe}</div>
      <div class="popup-address">${s.addressHe}</div>
      <div class="popup-meta">
        <span class="badge ${typeCls}">${typeLabel}</span>
        <span class="badge badge-capacity">👥 ${s.capacity}</span>
        ${s.accessible ? '<span class="badge badge-access">♿</span>' : ''}
      </div>
      <button class="popup-open-detail" data-id="${s.id}">פרטים ונווט ›</button>
    </div>`;
}

// ── Map init ────────────────────────────────────────────
function initMap() {
  const map = L.map('map', {
    center:      [31.7683, 35.2137],
    zoom:        13,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  state.map = map;

  shelters.forEach(s => {
    const m = L.marker([s.lat, s.lon], { icon: makeIcon(s) });
    m.bindPopup(popupHTML(s), { maxWidth: 270, closeButton: true });
    m.addTo(map);
    state.markers[s.id] = m;
  });

  // Delegate popup button clicks
  map.on('popupopen', e => {
    const btn = e.popup.getElement()?.querySelector('.popup-open-detail');
    if (btn) {
      btn.addEventListener('click', () => {
        const s = shelters.find(x => x.id === btn.dataset.id);
        if (s) openSheet(s);
      });
    }
  });

  // Invalidate size after DOM is ready (fixes "grey tiles" on first render)
  setTimeout(() => map.invalidateSize(), 100);
}

// ── Filter helpers ──────────────────────────────────────
function filtered() {
  return state.sorted.filter(s => {
    if (state.activeFilter === 'all')       return true;
    if (state.activeFilter === 'public')     return s.type === 'public';
    if (state.activeFilter === 'parking')    return s.type === 'parking';
    if (state.activeFilter === 'school')     return s.type === 'school';
    if (state.activeFilter === 'accessible') return s.accessible;
    return true;
  });
}

function syncMarkers() {
  const visible = new Set(filtered().map(s => s.id));
  shelters.forEach(s => {
    const m = state.markers[s.id];
    if (!m) return;
    if (visible.has(s.id)) { if (!state.map.hasLayer(m)) m.addTo(state.map); }
    else                   { if (state.map.hasLayer(m))  state.map.removeLayer(m); }
  });
}

// ── List rendering ──────────────────────────────────────
function renderList() {
  const ul = document.getElementById('shelter-list');
  const list = filtered();

  if (!list.length) {
    ul.innerHTML = `
      <li class="empty-state">
        <span class="empty-state-icon">🔍</span>
        <div class="empty-state-text">לא נמצאו מקלטים</div>
        <div class="empty-state-sub">נסה לשנות את הסינון</div>
      </li>`;
    return;
  }

  ul.innerHTML = list.map((s, i) => {
    const pipCls  = s.type === 'parking' ? 'pip-parking'
                 : s.type === 'school'  ? 'pip-school'
                 : 'pip-public';
    const distHtml = s._distance != null
      ? `<span class="dist-badge${i === 0 ? ' nearest' : ''}">${fmtDist(s._distance)}</span>`
      : '';
    return `
      <li class="shelter-card" data-id="${s.id}" tabindex="0" role="button" aria-label="${s.nameHe}">
        <span class="card-pip ${pipCls}"></span>
        <div class="card-body">
          <div class="card-name">${s.nameHe}</div>
          <div class="card-addr">${s.addressHe}${s.neighborhood ? ' · ' + s.neighborhood : ''}</div>
          ${s.accessible ? '<div class="card-access">♿</div>' : ''}
        </div>
        <div class="card-end">
          ${distHtml}
          <span class="card-arrow" aria-hidden="true">›</span>
        </div>
      </li>`;
  }).join('');

  ul.querySelectorAll('.shelter-card').forEach(card => {
    const go = () => {
      const s = shelters.find(x => x.id === card.dataset.id);
      if (!s) return;
      switchView('map');
      openSheet(s);
      state.map.flyTo([s.lat, s.lon], 16, { duration: 0.7 });
      setTimeout(() => state.markers[s.id]?.openPopup(), 800);
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

// ── Detail sheet ────────────────────────────────────────
function openSheet(s) {
  state.activeShelter = s;

  document.getElementById('sheet-name').textContent    = s.nameHe;
  document.getElementById('sheet-name-en').textContent = s.name;
  document.getElementById('sheet-addr-he').textContent = s.addressHe;
  document.getElementById('sheet-addr-en').textContent = s.address;

  const typeLabel = s.type === 'parking' ? '🅿️ חניון מוגן'
                 : s.type === 'school'  ? '🏫 בית ספר'
                 : '🏛 מקלט ציבורי';
  const typeCls   = s.type === 'parking' ? 'badge-parking'
                 : s.type === 'school'  ? 'badge-school'
                 : 'badge-public';
  document.getElementById('sheet-badges').innerHTML = `
    <span class="badge ${typeCls}">${typeLabel}</span>
    <span class="badge badge-capacity">👥 ${s.capacity}</span>
    ${s.accessible
      ? '<span class="badge badge-access">♿ נגיש</span>'
      : '<span class="badge badge-noaccess">נגישות מוגבלת</span>'}`;

  const distEl = document.getElementById('sheet-distance');
  if (s._distance != null) {
    distEl.innerHTML = `<span>📍</span><span>${fmtDist(s._distance)} ממיקומך</span>`;
    distEl.classList.add('visible');
  } else {
    distEl.classList.remove('visible');
  }

  document.getElementById('nav-waze').href  = `https://waze.com/ul?ll=${s.lat},${s.lon}&navigate=yes`;
  document.getElementById('nav-gmaps').href = `https://maps.google.com/?q=${s.lat},${s.lon}&travelmode=walking`;

  document.getElementById('sheet-backdrop').classList.add('visible');
  const sheet = document.getElementById('detail-sheet');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.getElementById('sheet-close').focus();
}

function closeSheet() {
  document.getElementById('sheet-backdrop').classList.remove('visible');
  const sheet = document.getElementById('detail-sheet');
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  state.activeShelter = null;
}

// ── Find Nearest ────────────────────────────────────────
function findNearest() {
  const btn = document.getElementById('find-btn');
  if (!navigator.geolocation) {
    alert('הדפדפן שלך אינו תומך באיתור מיקום.\nYour browser does not support geolocation.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<div class="loading-spinner"></div>
    <span class="find-text-he">מאתר מיקום...</span>
    <span class="find-text-en" dir="ltr">Locating...</span>`;

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      state.userLatLon = { lat, lon };

      // Sort shelters by distance
      state.sorted = shelters.map(s => ({
        ...s,
        _distance: haversine(lat, lon, s.lat, s.lon),
      })).sort((a, b) => a._distance - b._distance);

      // User location marker
      if (state.userMarker) state.map.removeLayer(state.userMarker);
      state.userMarker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: '',
          html: '<div class="marker-user"></div>',
          iconSize: [16, 16], iconAnchor: [8, 8],
        }),
        zIndexOffset: 1000,
      });
      state.userMarker.bindTooltip('📍 מיקומך', { permanent: false, direction: 'top' });
      state.userMarker.addTo(state.map);

      // Highlight nearest
      const nearest = state.sorted[0];
      if (nearest && state.markers[nearest.id]) {
        state.markers[nearest.id].setIcon(makeIcon(nearest, true));
        setTimeout(() => state.markers[nearest.id]?.setIcon(makeIcon(nearest, false)), 4500);
      }

      // Fit map
      if (nearest) {
        state.map.fitBounds(
          L.latLngBounds([[lat, lon], [nearest.lat, nearest.lon]]).pad(0.3),
          { maxZoom: 16 }
        );
        setTimeout(() => state.markers[nearest.id]?.openPopup(), 600);
      }

      syncMarkers();
      if (state.activeView === 'list') renderList();
      setTimeout(() => openSheet(nearest), 700);

      const dist = fmtDist(nearest._distance);
      btn.disabled = false;
      btn.innerHTML = `
        <svg class="find-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="9" stroke-dasharray="4 2"/></svg>
        <span class="find-text-he">קרוב: ${dist}</span>
        <span class="find-text-en" dir="ltr">Nearest: ${dist}</span>`;
    },
    err => {
      btn.disabled = false;
      btn.innerHTML = `
        <svg class="find-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="9" stroke-dasharray="4 2"/></svg>
        <span class="find-text-he">מצא מקלט קרוב</span>
        <span class="find-text-en" dir="ltr">Find Nearest</span>`;
      const msgs = {
        [err.PERMISSION_DENIED]: 'הגישה למיקום נדחתה — אנא אפשר גישה למיקום בהגדרות הדפדפן.',
        [err.TIMEOUT]:           'פסק זמן לאיתור מיקום — נסה שוב.',
      };
      alert(msgs[err.code] || 'לא ניתן לאתר מיקום.');
    },
    { timeout: 12000, maximumAge: 30000, enableHighAccuracy: true }
  );
}

// ── View switching ──────────────────────────────────────
function switchView(view) {
  state.activeView = view;

  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.view === view;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });

  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${view}`);
  });

  if (view === 'map') {
    setTimeout(() => state.map?.invalidateSize(), 60);
  } else {
    renderList();
  }
}

// ── Filter ──────────────────────────────────────────────
function setFilter(f) {
  state.activeFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === f));
  syncMarkers();
  if (state.activeView === 'list') renderList();
}

// ── Offline detection ────────────────────────────────────
function initOffline() {
  const banner = document.getElementById('offline-banner');
  const update = () => { banner.hidden = navigator.onLine; };
  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
  update();
}

// ── Service Worker ───────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(r => console.log('[SW] scope:', r.scope))
      .catch(e => console.warn('[SW] failed:', e));
  }
}

// ── Event wiring ─────────────────────────────────────────
function wire() {
  document.getElementById('find-btn').addEventListener('click', findNearest);

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchView(t.dataset.view)));

  document.querySelectorAll('.chip').forEach(c =>
    c.addEventListener('click', () => setFilter(c.dataset.filter)));

  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.activeShelter) closeSheet();
  });

  // Waze: on desktop fall back to https://www.waze.com
  document.getElementById('nav-waze').addEventListener('click', function (e) {
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      e.preventDefault();
      const s = state.activeShelter;
      if (s) window.open(`https://www.waze.com/ul?ll=${s.lat},${s.lon}&navigate=yes`, '_blank');
    }
  });
}

// ── Boot ─────────────────────────────────────────────────
function boot() {
  initMap();
  switchView('map');
  setFilter('all');
  initOffline();
  wire();
  registerSW();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
