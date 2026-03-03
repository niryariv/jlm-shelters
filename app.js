/**
 * Jerusalem Shelter Finder — app.js
 * Pure ES-module, no build tools required.
 */

import { shelters } from './data.js';

// ── State ──────────────────────────────────────────────
const state = {
  map: null,
  markers: {},          // id -> L.marker
  userMarker: null,
  userLatLng: null,     // { lat, lon }
  activeFilter: 'all',  // 'all' | 'public' | 'parking' | 'accessible'
  activeView: 'map',    // 'map' | 'list'
  activeShelter: null,  // shelter object
  sortedShelters: [...shelters],
};

// ── Haversine distance (km) ────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (km < 1) return Math.round(km * 1000) + ' מ\'';
  return km.toFixed(1) + ' ק"מ';
}

// ── Marker color by type ───────────────────────────────
function markerColor(shelter) {
  if (shelter.type === 'parking') return '#D32F2F';
  return '#1565C0';
}

// ── Create custom div icon ─────────────────────────────
function createIcon(shelter, highlight = false) {
  const color = markerColor(shelter);
  const size = highlight ? 18 : 14;
  const border = highlight ? 3 : 2;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:${border}px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.55);
      ${highlight ? 'animation:nearest-pulse 1.5s ease-in-out 3;' : ''}
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

// ── Build popup HTML ───────────────────────────────────
function buildPopupHTML(shelter) {
  const typeLabelHe = shelter.type === 'parking' ? 'חניון מוגן' : 'מקלט ציבורי';
  const accessHe = shelter.accessible ? ' | ♿ נגיש' : '';
  return `
    <div class="popup-inner">
      <div class="popup-name">${shelter.nameHe}</div>
      <div class="popup-address">${shelter.addressHe}</div>
      <div class="popup-meta">
        <span class="badge ${shelter.type === 'parking' ? 'badge-type-parking' : 'badge-type-public'}">${typeLabelHe}</span>
        <span class="badge badge-capacity">👥 ${shelter.capacity}</span>
        ${shelter.accessible ? '<span class="badge badge-accessible">♿</span>' : ''}
      </div>
      <button class="popup-open-detail" data-id="${shelter.id}">פרטים ונווט ›</button>
    </div>`;
}

// ── Init Map ───────────────────────────────────────────
function initMap() {
  const map = L.map('map', {
    center: [31.7683, 35.2137],
    zoom: 13,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  state.map = map;

  // Add markers for all shelters
  shelters.forEach(s => {
    const marker = L.marker([s.lat, s.lon], { icon: createIcon(s) });
    marker.bindPopup(buildPopupHTML(s), {
      maxWidth: 260,
      closeButton: true,
    });
    marker.on('click', () => {
      // Popup click is handled; also allow direct detail opening via popup button
    });
    marker.addTo(map);
    state.markers[s.id] = marker;
  });

  // Delegate popup button clicks (popups are in DOM after open)
  map.on('popupopen', (e) => {
    const btn = e.popup.getElement()?.querySelector('.popup-open-detail');
    if (btn) {
      btn.addEventListener('click', () => {
        const shelter = shelters.find(s => s.id === btn.dataset.id);
        if (shelter) openDetailPanel(shelter);
      });
    }
  });
}

// ── Filter helpers ─────────────────────────────────────
function filterShelters() {
  return state.sortedShelters.filter(s => {
    if (state.activeFilter === 'all') return true;
    if (state.activeFilter === 'public') return s.type === 'public';
    if (state.activeFilter === 'parking') return s.type === 'parking';
    if (state.activeFilter === 'accessible') return s.accessible;
    return true;
  });
}

// ── Update marker visibility ───────────────────────────
function updateMarkers() {
  const visible = new Set(filterShelters().map(s => s.id));
  shelters.forEach(s => {
    const marker = state.markers[s.id];
    if (!marker) return;
    if (visible.has(s.id)) {
      if (!state.map.hasLayer(marker)) marker.addTo(state.map);
    } else {
      if (state.map.hasLayer(marker)) state.map.removeLayer(marker);
    }
  });
}

// ── Render list ────────────────────────────────────────
function renderList() {
  const list = document.getElementById('shelter-list');
  const filtered = filterShelters();

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🔍</span>
        <div class="empty-state-text">לא נמצאו מקלטים</div>
        <div class="empty-state-sub">נסה לשנות את הסינון</div>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((s, idx) => {
    const distHtml = s._distance != null
      ? `<span class="distance-badge ${idx === 0 && state.activeFilter !== 'parking' && state.activeFilter !== 'accessible' ? 'nearest' : ''}">${formatDistance(s._distance)}</span>`
      : '';
    const typeClass = s.type === 'parking' ? 'type-parking' : 'type-public';
    const typeLabelHe = s.type === 'parking' ? 'חניון' : 'ציבורי';
    return `
      <div class="shelter-card" data-id="${s.id}" tabindex="0" role="button" aria-label="${s.nameHe}">
        <div class="card-dot ${typeClass}"></div>
        <div class="card-body">
          <div class="card-name">${s.nameHe}</div>
          <div class="card-address">${s.addressHe}</div>
          <div class="card-meta">
            ${s.accessible ? '<span class="access-icon" title="נגיש לנכים">♿</span>' : ''}
          </div>
        </div>
        <div class="card-end">
          ${distHtml}
          <span class="chevron">›</span>
        </div>
      </div>`;
  }).join('');

  // Attach click listeners
  list.querySelectorAll('.shelter-card').forEach(card => {
    const handler = () => {
      const s = shelters.find(x => x.id === card.dataset.id);
      if (s) {
        // Switch to map and show marker
        setView('map');
        openDetailPanel(s);
        if (state.map) {
          state.map.flyTo([s.lat, s.lon], 16, { duration: 0.8 });
          const marker = state.markers[s.id];
          if (marker) {
            setTimeout(() => marker.openPopup(), 900);
          }
        }
      }
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    });
  });
}

// ── Detail Panel ───────────────────────────────────────
function openDetailPanel(shelter) {
  state.activeShelter = shelter;

  document.getElementById('panel-name').textContent = shelter.nameHe;
  document.getElementById('panel-name-en').textContent = shelter.name;
  document.getElementById('panel-address-he').textContent = shelter.addressHe;
  document.getElementById('panel-address-en').textContent = shelter.address;

  // Badges
  const badgesEl = document.getElementById('panel-badges');
  const typeLabelHe = shelter.type === 'parking' ? '🅿️ חניון מוגן' : '🏛 מקלט ציבורי';
  const typeClass = shelter.type === 'parking' ? 'badge-type-parking' : 'badge-type-public';
  badgesEl.innerHTML = `
    <span class="badge ${typeClass}">${typeLabelHe}</span>
    <span class="badge badge-capacity">👥 קיבולת: ${shelter.capacity}</span>
    ${shelter.accessible
      ? '<span class="badge badge-accessible">♿ נגיש לנכים</span>'
      : '<span class="badge badge-not-accessible">נגישות מוגבלת</span>'
    }`;

  // Distance
  const distEl = document.getElementById('panel-distance');
  if (shelter._distance != null) {
    distEl.textContent = '';
    distEl.innerHTML = `<span>📍</span><span>${formatDistance(shelter._distance)} ממיקומך</span>`;
    distEl.classList.add('visible');
  } else {
    distEl.classList.remove('visible');
  }

  // Navigation buttons
  const wazeLink = document.getElementById('nav-waze');
  const gMapsLink = document.getElementById('nav-gmaps');
  wazeLink.href = `https://waze.com/ul?ll=${shelter.lat},${shelter.lon}&navigate=yes`;
  gMapsLink.href = `https://maps.google.com/?q=${shelter.lat},${shelter.lon}&travelmode=walking`;

  // Open panel
  document.getElementById('detail-backdrop').classList.add('visible');
  document.getElementById('detail-panel').classList.add('open');
  document.getElementById('panel-close').focus();
}

function closeDetailPanel() {
  document.getElementById('detail-backdrop').classList.remove('visible');
  document.getElementById('detail-panel').classList.remove('open');
  state.activeShelter = null;
}

// ── Find Nearest ───────────────────────────────────────
function findNearest() {
  const btn = document.getElementById('find-nearest-btn');

  if (!navigator.geolocation) {
    alert('הדפדפן שלך אינו תומך באיתור מיקום.\nYour browser does not support geolocation.');
    return;
  }

  // Set loading state
  btn.disabled = true;
  btn.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="btn-text">
      <span class="btn-text-he">מאתר מיקום...</span>
      <span class="btn-text-en">Locating...</span>
    </div>`;

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      state.userLatLng = { lat, lon };

      // Calculate distances and sort
      state.sortedShelters = shelters.map(s => ({
        ...s,
        _distance: haversine(lat, lon, s.lat, s.lon),
      })).sort((a, b) => a._distance - b._distance);

      // Update user marker
      if (state.userMarker) state.map.removeLayer(state.userMarker);
      const userIcon = L.divIcon({
        className: '',
        html: '<div class="marker-user"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      state.userMarker = L.marker([lat, lon], { icon: userIcon, zIndexOffset: 1000 });
      state.userMarker.bindTooltip('📍 מיקומך', { permanent: false, direction: 'top' });
      state.userMarker.addTo(state.map);

      // Highlight nearest
      const nearest = state.sortedShelters[0];
      if (nearest && state.markers[nearest.id]) {
        state.markers[nearest.id].setIcon(createIcon(nearest, true));
        setTimeout(() => {
          state.markers[nearest.id].setIcon(createIcon(nearest, false));
        }, 4500);
      }

      // Fit map to show user + nearest shelter
      if (nearest) {
        const bounds = L.latLngBounds([[lat, lon], [nearest.lat, nearest.lon]]);
        state.map.fitBounds(bounds.pad(0.3), { maxZoom: 16 });
        setTimeout(() => {
          state.markers[nearest.id]?.openPopup();
        }, 600);
      }

      // Update markers and re-render list
      updateMarkers();
      if (state.activeView === 'list') renderList();

      // Show nearest detail after brief pause
      setTimeout(() => openDetailPanel(nearest), 800);

      // Restore button
      btn.disabled = false;
      btn.innerHTML = `
        <span class="btn-icon">📍</span>
        <div class="btn-text">
          <span class="btn-text-he">מקלט הקרוב אליי</span>
          <span class="btn-text-en">Nearest: ${formatDistance(nearest._distance)}</span>
        </div>`;
    },
    err => {
      btn.disabled = false;
      btn.innerHTML = `
        <span class="btn-icon">📍</span>
        <div class="btn-text">
          <span class="btn-text-he">מצא מקלט הקרוב אליי</span>
          <span class="btn-text-en">Find Nearest Shelter</span>
        </div>`;

      let msg = 'לא ניתן לאתר מיקום.\nCould not get location.';
      if (err.code === err.PERMISSION_DENIED) {
        msg = 'הגישה למיקום נדחתה. אנא אפשר גישה למיקום בהגדרות.\nLocation permission denied. Please enable in settings.';
      } else if (err.code === err.TIMEOUT) {
        msg = 'פסק הזמן לאיתור מיקום. נסה שוב.\nLocation timed out. Please try again.';
      }
      alert(msg);
    },
    { timeout: 12000, maximumAge: 30000, enableHighAccuracy: true }
  );
}

// ── Tab switching ──────────────────────────────────────
function setView(view) {
  state.activeView = view;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  const mapView = document.getElementById('map-view');
  const listView = document.getElementById('list-view');

  if (view === 'map') {
    mapView.classList.add('active');
    listView.classList.remove('active');
    // Leaflet needs a resize event when shown after being hidden
    setTimeout(() => state.map?.invalidateSize(), 50);
  } else {
    listView.classList.add('active');
    mapView.classList.remove('active');
    renderList();
  }
}

// ── Filter chips ───────────────────────────────────────
function setFilter(filter) {
  state.activeFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === filter);
  });
  updateMarkers();
  if (state.activeView === 'list') renderList();
}

// ── Offline detection ──────────────────────────────────
function initOfflineDetection() {
  const banner = document.getElementById('offline-banner');
  const update = () => {
    banner.classList.toggle('visible', !navigator.onLine);
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

// ── Service Worker ─────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('[SW] Registered, scope:', reg.scope);
    }).catch(err => {
      console.warn('[SW] Registration failed:', err);
    });
  }
}

// ── Event Listeners ────────────────────────────────────
function initEventListeners() {
  // Find nearest button
  document.getElementById('find-nearest-btn').addEventListener('click', findNearest);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => setFilter(chip.dataset.filter));
  });

  // Close detail panel
  document.getElementById('panel-close').addEventListener('click', closeDetailPanel);
  document.getElementById('detail-backdrop').addEventListener('click', closeDetailPanel);

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.activeShelter) closeDetailPanel();
  });

  // Waze / Google Maps — prefer Waze on mobile
  document.getElementById('nav-waze').addEventListener('click', function(e) {
    // On desktop, Waze deep-link won't work — fall back to web
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobile) {
      e.preventDefault();
      const s = state.activeShelter;
      if (s) window.open(`https://www.waze.com/ul?ll=${s.lat},${s.lon}&navigate=yes`, '_blank');
    }
  });
}

// ── Bootstrap ──────────────────────────────────────────
function init() {
  initMap();
  setView('map');
  setFilter('all');
  initOfflineDetection();
  initEventListeners();
  registerSW();
}

// Wait for DOM + Leaflet to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
