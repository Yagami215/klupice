/**
 * Klupice Online - Frontend Application Logic (GitHub Pages + Supabase ready)
 */

// Application State
const state = {
  benches: [],
  activeCity: 'sve',
  activeTags: new Set(),
  activeSearch: '',
  activeCondition: null,
  activeUploader: 'sve', // 'sve', 'verified', 'anonymous', 'ai'
  selectedBench: null,
  pickedLocation: null,
  currentGalleryIndex: 0,
  uploadedFiles: [],
  selectedTags: new Set(),
  currentUser: null,
  likedBenchIds: new Set(JSON.parse(localStorage.getItem('klupice_liked_benches') || '[]')),
  editSelectedTags: new Set(),
  userBenches: []
};

// Security: XSS Sanitization helper for user-generated inputs
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Anti-Spam Cooldown Configuration (in milliseconds)
const BENCH_COOLDOWN_MS = 25000;   // 25 sekundi između dodavanja klupica
const COMMENT_COOLDOWN_MS = 10000; // 10 sekundi između komentara
let lastBenchSubmitTimestamp = 0;
let lastCommentSubmitTimestamp = 0;

// Europe geographic bounds to restrict map panning to Europe only
const EUROPE_BOUNDS = L.latLngBounds(
  L.latLng(32.0, -25.0), // Southwest (Southern Mediterranean & Atlantic)
  L.latLng(72.0, 45.0)   // Northeast (Northern Scandinavia & Eastern border)
);

// Satellite Imagery Base
const esriSatBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 17,
  maxNativeZoom: 17,
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

// Topographic Relief Layer
const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 16,
  maxNativeZoom: 16,
  subdomains: ['a', 'b', 'c'],
  attribution: 'Karta: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>, SRTM | Stil: &copy; <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a>'
});

// Major Cities for orientation on Satellite (Pure city labels - NO borders, NO county names)
const MAJOR_CITIES = [
  // Tier 1 (Largest cities & regional hubs)
  { name: 'Zagreb', lat: 45.8150, lng: 15.9819, tier: 1 },
  { name: 'Split', lat: 43.5081, lng: 16.4402, tier: 1 },
  { name: 'Rijeka', lat: 45.3271, lng: 14.4422, tier: 1 },
  { name: 'Osijek', lat: 45.5550, lng: 18.6955, tier: 1 },
  { name: 'Zadar', lat: 44.1194, lng: 15.2314, tier: 1 },
  { name: 'Dubrovnik', lat: 42.6507, lng: 18.0944, tier: 1 },
  { name: 'Pula', lat: 44.8666, lng: 13.8496, tier: 1 },
  { name: 'Šibenik', lat: 43.7350, lng: 15.8952, tier: 1 },
  { name: 'Slavonski Brod', lat: 45.1631, lng: 18.0116, tier: 1 },
  { name: 'Karlovac', lat: 45.4929, lng: 15.5553, tier: 1 },
  { name: 'Varaždin', lat: 46.3057, lng: 16.3366, tier: 1 },
  { name: 'Sisak', lat: 45.4878, lng: 16.3761, tier: 1 },
  { name: 'Rovinj', lat: 45.0812, lng: 13.6387, tier: 1 },
  { name: 'Gospić', lat: 44.5461, lng: 15.3747, tier: 1 },

  // Tier 2 (Key towns, coastal centers, islands)
  { name: 'Poreč', lat: 45.2269, lng: 13.5939, tier: 2 },
  { name: 'Umag', lat: 45.4372, lng: 13.5244, tier: 2 },
  { name: 'Opatija', lat: 45.3375, lng: 14.3050, tier: 2 },
  { name: 'Labin', lat: 45.0950, lng: 14.1206, tier: 2 },
  { name: 'Crikvenica', lat: 45.1764, lng: 14.6925, tier: 2 },
  { name: 'Krk', lat: 45.0256, lng: 14.5753, tier: 2 },
  { name: 'Mali Lošinj', lat: 44.5325, lng: 14.4681, tier: 2 },
  { name: 'Rab', lat: 44.7572, lng: 14.7606, tier: 2 },
  { name: 'Pag', lat: 44.4447, lng: 15.0561, tier: 2 },
  { name: 'Senj', lat: 44.9894, lng: 14.9058, tier: 2 },
  { name: 'Biograd', lat: 43.9372, lng: 15.4444, tier: 2 },
  { name: 'Vodice', lat: 43.7608, lng: 15.7753, tier: 2 },
  { name: 'Knin', lat: 44.0406, lng: 16.1964, tier: 2 },
  { name: 'Sinj', lat: 43.7036, lng: 16.6394, tier: 2 },
  { name: 'Trogir', lat: 43.5164, lng: 16.2503, tier: 2 },
  { name: 'Omiš', lat: 43.4444, lng: 16.6903, tier: 2 },
  { name: 'Makarska', lat: 43.2969, lng: 17.0178, tier: 2 },
  { name: 'Ploče', lat: 43.0531, lng: 17.4333, tier: 2 },
  { name: 'Metković', lat: 43.0542, lng: 17.6483, tier: 2 },
  { name: 'Korčula', lat: 42.9600, lng: 17.1358, tier: 2 },
  { name: 'Hvar', lat: 43.1725, lng: 16.4428, tier: 2 },
  { name: 'Supetar', lat: 43.3839, lng: 16.5544, tier: 2 },
  { name: 'Vis', lat: 43.0617, lng: 16.1833, tier: 2 },
  { name: 'Bjelovar', lat: 45.8986, lng: 16.8489, tier: 2 },
  { name: 'Koprivnica', lat: 46.1628, lng: 16.8275, tier: 2 },
  { name: 'Čakovec', lat: 46.3844, lng: 16.4339, tier: 2 },
  { name: 'Krapina', lat: 46.1608, lng: 15.8789, tier: 2 },
  { name: 'Samobor', lat: 45.8011, lng: 15.7119, tier: 2 },
  { name: 'Velika Gorica', lat: 45.7133, lng: 16.0758, tier: 2 },
  { name: 'Požega', lat: 45.3400, lng: 17.6853, tier: 2 },
  { name: 'Đakovo', lat: 45.3103, lng: 18.4106, tier: 2 },
  { name: 'Virovitica', lat: 45.8317, lng: 17.3839, tier: 2 },
  { name: 'Vinkovci', lat: 45.2878, lng: 18.8047, tier: 2 },
  { name: 'Vukovar', lat: 45.3517, lng: 19.0033, tier: 2 },
  { name: 'Ilok', lat: 45.2239, lng: 19.3758, tier: 2 },
  { name: 'Ogulin', lat: 45.2661, lng: 15.2253, tier: 2 },
  { name: 'Delnice', lat: 45.3989, lng: 14.8428, tier: 2 },

  // Surrounding Regional Anchors
  { name: 'Ljubljana', lat: 46.0569, lng: 14.5058, tier: 2 },
  { name: 'Maribor', lat: 46.5547, lng: 15.6459, tier: 2 },
  { name: 'Trst', lat: 45.6495, lng: 13.7768, tier: 2 },
  { name: 'Graz', lat: 47.0707, lng: 15.4395, tier: 2 },
  { name: 'Sarajevo', lat: 43.8563, lng: 18.4131, tier: 2 },
  { name: 'Banja Luka', lat: 44.7722, lng: 17.1910, tier: 2 },
  { name: 'Mostar', lat: 43.3438, lng: 17.8078, tier: 2 },
  { name: 'Bihać', lat: 44.8169, lng: 15.8708, tier: 2 }
];

function createSatelliteCitiesLayer() {
  const layer = L.layerGroup();
  MAJOR_CITIES.forEach(city => {
    const isTier1 = city.tier === 1;
    const html = `
      <div class="satellite-city-label ${isTier1 ? 'satellite-city-tier-1' : 'satellite-city-tier-2'}">
        <span class="city-point"></span>
        <span class="city-name">${city.name}</span>
      </div>
    `;
    const marker = L.marker([city.lat, city.lng], {
      icon: L.divIcon({
        className: 'satellite-city-marker',
        html: html,
        iconSize: [120, 20],
        iconAnchor: [0, 10]
      }),
      interactive: false,
      keyboard: false
    });
    layer.addLayer(marker);
  });
  return layer;
}

// Country Borders Layer (State/National boundaries only - NO county lines, NO county names)
function createCountryBordersLayer() {
  if (typeof COUNTRY_BORDERS === 'undefined') return L.layerGroup();
  return L.geoJSON(COUNTRY_BORDERS, {
    style: {
      color: 'rgba(255, 255, 255, 0.75)',
      weight: 1.6,
      dashArray: '5, 5', // Clean, crisp dashed country border
      opacity: 0.9
    },
    interactive: false
  });
}

const countryBordersLayer = createCountryBordersLayer();
const satelliteCitiesLayer = createSatelliteCitiesLayer();

// Base Layer Definitions with constrained maxZoom
const layerConfigs = {
  satellite: {
    name: 'Satelit',
    maxZoom: 17,
    layers: [esriSatBase, countryBordersLayer, satelliteCitiesLayer]
  },
  topo: {
    name: 'Reljef',
    maxZoom: 16,
    layers: [openTopo]
  }
};

let currentLayerKey = 'satellite';
let map = null;
let markersCluster = null;
let newBenchTempMarker = null;
let userLocationMarker = null;

// Rating Tier System Helper (Peak, S, A, B, C, F)
function getTierDisplay(tier) {
  if (!tier) return 'B';
  const t = String(tier).trim().toUpperCase();
  if (t === 'PEAK' || t === 'Z' || t === 'P') return 'Peak';
  if (['S', 'A', 'B', 'C', 'F'].includes(t)) return t;
  if (t === 'ODLICNO') return 'A';
  if (t === 'DOBRO') return 'B';
  if (t === 'POPRAVAK') return 'F';
  return 'B';
}

function getTierColor(tier) {
  const t = getTierDisplay(tier);
  switch (t) {
    case 'Peak': return '#9333ea'; // Purple / Peak
    case 'S': return '#f59e0b'; // Gold / Super
    case 'A': return '#10b981'; // Emerald
    case 'B': return '#3b82f6'; // Sky Blue
    case 'C': return '#64748b'; // Slate Gray
    case 'F': return '#ef4444'; // Red
    default: return '#3b82f6';
  }
}

// Bench Pin SVG Generator with Tier Letter
function createBenchPinIcon(condition) {
  const tier = getTierDisplay(condition);
  const color = getTierColor(tier);
  const isPeak = tier === 'Peak';
  const label = isPeak ? 'PEAK' : tier;
  const fontSize = isPeak ? '9' : '14';
  const yPos = isPeak ? '21.5' : '23';

  const html = `
    <div class="bench-marker-icon bench-marker-condition-${tier}">
      <svg class="bench-pin-svg" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path class="pin-body" d="M18 0C8.05887 0 0 8.05887 0 18C0 27.5 14.5 41.5 17.15 43.45C17.65 43.82 18.35 43.82 18.85 43.45C21.5 41.5 36 27.5 36 18C36 8.05887 27.9411 0 18 0Z" fill="${color}"/>
        <circle cx="18" cy="18" r="14" fill="white"/>
        <!-- Bold Tier text in center of Pin -->
        <text x="18" y="${yPos}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="900" fill="${color}">${label}</text>
      </svg>
    </div>
  `;

  return L.divIcon({
    className: 'custom-bench-pin',
    html: html,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -38]
  });
}

// Format relative date in Croatian
function formatCroatianDate(dateStr) {
  if (!dateStr) return 'Nedavno';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Upravo sada';
    if (diffMinutes < 60) return `Prije ${diffMinutes} min`;
    if (diffHours < 24) return `Prije ${diffHours} h`;
    if (diffDays === 1) return 'Jučer';
    if (diffDays < 7) return `Prije ${diffDays} dana`;
    return date.toLocaleDateString('hr-HR', { day: 'numeric', month: 'numeric', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

// Translate Tier Rating to readable badge
function getConditionBadge(condition) {
  const t = getTierDisplay(condition);
  if (t === 'Peak') {
    return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-900 border border-purple-300 shadow-sm"><span class="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span> 👑 PEAK TIER</span>`;
  }
  if (t === 'S') {
    return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-sm"><span class="w-2 h-2 rounded-full bg-amber-500"></span> ⭐ S TIER</span>`;
  }
  if (t === 'A') {
    return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-sm"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> ✨ A TIER</span>`;
  }
  if (t === 'B') {
    return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300 shadow-sm"><span class="w-2 h-2 rounded-full bg-blue-500"></span> 👍 B TIER</span>`;
  }
  if (t === 'C') {
    return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-300 shadow-sm"><span class="w-2 h-2 rounded-full bg-slate-500"></span> 👌 C TIER</span>`;
  }
  return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-sm"><span class="w-2 h-2 rounded-full bg-rose-500"></span> ⚠️ F TIER</span>`;
}

// Initialize Leaflet Map
function initMap() {
  const isMobile = window.innerWidth < 640;
  const croatiaCenter = isMobile ? [44.6, 16.4] : [44.8, 16.3];
  const initialZoom = isMobile ? 6.5 : 7.5;
  
  map = L.map('map', {
    center: croatiaCenter,
    zoom: initialZoom,
    minZoom: 5, // Prevents zooming out to the whole world
    maxZoom: layerConfigs.satellite.maxZoom,
    maxBounds: EUROPE_BOUNDS, // Confines map to Europe
    maxBoundsViscosity: 1.0,  // Hard boundary preventing dragging outside Europe
    zoomControl: false,
    tap: true // Ensure touch events register smoothly on mobile
  });

  // Add zoom control to bottom right
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Set default Satellite layer + major cities/borders overlay
  layerConfigs.satellite.layers.forEach(l => {
    l.addTo(map);
  });
  map.setMaxZoom(layerConfigs.satellite.maxZoom);

  // Initialize Marker Cluster Group
  markersCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      let c = 'marker-cluster-';
      if (count < 10) {
        c += 'small';
      } else if (count < 25) {
        c += 'medium';
      } else {
        c += 'large';
      }
      return new L.DivIcon({
        html: `<div><span>${count}</span></div>`,
        className: 'marker-cluster ' + c,
        iconSize: new L.Point(40, 40)
      });
    }
  });
  map.addLayer(markersCluster);

  // Map Click Listener -> Quick Add Bench
  map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    openAddModalWithCoords(lat, lng);
  });
}

// Layer Switcher Events
document.getElementById('layerSatellite').addEventListener('click', () => switchLayer('satellite'));
document.getElementById('layerTopo').addEventListener('click', () => switchLayer('topo'));

function switchLayer(layerKey) {
  if (!layerConfigs[layerKey]) return;
  currentLayerKey = layerKey;
  const config = layerConfigs[layerKey];

  // Remove existing base layers
  Object.values(layerConfigs).forEach(cfg => {
    cfg.layers.forEach(l => {
      if (map.hasLayer(l)) {
        map.removeLayer(l);
      }
    });
  });

  // Add the selected layers at the bottom
  config.layers.forEach(l => {
    l.addTo(map);
    if (typeof l.bringToBack === 'function') {
      l.bringToBack();
    }
  });

  // Constrain the map's zoom limit specifically for this layer
  map.setMaxZoom(config.maxZoom);

  // If user is currently zoomed in past this layer's limit, zoom out to the maximum visible level
  if (map.getZoom() > config.maxZoom) {
    map.setZoom(config.maxZoom);
  }

  const btns = {
    satellite: document.getElementById('layerSatellite'),
    topo: document.getElementById('layerTopo')
  };

  Object.entries(btns).forEach(([key, btn]) => {
    if (!btn) return;
    if (key === layerKey) {
      btn.className = 'px-2.5 py-1 text-xs font-medium rounded-lg bg-brand-600 text-white transition-all';
    } else {
      btn.className = 'px-2.5 py-1 text-xs font-medium rounded-lg text-slate-300 hover:bg-slate-800 transition-all';
    }
  });
}

// Fetch all benches from BenchAPI (Supabase or Demo fallback)
async function loadBenches() {
  try {
    const benches = await BenchAPI.getBenches({
      search: state.activeSearch,
      city: state.activeCity,
      tags: Array.from(state.activeTags),
      condition: state.activeCondition,
      uploaderType: state.activeUploader
    });

    state.benches = benches;
    updateUI();
  } catch (err) {
    console.error('Greška pri učitavanju klupica:', err);
    showToast('Greška pri učitavanju klupica.', 'error');
  }
}

// Update UI: Markers on Map, List in Drawer, Count Badges
function updateUI() {
  const count = state.benches.length;
  document.getElementById('benchCountBadge').textContent = count;
  document.getElementById('panelBenchCount').textContent = count;

  // Clear and rebuild map markers
  markersCluster.clearLayers();

  state.benches.forEach(bench => {
    const marker = L.marker([bench.latitude, bench.longitude], {
      icon: createBenchPinIcon(bench.condition),
      title: bench.title
    });

    // Create Popup content
    const thumbUrl = bench.photos && bench.photos.length > 0 
      ? bench.photos[0].url 
      : null;
    const tierDisplay = getTierDisplay(bench.condition);
    const tierColor = getTierColor(tierDisplay);

    const safeTitle = escapeHtml(bench.title || 'Klupica');
    const safeCity = escapeHtml(bench.city || 'Hrvatska');
    const safeDesc = escapeHtml(bench.description || 'Nema opisa.');
    const safeAuthor = escapeHtml(bench.author || 'Korisnik');

    const isVerifiedBench = (bench.user_id !== null && bench.user_id !== undefined) || 
                            (bench.author && bench.author.trim() !== '' && bench.author.trim().toLowerCase() !== 'anonimni šetač');
    let authorBadgePopup;
    if (bench.is_ai) {
      authorBadgePopup = `<span class="inline-flex items-center gap-1 text-[10px] text-purple-400 font-semibold truncate max-w-[100px]" title="AI Baza klupica u RH"><i class="ph-bold ph-sparkle flex-shrink-0"></i> AI Baza</span>`;
    } else if (isVerifiedBench) {
      authorBadgePopup = `<span class="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold truncate max-w-[100px]"><i class="ph-bold ph-check-circle flex-shrink-0"></i> <span class="truncate">${safeAuthor}</span></span>`;
    } else {
      authorBadgePopup = `<span class="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium"><i class="ph-bold ph-mask-happy flex-shrink-0"></i> Anonimno</span>`;
    }

    const popupContent = `
      <div class="w-60 overflow-hidden cursor-pointer bg-slate-900 text-slate-100" onclick="openBenchDetailModal('${bench.id}')">
        ${thumbUrl ? `
          <div class="h-32 w-full bg-slate-800 overflow-hidden relative">
            <img src="${thumbUrl}" alt="${safeTitle}" loading="lazy" class="w-full h-full object-cover transition-transform duration-300 hover:scale-105" onerror="this.onerror=null; this.src='./img/logo.jpg';">
            <div class="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 text-white backdrop-blur-sm">
              📍 ${safeCity}
            </div>
            <div class="absolute top-2 right-2 px-1.5 py-0.5 rounded font-black text-[10px] bg-black/80 text-white backdrop-blur-sm shadow-sm" style="color: ${tierColor};">
              ${tierDisplay} TIER
            </div>
          </div>
        ` : `
          <div class="px-3 pt-3 pb-1 flex items-center justify-between border-b border-slate-800 bg-slate-850">
            <span class="text-[11px] font-semibold text-brand-400 flex items-center gap-1">📍 ${safeCity}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-black" style="color: ${tierColor}; background-color: ${tierColor}20;">
              ${tierDisplay} TIER
            </span>
          </div>
        `}
        <div class="p-3">
          <h4 class="font-bold text-slate-100 text-sm leading-snug line-clamp-1">${safeTitle}</h4>
          <p class="text-xs text-slate-400 mt-1 line-clamp-2">${safeDesc}</p>
          <div class="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div class="flex items-center gap-1.5">
              <span class="flex items-center gap-1 text-rose-400 font-semibold">
                <i class="ph-fill ph-heart"></i> ${bench.likes || 0}
              </span>
              <span class="text-slate-700">•</span>
              ${authorBadgePopup}
            </div>
            <span class="text-brand-400 font-semibold hover:underline flex items-center gap-0.5">
              Detalji &rarr;
            </span>
          </div>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent, { maxWidth: 280, closeButton: false });
    markersCluster.addLayer(marker);
  });

  // Re-render side panel bench cards
  renderSidePanelCards();
}

// Render cards in side drawer
function renderSidePanelCards() {
  const container = document.getElementById('benchesListContainer');
  container.innerHTML = '';

  if (state.benches.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 px-4">
        <div class="w-16 h-16 rounded-2xl bg-brand-950/60 text-brand-400 flex items-center justify-center mx-auto mb-3 shadow-sm border border-brand-800">
          <i class="ph-bold ph-armchair text-3xl"></i>
        </div>
        <p class="text-slate-200 font-bold text-sm">Još nema unesenih klupica</p>
        <p class="text-slate-400 text-xs mt-1 max-w-xs mx-auto">Budite prvi koji će dodati klupicu! Kliknite bilo gdje na kartu ili na tipku ispod.</p>
        <button onclick="document.getElementById('openAddBenchBtn').click()" class="mt-4 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-md shadow-brand-600/20 transition-all inline-flex items-center gap-1.5">
          <i class="ph-bold ph-plus-circle text-base"></i> Dodaj prvu klupicu
        </button>
      </div>
    `;
    return;
  }

  state.benches.forEach(bench => {
    const card = document.createElement('div');
    card.className = 'pt-3 pb-2 flex gap-3 hover:bg-slate-800/60 rounded-xl p-2 cursor-pointer transition-colors group border border-transparent hover:border-slate-800';
    
    const safeTitle = escapeHtml(bench.title || 'Klupica');
    const safeCity = escapeHtml(bench.city || 'Hrvatska');
    const safeDesc = escapeHtml(bench.description || 'Nema dodatnog opisa.');
    const safeAuthor = escapeHtml(bench.author || 'Korisnik');

    const thumbUrl = bench.photos && bench.photos.length > 0 
      ? bench.photos[0].url 
      : null;
    const tierDisplay = getTierDisplay(bench.condition);
    const tierColor = getTierColor(tierDisplay);

    const isVerifiedBench = (bench.user_id !== null && bench.user_id !== undefined) || 
                            (bench.author && bench.author.trim() !== '' && bench.author.trim().toLowerCase() !== 'anonimni šetač');
    let authorBadgeCard;
    if (bench.is_ai) {
      authorBadgeCard = `<span class="inline-flex items-center gap-1 text-[10px] text-purple-400 font-semibold truncate max-w-[100px]" title="AI Baza klupica u RH"><i class="ph-bold ph-sparkle flex-shrink-0"></i> AI Baza</span>`;
    } else if (isVerifiedBench) {
      authorBadgeCard = `<span class="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold truncate max-w-[100px]" title="Verificirani autor: ${safeAuthor}"><i class="ph-bold ph-check-circle flex-shrink-0"></i> <span class="truncate">${safeAuthor}</span></span>`;
    } else {
      authorBadgeCard = `<span class="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium" title="Anonimna objava"><i class="ph-bold ph-mask-happy flex-shrink-0"></i> Anonimno</span>`;
    }

    card.innerHTML = `
      <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-slate-800 flex-shrink-0 overflow-hidden relative shadow-sm">
        ${thumbUrl ? `
          <img src="${thumbUrl}" alt="${safeTitle}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.onerror=null; this.src='./img/logo.jpg';">
        ` : `
          <div class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/60">
            <i class="ph-bold ph-armchair text-xl text-slate-400"></i>
            <span class="text-[9px] font-black tracking-wider mt-0.5" style="color: ${tierColor};">${tierDisplay} TIER</span>
          </div>
        `}
      </div>
      <div class="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div class="flex items-center gap-1.5 text-[11px] font-semibold mb-0.5">
            <span class="text-brand-400 flex items-center gap-1"><i class="ph-bold ph-map-pin"></i> ${safeCity}</span>
            <span class="text-slate-600">•</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-black" style="color: ${tierColor}; background-color: ${tierColor}18">${tierDisplay} TIER</span>
            <span class="text-slate-600">•</span>
            <span class="text-slate-400 font-normal">${formatCroatianDate(bench.created_at)}</span>
          </div>
          <h4 class="font-bold text-slate-100 text-sm leading-tight truncate group-hover:text-brand-400 transition-colors">
            ${safeTitle}
          </h4>
          <p class="text-xs text-slate-400 line-clamp-2 mt-1 leading-snug">
            ${safeDesc}
          </p>
        </div>
        <div class="flex items-center justify-between text-xs text-slate-400 pt-1.5 mt-1 border-t border-slate-800/80">
          <div class="flex items-center gap-2 min-w-0">
            <span class="flex items-center gap-1 text-rose-400 font-medium text-[11px] flex-shrink-0">
              <i class="ph-fill ph-heart"></i> ${bench.likes || 0}
            </span>
            <span class="flex items-center gap-1 text-slate-400 text-[11px] flex-shrink-0">
              <i class="ph-bold ph-chat-teardrop"></i> ${bench.comments_count || 0}
            </span>
            <span class="text-slate-700 flex-shrink-0">•</span>
            ${authorBadgeCard}
          </div>
          <span class="text-brand-400 text-xs font-semibold flex items-center gap-0.5 flex-shrink-0">
            Karta &rarr;
          </span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      map.flyTo([bench.latitude, bench.longitude], 15, { duration: 1.2 });
      openBenchDetailModal(bench.id);
    });

    container.appendChild(card);
  });
}

// Reset filters
function resetFilters() {
  state.activeCity = 'sve';
  state.activeTag = null;
  state.activeSearch = '';
  state.activeCondition = null;

  document.getElementById('globalSearchInput').value = '';
  document.getElementById('panelSearchInput').value = '';

  document.querySelectorAll('.city-filter').forEach(btn => {
    btn.className = (btn.dataset.city === 'sve') 
      ? 'city-filter active px-3 py-1 rounded-full text-xs font-medium bg-brand-600 text-white shadow-sm transition-all'
      : 'city-filter px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all';
  });

  document.querySelectorAll('.tag-filter').forEach(btn => {
    btn.className = 'tag-filter px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all';
  });

  loadBenches();
}

// Open Detail Modal for a Bench
async function openBenchDetailModal(benchId) {
  try {
    const bench = await BenchAPI.getBenchById(benchId);
    if (!bench) throw new Error('Klupica nije pronađena');
    state.selectedBench = bench;

    // Populate Modal Fields
    document.getElementById('modalTitle').textContent = bench.title;
    document.getElementById('modalCity').textContent = bench.city || 'Hrvatska';
    if (bench.is_ai) {
      document.getElementById('modalAuthor').innerHTML = '<span class="text-purple-400 font-semibold inline-flex items-center gap-1"><i class="ph-bold ph-sparkle"></i> Izvor: AI Baza (Stvarna lokacija u RH)</span>';
    } else {
      document.getElementById('modalAuthor').textContent = `Dodao/la: ${bench.author || 'Anonimni šetač'}`;
    }
    document.getElementById('modalDescription').textContent = bench.description || 'Nema opisa za ovu klupicu.';
    document.getElementById('modalConditionBadge').innerHTML = getConditionBadge(bench.condition);
    document.getElementById('modalDirectionsLink').href = `https://www.google.com/maps/dir/?api=1&destination=${bench.latitude},${bench.longitude}`;

    // Update Like button style and count (1 lajk po računu / IP adresi)
    const likeBtn = document.getElementById('modalLikeBtn');
    if (likeBtn) {
      const isLiked = state.likedBenchIds.has(bench.id) || 
                      state.likedBenchIds.has(String(bench.id)) || 
                      state.likedBenchIds.has(Number(bench.id));
      if (isLiked) {
        likeBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/70 bg-rose-600/20 text-rose-300 text-sm font-semibold transition-colors shadow-sm';
        likeBtn.innerHTML = `<i class="ph-fill ph-heart text-base text-rose-400"></i> <span id="modalLikeCount">${bench.likes || 0}</span>`;
      } else {
        likeBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-200 text-sm font-semibold transition-colors shadow-sm';
        likeBtn.innerHTML = `<i class="ph-bold ph-heart text-base text-rose-400"></i> <span id="modalLikeCount">${bench.likes || 0}</span>`;
      }
    }

    // Show "Uredi" button if current logged-in user is the owner of this bench
    const editBtn = document.getElementById('modalEditBenchBtn');
    if (editBtn) {
      const isOwner = Boolean(state.currentUser && bench.user_id && bench.user_id === state.currentUser.id);
      if (isOwner) {
        editBtn.classList.remove('hidden');
        editBtn.classList.add('flex');
      } else {
        editBtn.classList.add('hidden');
        editBtn.classList.remove('flex');
      }
    }

    // Async check from database if user already liked this bench (syncs status across sessions)
    BenchAPI.checkUserLiked(bench.id).then(liked => {
      if (liked !== undefined && state.selectedBench && state.selectedBench.id === bench.id) {
        if (liked) {
          state.likedBenchIds.add(bench.id);
          state.likedBenchIds.add(String(bench.id));
        } else {
          state.likedBenchIds.delete(bench.id);
          state.likedBenchIds.delete(String(bench.id));
        }
        localStorage.setItem('klupice_liked_benches', JSON.stringify([...state.likedBenchIds]));
        const currentLikeBtn = document.getElementById('modalLikeBtn');
        if (currentLikeBtn) {
          if (liked) {
            currentLikeBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/70 bg-rose-600/20 text-rose-300 text-sm font-semibold transition-colors shadow-sm';
            currentLikeBtn.innerHTML = `<i class="ph-fill ph-heart text-base text-rose-400"></i> <span id="modalLikeCount">${bench.likes || 0}</span>`;
          } else {
            currentLikeBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-200 text-sm font-semibold transition-colors shadow-sm';
            currentLikeBtn.innerHTML = `<i class="ph-bold ph-heart text-base text-rose-400"></i> <span id="modalLikeCount">${bench.likes || 0}</span>`;
          }
        }
      }
    }).catch(() => {});

    // Tags
    const tagsContainer = document.getElementById('modalTagsContainer');
    tagsContainer.innerHTML = '';
    if (bench.tags && bench.tags.length > 0) {
      bench.tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700';
        tagEl.textContent = tag;
        tagsContainer.appendChild(tagEl);
      });
    }

    // Photo Gallery
    setupGallery(bench.photos || []);

    // Comments
    renderComments(bench.comments || []);

    // Set comment author placeholder depending on login status
    const commentAuthorInput = document.getElementById('commentAuthor');
    if (commentAuthorInput) {
      if (state.currentUser) {
        const uname = state.currentUser.user_metadata?.username || state.currentUser.email.split('@')[0];
        commentAuthorInput.placeholder = `Objavljuješ kao: ${uname} (ili upiši drugo ime)`;
      } else {
        commentAuthorInput.placeholder = 'Tvoje ime ili nadimak (neobavezno)';
      }
    }

    // Show modal
    const modal = document.getElementById('benchDetailModal');
    const card = document.getElementById('benchDetailCard');
    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      card.classList.remove('scale-95');
      card.classList.add('scale-100');
    }, 10);

  } catch (err) {
    console.error(err);
    showToast('Neuspjelo učitavanje detalja klupice.', 'error');
  }
}

// Gallery Carousel in Details Modal
function setupGallery(photos) {
  const track = document.getElementById('modalGalleryTrack');
  const dotsContainer = document.getElementById('galleryDots');
  const prevBtn = document.getElementById('galleryPrevBtn');
  const nextBtn = document.getElementById('galleryNextBtn');

  track.innerHTML = '';
  dotsContainer.innerHTML = '';
  state.currentGalleryIndex = 0;

  if (photos.length === 0) {
    track.innerHTML = `
      <div class="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-800 p-8">
        <i class="ph-bold ph-image text-4xl mb-1"></i>
        <span class="text-xs">Nema fotografija za ovu klupicu</span>
      </div>
    `;
    prevBtn.classList.add('opacity-0', 'pointer-events-none');
    nextBtn.classList.add('opacity-0', 'pointer-events-none');
    return;
  }

  photos.forEach((photo, idx) => {
    const slide = document.createElement('div');
    slide.className = 'w-full h-full flex-shrink-0 relative flex items-center justify-center bg-black';
    slide.innerHTML = `<img src="${photo.url}" alt="Slika klupice" class="max-h-[340px] w-full object-cover">`;
    track.appendChild(slide);

    if (photos.length > 1) {
      const dot = document.createElement('button');
      dot.className = `w-2 h-2 rounded-full transition-all ${idx === 0 ? 'bg-white w-4' : 'bg-white/50'}`;
      dot.addEventListener('click', () => gotoGallerySlide(idx, photos.length));
      dotsContainer.appendChild(dot);
    }
  });

  if (photos.length > 1) {
    prevBtn.classList.remove('opacity-0', 'pointer-events-none');
    nextBtn.classList.remove('opacity-0', 'pointer-events-none');
    prevBtn.onclick = () => {
      const newIdx = (state.currentGalleryIndex - 1 + photos.length) % photos.length;
      gotoGallerySlide(newIdx, photos.length);
    };
    nextBtn.onclick = () => {
      const newIdx = (state.currentGalleryIndex + 1) % photos.length;
      gotoGallerySlide(newIdx, photos.length);
    };
  } else {
    prevBtn.classList.add('opacity-0', 'pointer-events-none');
    nextBtn.classList.add('opacity-0', 'pointer-events-none');
  }

  gotoGallerySlide(0, photos.length);
}

function gotoGallerySlide(index, total) {
  state.currentGalleryIndex = index;
  const track = document.getElementById('modalGalleryTrack');
  track.style.transform = `translateX(-${index * 100}%)`;

  const dots = document.getElementById('galleryDots').children;
  Array.from(dots).forEach((dot, idx) => {
    dot.className = `w-2 h-2 rounded-full transition-all ${idx === index ? 'bg-white w-4' : 'bg-white/50'}`;
  });
}

// Render comments in details modal
function renderComments(comments) {
  const container = document.getElementById('modalCommentsList');
  document.getElementById('modalCommentsCount').textContent = comments.length;
  container.innerHTML = '';

  if (comments.length === 0) {
    container.innerHTML = `
      <p class="text-xs text-slate-400 italic py-2">Još nema komentara. Budite prvi koji će ostaviti dojam!</p>
    `;
    return;
  }

  comments.forEach(comment => {
    const el = document.createElement('div');
    el.className = 'bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-1';
    const safeAuthor = escapeHtml(comment.author || 'Anonimni šetač');
    const safeContent = escapeHtml(comment.content || '');
    el.innerHTML = `
      <div class="flex items-center justify-between text-[11px]">
        <span class="font-bold text-slate-200">${safeAuthor}</span>
        <span class="text-slate-400">${formatCroatianDate(comment.created_at)}</span>
      </div>
      <p class="text-xs sm:text-sm text-slate-300">${safeContent}</p>
    `;
    container.appendChild(el);
  });
}

// Like Button in Modal (Toggle: 1 lajk po računu ili IP adresi)
document.getElementById('modalLikeBtn').addEventListener('click', async () => {
  if (!state.selectedBench) return;
  const benchId = state.selectedBench.id;

  try {
    const res = await BenchAPI.likeBench(benchId, state.selectedBench.likes);
    const newLikes = (typeof res === 'object' && res.likes !== undefined) ? res.likes : res;
    const isLiked = (typeof res === 'object' && res.liked !== undefined) ? res.liked : true;

    state.selectedBench.likes = newLikes;
    const likeCountEl = document.getElementById('modalLikeCount');
    if (likeCountEl) likeCountEl.textContent = newLikes;

    const likeBtn = document.getElementById('modalLikeBtn');
    if (isLiked) {
      state.likedBenchIds.add(benchId);
      state.likedBenchIds.add(String(benchId));
      likeBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/70 bg-rose-600/20 text-rose-300 text-sm font-semibold transition-colors shadow-sm';
      likeBtn.innerHTML = `<i class="ph-fill ph-heart text-base text-rose-400"></i> <span id="modalLikeCount">${newLikes}</span>`;
      showToast('Dodano u favorite! ❤️');
    } else {
      state.likedBenchIds.delete(benchId);
      state.likedBenchIds.delete(String(benchId));
      state.likedBenchIds.delete(Number(benchId));
      likeBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-200 text-sm font-semibold transition-colors shadow-sm';
      likeBtn.innerHTML = `<i class="ph-bold ph-heart text-base text-rose-400"></i> <span id="modalLikeCount">${newLikes}</span>`;
      showToast('Uklonjeno iz favorita.');
    }

    localStorage.setItem('klupice_liked_benches', JSON.stringify([...state.likedBenchIds]));
    
    // Update in local benches array too
    const found = state.benches.find(b => b.id == benchId);
    if (found) found.likes = newLikes;
    renderSidePanelCards();
  } catch (err) {
    console.error('Like error:', err);
    showToast('Greška pri ocjenjivanju klupice.', 'error');
  }
});

// Comment submission form
document.getElementById('commentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.selectedBench) return;

  const contentInput = document.getElementById('commentContent');
  const content = contentInput.value.trim();
  if (!content) return;

  // 1. Anti-bot honeypot check
  if (document.getElementById('commentHoneypot')?.value) {
    console.warn('Bot detected via comment honeypot.');
    contentInput.value = '';
    showToast('Komentar uspješno dodan!');
    return;
  }

  // 2. Anti-spam cooldown check (10 sekundi)
  const now = Date.now();
  if (now - lastCommentSubmitTimestamp < COMMENT_COOLDOWN_MS) {
    const remaining = Math.ceil((COMMENT_COOLDOWN_MS - (now - lastCommentSubmitTimestamp)) / 1000);
    showToast(`Molimo pričekajte još ${remaining}s prije novog komentara.`, 'error');
    return;
  }

  const authorInput = document.getElementById('commentAuthor')?.value?.trim();
  let author = authorInput;
  if (!author) {
    if (state.currentUser) {
      author = state.currentUser.user_metadata?.username || state.currentUser.email.split('@')[0];
    } else {
      author = 'Anonimni šetač';
    }
  }
  const userId = state.currentUser ? state.currentUser.id : null;

  try {
    const updatedComments = await BenchAPI.addComment(state.selectedBench.id, author, content, userId);
    lastCommentSubmitTimestamp = Date.now();
    renderComments(updatedComments);
    contentInput.value = '';
    showToast('Komentar uspješno dodan!');
  } catch (err) {
    showToast('Greška pri slanju komentara.', 'error');
  }
});

// Close Detail Modal
function closeDetailModal() {
  const modal = document.getElementById('benchDetailModal');
  const card = document.getElementById('benchDetailCard');
  modal.classList.add('opacity-0');
  card.classList.remove('scale-100');
  card.classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
}
document.getElementById('closeDetailModalBtn').addEventListener('click', closeDetailModal);
document.getElementById('benchDetailModal').addEventListener('click', (e) => {
  if (e.target.id === 'benchDetailModal') closeDetailModal();
});

// Open Add Bench Modal with Coordinates
function openAddModalWithCoords(lat, lng) {
  state.pickedLocation = { lat, lng };
  document.getElementById('benchLatitude').value = lat.toFixed(6);
  document.getElementById('benchLongitude').value = lng.toFixed(6);
  document.getElementById('pickedCoordsText').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // Reverse geocode to find city / settlement name
  reverseGeocode(lat, lng);

  // Author identity display and anonymous toggle
  const authorLabel = document.getElementById('currentAuthorLabel');
  const anonToggle = document.getElementById('anonymousToggleContainer');
  const anonCheckbox = document.getElementById('postAsAnonymousCheckbox');

  if (state.currentUser) {
    const username = state.currentUser.user_metadata?.username || state.currentUser.email.split('@')[0];
    if (authorLabel) authorLabel.textContent = username;
    if (anonToggle) {
      anonToggle.classList.remove('hidden');
      anonToggle.classList.add('flex');
    }
    if (anonCheckbox) {
      anonCheckbox.checked = false;
      anonCheckbox.onchange = () => {
        if (authorLabel) {
          authorLabel.textContent = anonCheckbox.checked ? 'Anonimni šetač' : username;
        }
      };
    }
  } else {
    if (authorLabel) authorLabel.textContent = 'Anonimni šetač';
    if (anonToggle) {
      anonToggle.classList.add('hidden');
      anonToggle.classList.remove('flex');
    }
  }

  // If temp marker already exists on map, move it
  if (newBenchTempMarker) {
    newBenchTempMarker.setLatLng([lat, lng]);
  } else {
    newBenchTempMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'user-picked-marker',
        html: `<div class="w-6 h-6 rounded-full bg-brand-600 border-2 border-white shadow-lg animate-bounce flex items-center justify-center text-white text-xs font-bold">+</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      })
    }).addTo(map);
  }

  // Open modal
  const modal = document.getElementById('addBenchModal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modal.querySelector('.transform').classList.remove('scale-95');
    modal.querySelector('.transform').classList.add('scale-100');
  }, 10);
}

// Reverse Geocode via OpenStreetMap Nominatim
async function reverseGeocode(lat, lng) {
  try {
    const cityInput = document.getElementById('benchCity');
    cityInput.placeholder = 'Tražim grad...';
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`);
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const cityName = addr.city || addr.town || addr.village || addr.municipality || addr.county || 'Hrvatska';
      cityInput.value = cityName;
    }
  } catch (err) {
    console.log('Reverse geocoding unavailable, fallback to manual input');
  }
}

// Close Add Modal
function closeAddModal() {
  const modal = document.getElementById('addBenchModal');
  modal.classList.add('opacity-0');
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
    if (newBenchTempMarker) {
      map.removeLayer(newBenchTempMarker);
      newBenchTempMarker = null;
    }
  }, 200);
}
document.getElementById('closeAddModalBtn').addEventListener('click', closeAddModal);
document.getElementById('cancelAddBtn').addEventListener('click', closeAddModal);
document.getElementById('addBenchModal').addEventListener('click', (e) => {
  if (e.target.id === 'addBenchModal') closeAddModal();
});

// "Dodaj klupicu" Button in Top Bar
document.getElementById('openAddBenchBtn').addEventListener('click', () => {
  const center = map.getCenter();
  openAddModalWithCoords(center.lat, center.lng);
});

// Tags Selection Logic in Add Form
document.querySelectorAll('.tag-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tag = btn.dataset.tag;
    if (state.selectedTags.has(tag)) {
      state.selectedTags.delete(tag);
      btn.classList.remove('selected');
    } else {
      state.selectedTags.add(tag);
      btn.classList.add('selected');
    }
  });
});

// Photo Upload & Preview Logic
const dropZone = document.getElementById('dropZone');
const photoInput = document.getElementById('photoInput');
const previewGrid = document.getElementById('photosPreviewGrid');

dropZone.addEventListener('click', () => photoInput.click());

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('border-brand-500', 'bg-brand-50');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-brand-500', 'bg-brand-50');
  });
});

dropZone.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  handleSelectedFiles(files);
});

photoInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  handleSelectedFiles(files);
});

function handleSelectedFiles(files) {
  files.forEach(file => {
    state.uploadedFiles.push(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.createElement('div');
      preview.className = 'relative rounded-lg overflow-hidden h-20 bg-slate-100 border border-slate-200 group';
      preview.innerHTML = `
        <img src="${e.target.result}" class="w-full h-full object-cover">
        <button type="button" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center text-xs transition-opacity">
          &times;
        </button>
      `;

      preview.querySelector('button').addEventListener('click', (evt) => {
        evt.stopPropagation();
        const index = state.uploadedFiles.indexOf(file);
        if (index > -1) state.uploadedFiles.splice(index, 1);
        preview.remove();
      });

      previewGrid.appendChild(preview);
    };
    reader.readAsDataURL(file);
  });
}

// Add Bench Form Submission
document.getElementById('addBenchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.getElementById('submitBenchBtn');

  // 1. Anti-bot honeypot check
  if (document.getElementById('benchHoneypot')?.value) {
    console.warn('Bot detected via bench honeypot.');
    form.reset();
    closeAddModal();
    showToast('Klupica uspješno dodana! 🎉');
    return;
  }

  // 2. Anti-spam cooldown check (25 sekundi)
  const now = Date.now();
  if (now - lastBenchSubmitTimestamp < BENCH_COOLDOWN_MS) {
    const remaining = Math.ceil((BENCH_COOLDOWN_MS - (now - lastBenchSubmitTimestamp)) / 1000);
    showToast(`Molimo pričekajte još ${remaining}s prije dodavanja nove klupice.`, 'error');
    return;
  }

  submitBtn.disabled = true;
  const hasPhotos = state.uploadedFiles.length > 0;
  submitBtn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> ${hasPhotos ? 'Spremanje i upload slika...' : 'Spremanje klupice...'}`;

  try {
    const condition = form.querySelector('input[name="condition"]:checked')?.value || 'A';
    const rawTitle = document.getElementById('benchTitle').value.trim();
    const city = document.getElementById('benchCity').value.trim() || 'Hrvatska';
    // If title is empty, generate clean default
    const title = rawTitle || (city !== 'Hrvatska' ? `Klupica (${city})` : 'Klupica');
    const description = document.getElementById('benchDescription').value.trim();
    
    // Author & User ID: Check if logged in & whether anonymous checkbox is checked
    const isAnonymous = !state.currentUser || (document.getElementById('postAsAnonymousCheckbox')?.checked);
    const author = isAnonymous
      ? 'Anonimni šetač'
      : (state.currentUser.user_metadata?.username || state.currentUser.email.split('@')[0]);
    const userId = isAnonymous ? null : state.currentUser.id;

    const benchPayload = {
      title: title,
      city: city,
      description: description,
      latitude: document.getElementById('benchLatitude').value,
      longitude: document.getElementById('benchLongitude').value,
      condition: condition, // Peak, S, A, B, C, F
      tags: Array.from(state.selectedTags),
      author: author,
      userId: userId
    };

    const createdBench = await BenchAPI.createBench(benchPayload, state.uploadedFiles);
    lastBenchSubmitTimestamp = Date.now();
    showToast('Klupica uspješno dodana! 🎉');

    // Reset Form
    form.reset();
    previewGrid.innerHTML = '';
    state.uploadedFiles = [];
    state.selectedTags.clear();
    document.querySelectorAll('.tag-toggle-btn').forEach(btn => btn.classList.remove('selected'));

    closeAddModal();

    // Reload benches and focus on the new one
    await loadBenches();
    map.flyTo([createdBench.latitude, createdBench.longitude], 15);
    setTimeout(() => {
      openBenchDetailModal(createdBench.id);
    }, 1200);

  } catch (err) {
    console.error(err);
    showToast(err.message || 'Greška pri objavi klupice.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="ph-bold ph-check"></i> <span>Objavi klupicu</span>`;
  }
});

// GPS Geolocation Handler
function triggerGeolocation(centerMap = true) {
  if (!navigator.geolocation) {
    showToast('Vaš preglednik ne podržava geolociranje.', 'error');
    return;
  }

  showToast('Tražim vašu lokaciju...');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (userLocationMarker) {
        userLocationMarker.setLatLng([lat, lng]);
      } else {
        userLocationMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'user-gps-container',
            html: '<div class="user-gps-marker"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        }).addTo(map);
      }

      if (centerMap) {
        map.flyTo([lat, lng], 14);
      }

      document.getElementById('benchLatitude').value = lat.toFixed(6);
      document.getElementById('benchLongitude').value = lng.toFixed(6);
      document.getElementById('pickedCoordsText').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      reverseGeocode(lat, lng);

      showToast('Pronađena vaša lokacija! 📍');
    },
    (err) => {
      console.warn('Geolocation error:', err);
      showToast('Nije moguće dohvatiti lokaciju (provjerite dozvole preglednika).', 'error');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

document.getElementById('locateMeBtn').addEventListener('click', () => triggerGeolocation(true));
document.getElementById('useGpsInsideModalBtn').addEventListener('click', () => triggerGeolocation(false));

// Side Panel Toggle
const sidePanel = document.getElementById('sidePanel');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const closeSidePanelBtn = document.getElementById('closeSidePanelBtn');

function toggleSidePanel() {
  const isClosed = sidePanel.classList.contains('translate-x-full');
  if (isClosed) {
    sidePanel.classList.remove('translate-x-full');
  } else {
    sidePanel.classList.add('translate-x-full');
  }
}

sidebarToggleBtn.addEventListener('click', toggleSidePanel);
closeSidePanelBtn.addEventListener('click', () => sidePanel.classList.add('translate-x-full'));

// City Filter Buttons
document.querySelectorAll('.city-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.city-filter').forEach(b => {
      b.className = 'city-filter px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60 transition-all';
    });
    btn.className = 'city-filter active px-3 py-1 rounded-full text-xs font-medium bg-brand-600 text-white shadow-sm border border-brand-500 transition-all';

    state.activeCity = btn.dataset.city;
    loadBenches();

    const cityCenters = {
      'Zagreb': [45.8150, 15.9819],
      'Split': [43.5081, 16.4402],
      'Rijeka': [45.3271, 14.4422],
      'Zadar': [44.1194, 15.2314],
      'Osijek': [45.5550, 18.6955],
      'Dubrovnik': [42.6507, 18.0944],
      'Opatija': [45.3375, 14.3050],
      'Rovinj': [45.0812, 13.6387]
    };
    if (cityCenters[state.activeCity]) {
      map.flyTo(cityCenters[state.activeCity], 13);
    } else if (state.activeCity === 'sve') {
      map.flyTo([44.8, 16.3], 7.5);
    }
  });
});

// Uploader Filter Buttons (Sve / Korisnici / Anonimno / AI)
document.querySelectorAll('.uploader-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    const uploaderType = btn.dataset.uploader || 'sve';
    state.activeUploader = uploaderType;

    document.querySelectorAll('.uploader-filter').forEach(b => {
      b.className = 'uploader-filter py-1.5 px-1.5 rounded-lg text-xs font-medium text-center bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white border border-slate-700/60 transition-all flex items-center justify-center gap-1';
    });
    btn.className = 'uploader-filter active py-1.5 px-1.5 rounded-lg text-xs font-medium text-center bg-brand-600 text-white shadow-sm border border-brand-500 transition-all flex items-center justify-center gap-1';

    updateResetFiltersVisibility();
    loadBenches();
  });
});

// Tag Filter Buttons (Multi-Select: allows selecting more than 1 tag simultaneously)
document.querySelectorAll('.tag-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    const tag = btn.dataset.tag;
    if (state.activeTags.has(tag)) {
      state.activeTags.delete(tag);
      btn.className = 'tag-filter px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60 transition-all';
    } else {
      state.activeTags.add(tag);
      btn.className = 'tag-filter px-2.5 py-1 rounded-full text-xs font-medium bg-brand-600 text-white shadow-sm border border-brand-500 transition-all';
    }
    updateResetFiltersVisibility();
    loadBenches();
  });
});

// Helper: Show or hide the reset filters button in side panel
function updateResetFiltersVisibility() {
  const resetBtn = document.getElementById('activeFilterResetBtn');
  if (!resetBtn) return;
  const hasActiveFilters = Boolean(
    (state.activeTags && state.activeTags.size > 0) || 
    (state.activeUploader && state.activeUploader !== 'sve') || 
    state.activeSearch || 
    (state.activeCity && state.activeCity !== 'sve')
  );
  if (hasActiveFilters) {
    resetBtn.classList.remove('hidden');
  } else {
    resetBtn.classList.add('hidden');
  }
}

// Reset filters button click
document.getElementById('activeFilterResetBtn')?.addEventListener('click', () => {
  state.activeTags.clear();
  state.activeUploader = 'sve';
  state.activeSearch = '';
  document.getElementById('panelSearchInput').value = '';
  document.getElementById('globalSearchInput').value = '';

  document.querySelectorAll('.tag-filter').forEach(b => {
    b.className = 'tag-filter px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60 transition-all';
  });
  document.querySelectorAll('.uploader-filter').forEach(b => {
    if (b.dataset.uploader === 'sve') {
      b.className = 'uploader-filter active py-1.5 px-1.5 rounded-lg text-xs font-medium text-center bg-brand-600 text-white shadow-sm border border-brand-500 transition-all flex items-center justify-center gap-1';
    } else {
      b.className = 'uploader-filter py-1.5 px-1.5 rounded-lg text-xs font-medium text-center bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white border border-slate-700/60 transition-all flex items-center justify-center gap-1';
    }
  });

  updateResetFiltersVisibility();
  loadBenches();
});

// Search inputs (Debounced)
let searchTimeout = null;
function handleSearch(val) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.activeSearch = val.trim();
    updateResetFiltersVisibility();
    loadBenches();
  }, 300);
}

document.getElementById('globalSearchInput').addEventListener('input', (e) => {
  handleSearch(e.target.value);
  document.getElementById('panelSearchInput').value = e.target.value;
});
document.getElementById('panelSearchInput').addEventListener('input', (e) => {
  handleSearch(e.target.value);
  document.getElementById('globalSearchInput').value = e.target.value;
});

// Toast notification function
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  toastMsg.textContent = msg;
  if (type === 'error') {
    toastIcon.className = 'ph-bold ph-warning-circle text-rose-400 text-lg';
  } else {
    toastIcon.className = 'ph-bold ph-check-circle text-brand-400 text-lg';
  }

  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3500);
}

// Check URL params for direct link to a bench (e.g. ?bench=3)
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const benchId = params.get('bench');
  if (benchId) {
    setTimeout(() => {
      openBenchDetailModal(benchId);
    }, 600);
  }
}

// ==========================================
// Authentication & User Account Management
// ==========================================
let currentAuthMode = 'login'; // 'login' or 'register'

function setAuthMode(mode) {
  currentAuthMode = mode;
  const modalTitle = document.getElementById('authModalTitle');
  const modalSubtitle = document.getElementById('authModalSubtitle');
  const tabLogin = document.getElementById('authTabLogin');
  const tabRegister = document.getElementById('authTabRegister');
  const usernameField = document.getElementById('authUsernameField');
  const usernameInput = document.getElementById('authUsernameInput');
  const emailLabel = document.getElementById('authEmailLabel');
  const emailInput = document.getElementById('authEmailInput');
  const submitBtn = document.getElementById('authSubmitBtn');
  const switchPrompt = document.getElementById('authSwitchPrompt');
  const switchBtn = document.getElementById('authSwitchBtn');
  const alertEl = document.getElementById('authAlert');

  if (alertEl) {
    alertEl.classList.add('hidden');
    alertEl.textContent = '';
  }

  if (mode === 'login') {
    if (modalTitle) modalTitle.textContent = 'Prijava na račun';
    if (modalSubtitle) modalSubtitle.textContent = 'Prijava putem korisničkog imena ili e-maila';
    if (tabLogin) {
      tabLogin.className = 'flex-1 py-2 text-xs font-bold rounded-lg text-white bg-slate-800 shadow-sm transition-all text-center';
    }
    if (tabRegister) {
      tabRegister.className = 'flex-1 py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-slate-200 transition-all text-center';
    }
    if (usernameField) usernameField.classList.add('hidden');
    if (usernameInput) usernameInput.removeAttribute('required');
    if (emailLabel) emailLabel.textContent = 'Korisničko ime ili E-mail';
    if (emailInput) {
      emailInput.type = 'text';
      emailInput.placeholder = 'Korisničko ime ili e-mail adresa';
    }
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="ph-bold ph-sign-in"></i> <span>Prijavi se</span>';
    }
    if (switchPrompt) switchPrompt.textContent = 'Nemaš račun?';
    if (switchBtn) switchBtn.textContent = 'Registriraj se';
  } else {
    if (modalTitle) modalTitle.textContent = 'Registracija novog računa';
    if (modalSubtitle) modalSubtitle.textContent = 'Kreiraj račun za trajno povezivanje klupica';
    if (tabLogin) {
      tabLogin.className = 'flex-1 py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-slate-200 transition-all text-center';
    }
    if (tabRegister) {
      tabRegister.className = 'flex-1 py-2 text-xs font-bold rounded-lg text-white bg-slate-800 shadow-sm transition-all text-center';
    }
    if (usernameField) usernameField.classList.remove('hidden');
    if (usernameInput) usernameInput.setAttribute('required', 'true');
    if (emailLabel) emailLabel.textContent = 'E-mail adresa';
    if (emailInput) {
      emailInput.type = 'email';
      emailInput.placeholder = 'tvoj@email.com';
    }
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="ph-bold ph-user-plus"></i> <span>Registriraj se</span>';
    }
    if (switchPrompt) switchPrompt.textContent = 'Već imaš račun?';
    if (switchBtn) switchBtn.textContent = 'Prijavi se';
  }
}

function showAuthAlert(message, type = 'error') {
  const alertEl = document.getElementById('authAlert');
  if (!alertEl) return;
  alertEl.classList.remove('hidden');
  if (type === 'error') {
    alertEl.className = 'p-3 rounded-lg text-xs font-medium border bg-red-950/80 text-red-200 border-red-800/80 flex items-center gap-2';
    alertEl.innerHTML = `<i class="ph-bold ph-warning-circle text-red-400 text-sm"></i> <span>${message}</span>`;
  } else {
    alertEl.className = 'p-3 rounded-lg text-xs font-medium border bg-emerald-950/80 text-emerald-200 border-emerald-800/80 flex items-center gap-2';
    alertEl.innerHTML = `<i class="ph-bold ph-check-circle text-emerald-400 text-sm"></i> <span>${message}</span>`;
  }
}

function openAuthModal(mode = 'login') {
  setAuthMode(mode);
  const emailInput = document.getElementById('authEmailInput');
  const passwordInput = document.getElementById('authPasswordInput');
  const usernameInput = document.getElementById('authUsernameInput');
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (usernameInput) usernameInput.value = '';

  const modal = document.getElementById('authModal');
  const card = modal?.querySelector('.transform') || modal?.firstElementChild;
  if (!modal) return;
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    if (card) {
      card.classList.remove('scale-95');
      card.classList.add('scale-100');
    }
  }, 10);
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  const card = modal?.querySelector('.transform') || modal?.firstElementChild;
  if (!modal) return;
  modal.classList.add('opacity-0');
  if (card) {
    card.classList.remove('scale-100');
    card.classList.add('scale-95');
  }
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
}

function renderAuthUI() {
  const loginBtn = document.getElementById('authLoginBtn');
  const userMenu = document.getElementById('authUserMenu');
  const usernameDisplay = document.getElementById('authUsernameDisplay');

  if (state.currentUser) {
    const username = state.currentUser.user_metadata?.username || state.currentUser.email.split('@')[0];
    if (usernameDisplay) usernameDisplay.textContent = username;
    if (loginBtn) loginBtn.classList.add('hidden');
    if (userMenu) {
      userMenu.classList.remove('hidden');
      userMenu.classList.add('flex');
    }
  } else {
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (userMenu) {
      userMenu.classList.add('hidden');
      userMenu.classList.remove('flex');
    }
  }
}

async function checkAuthStatus() {
  try {
    state.currentUser = await BenchAPI.getCurrentUser();
    renderAuthUI();
  } catch (err) {
    console.warn('Greška pri provjeri korisničke sesije:', err);
    state.currentUser = null;
    renderAuthUI();
  }
}

// Wire up auth event listeners
document.getElementById('authLoginBtn')?.addEventListener('click', () => openAuthModal('login'));
document.getElementById('closeAuthModalBtn')?.addEventListener('click', closeAuthModal);
document.getElementById('authModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'authModal') closeAuthModal();
});

document.getElementById('authTabLogin')?.addEventListener('click', () => setAuthMode('login'));
document.getElementById('authTabRegister')?.addEventListener('click', () => setAuthMode('register'));
document.getElementById('authSwitchBtn')?.addEventListener('click', () => {
  setAuthMode(currentAuthMode === 'login' ? 'register' : 'login');
});

// Logout action
document.getElementById('authLogoutBtn')?.addEventListener('click', async () => {
  try {
    await BenchAPI.signOut();
    state.currentUser = null;
    renderAuthUI();
    showToast('Uspješno ste se odjavili!');
  } catch (err) {
    console.error('Logout error:', err);
    showToast('Greška pri odjavi.', 'error');
  }
});

// Auth form submission (Sign In or Sign Up)
document.getElementById('authForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('authSubmitBtn');
  const identifier = document.getElementById('authEmailInput')?.value.trim();
  const password = document.getElementById('authPasswordInput')?.value;
  const username = document.getElementById('authUsernameInput')?.value.trim();

  if (!identifier || !password) return;

  const originalBtnHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> <span>${currentAuthMode === 'login' ? 'Prijava...' : 'Registracija...'}</span>`;

  try {
    if (currentAuthMode === 'login') {
      const data = await BenchAPI.signIn(identifier, password);
      state.currentUser = data.user || await BenchAPI.getCurrentUser();
      renderAuthUI();
      closeAuthModal();
      showToast(`Dobrodošao natrag, ${state.currentUser?.user_metadata?.username || identifier}! 👋`);
    } else {
      const data = await BenchAPI.signUp(identifier, password, username);
      state.currentUser = data.user || await BenchAPI.getCurrentUser();
      renderAuthUI();

      // If email confirmation is required by Supabase project settings
      if (data.user && !data.session && !data.user.confirmed_at) {
        showAuthAlert('Registracija uspješna! Molimo provjerite e-mail za potvrdu računa.', 'success');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
        return;
      }

      closeAuthModal();
      showToast(`Račun uspješno kreiran! Dobrodošao, ${username || identifier.split('@')[0]}! 🎉`);
    }
  } catch (err) {
    console.error('Auth error:', err);
    let errorMsg = 'Došlo je do greške. Pokušajte ponovno.';
    if (err.message) {
      if (err.message.includes('Invalid login credentials')) {
        errorMsg = 'Pogrešno korisničko ime/e-mail ili lozinka.';
      } else if (err.message.includes('User already registered')) {
        errorMsg = 'Korisnik s ovim e-mailom već postoji.';
      } else if (err.message.includes('već zauzeto')) {
        errorMsg = err.message;
      } else if (err.message.includes('nije pronađeno')) {
        errorMsg = err.message;
      } else if (err.message.includes('Password should be at least')) {
        errorMsg = 'Lozinka mora imati najmanje 6 znakova.';
      } else if (err.message.includes('valid email')) {
        errorMsg = 'Molimo unesite valjanu e-mail adresu.';
      } else {
        errorMsg = err.message;
      }
    }
    showAuthAlert(errorMsg, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnHtml;
  }
});

// ====================================================================
// USER PROFILE & BENCH MANAGEMENT (Uređivanje unesenih klupica)
// ====================================================================

function openUserProfileModal() {
  if (!state.currentUser) {
    openAuthModal('login');
    return;
  }

  const modal = document.getElementById('userProfileModal');
  const username = state.currentUser.user_metadata?.username || state.currentUser.email.split('@')[0];
  const email = state.currentUser.email || '';

  const userEl = document.getElementById('profileUsername');
  const emailEl = document.getElementById('profileEmail');
  if (userEl) userEl.textContent = username;
  if (emailEl) emailEl.textContent = email;

  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modal.firstElementChild?.classList.remove('scale-95');
  }, 10);

  loadUserBenches();
}

function closeUserProfileModal() {
  const modal = document.getElementById('userProfileModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  modal.firstElementChild?.classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
}

async function loadUserBenches() {
  if (!state.currentUser) return;
  const loading = document.getElementById('userBenchesLoading');
  const emptyState = document.getElementById('userBenchesEmpty');
  const listContainer = document.getElementById('userBenchesList');
  const countBadge = document.getElementById('userBenchesCountBadge');

  if (loading) loading.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');
  if (listContainer) listContainer.innerHTML = '';

  try {
    const benches = await BenchAPI.getUserBenches(state.currentUser.id);
    state.userBenches = benches || [];

    if (loading) loading.classList.add('hidden');
    if (countBadge) countBadge.textContent = `${state.userBenches.length} ${state.userBenches.length === 1 ? 'klupica' : 'klupica'}`;

    if (state.userBenches.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    // Render cards
    state.userBenches.forEach(bench => {
      const card = document.createElement('div');
      card.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition gap-3';
      
      const thumbUrl = bench.photos && bench.photos[0] ? bench.photos[0].url : null;
      const thumbHtml = thumbUrl 
        ? `<img src="${escapeHtml(thumbUrl)}" class="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-slate-800" alt="">`
        : `<div class="w-14 h-14 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 flex-shrink-0"><i class="ph-bold ph-armchair text-2xl"></i></div>`;

      card.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          ${thumbHtml}
          <div class="min-w-0">
            <h4 class="font-bold text-white text-xs sm:text-sm truncate">${escapeHtml(bench.title || 'Klupica')}</h4>
            <div class="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
              <span class="flex items-center gap-0.5 text-slate-300">
                <i class="ph-bold ph-map-pin text-brand-400"></i> ${escapeHtml(bench.city || 'Hrvatska')}
              </span>
              <span>•</span>
              <span class="flex items-center gap-1 text-rose-400 font-medium">
                <i class="ph-fill ph-heart"></i> ${bench.likes || 0}
              </span>
              <span>•</span>
              ${getConditionBadge(bench.condition)}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button 
            type="button" 
            class="view-bench-from-profile px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition border border-slate-700 flex items-center gap-1 cursor-pointer"
            title="Prikaži na karti"
          >
            <i class="ph-bold ph-map-trifold"></i>
            <span class="hidden sm:inline">Prikaži</span>
          </button>
          <button 
            type="button" 
            class="edit-bench-from-profile px-2.5 py-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg transition border border-amber-500/30 flex items-center gap-1 cursor-pointer"
            title="Uredi podatke o klupici"
          >
            <i class="ph-bold ph-pencil-simple"></i>
            <span>Uredi</span>
          </button>
        </div>
      `;

      // Wire view button
      card.querySelector('.view-bench-from-profile')?.addEventListener('click', () => {
        closeUserProfileModal();
        if (map && bench.latitude && bench.longitude) {
          map.setView([bench.latitude, bench.longitude], 16, { animate: true });
        }
        openBenchDetail(bench.id);
      });

      // Wire edit button
      card.querySelector('.edit-bench-from-profile')?.addEventListener('click', () => {
        openEditBenchModal(bench);
      });

      listContainer.appendChild(card);
    });

  } catch (err) {
    if (loading) loading.classList.add('hidden');
    console.error('Greška pri učitavanju korisničkih klupica:', err);
    showToast('Greška pri dohvaćanju vaših klupica.', 'error');
  }
}

// EDIT BENCH MODAL LOGIC
function openEditBenchModal(bench) {
  if (!bench) return;

  const benchIdInput = document.getElementById('editBenchId');
  const titleInput = document.getElementById('editBenchTitle');
  const cityInput = document.getElementById('editBenchCity');
  const descInput = document.getElementById('editBenchDescription');

  if (benchIdInput) benchIdInput.value = bench.id;
  if (titleInput) titleInput.value = bench.title || '';
  if (cityInput) cityInput.value = bench.city || '';
  if (descInput) descInput.value = bench.description || '';

  // Select matching radio
  const radios = document.querySelectorAll('input[name="editCondition"]');
  radios.forEach(r => {
    r.checked = (r.value === bench.condition);
  });

  // Populate tags
  state.editSelectedTags = new Set(bench.tags || []);
  updateEditTagsUI();

  // Hide alert
  const alertEl = document.getElementById('editBenchAlert');
  if (alertEl) {
    alertEl.className = 'hidden';
    alertEl.textContent = '';
  }

  // Open modal
  const modal = document.getElementById('editBenchModal');
  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      modal.firstElementChild?.classList.remove('scale-95');
    }, 10);
  }
}

function closeEditBenchModal() {
  const modal = document.getElementById('editBenchModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  modal.firstElementChild?.classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
}

function updateEditTagsUI() {
  document.querySelectorAll('.edit-tag-btn').forEach(btn => {
    const tag = btn.getAttribute('data-tag');
    if (state.editSelectedTags.has(tag)) {
      btn.className = 'edit-tag-btn px-2.5 py-1 text-xs rounded-full border border-brand-500 bg-brand-950 text-brand-300 font-semibold shadow-sm transition-all cursor-pointer';
    } else {
      btn.className = 'edit-tag-btn px-2.5 py-1 text-xs rounded-full border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all cursor-pointer';
    }
  });
}

// Wire edit tag buttons
document.querySelectorAll('.edit-tag-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tag = btn.getAttribute('data-tag');
    if (state.editSelectedTags.has(tag)) {
      state.editSelectedTags.delete(tag);
    } else {
      state.editSelectedTags.add(tag);
    }
    updateEditTagsUI();
  });
});

// Edit Bench Form Submit
document.getElementById('editBenchForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const benchId = document.getElementById('editBenchId').value;
  const title = document.getElementById('editBenchTitle').value.trim();
  const city = document.getElementById('editBenchCity').value.trim();
  const condition = document.querySelector('input[name="editCondition"]:checked')?.value || 'B';
  const description = document.getElementById('editBenchDescription').value.trim();
  const tags = Array.from(state.editSelectedTags);

  const saveBtn = document.getElementById('saveEditBenchBtn');
  const originalHtml = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ph-bold ph-spinner animate-spin"></i> <span>Spremanje...</span>';
  }

  try {
    const updatedBench = await BenchAPI.updateBench(benchId, {
      title,
      city,
      condition,
      description,
      tags
    });

    // Update in state.benches
    const idx = state.benches.findIndex(b => b.id == benchId);
    if (idx !== -1) {
      state.benches[idx] = { ...state.benches[idx], ...updatedBench, title, city, condition, description, tags };
    }

    // Update in state.selectedBench if currently open
    if (state.selectedBench && state.selectedBench.id == benchId) {
      state.selectedBench = { ...state.selectedBench, ...updatedBench, title, city, condition, description, tags };
      renderDetailModal(state.selectedBench);
    }

    // Refresh UI
    renderMarkers();
    renderSidePanelCards();

    // Refresh User Profile list if open
    loadUserBenches();

    closeEditBenchModal();
    showToast('Klupica je uspješno ažurirana! ✨');
  } catch (err) {
    console.error('Greška pri spremanju izmjena klupice:', err);
    const alertEl = document.getElementById('editBenchAlert');
    if (alertEl) {
      alertEl.className = 'p-3 rounded-lg text-xs font-medium border bg-rose-950/70 text-rose-300 border-rose-800 block';
      alertEl.textContent = 'Došlo je do greške: ' + (err.message || 'Provjerite internetsku vezu i pokušajte ponovno.');
    }
    showToast('Greška pri spremanju izmjena.', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  }
});

// Event listeners for profile and edit modal triggers
document.getElementById('openProfileBtn')?.addEventListener('click', openUserProfileModal);
document.getElementById('closeUserProfileBtn')?.addEventListener('click', closeUserProfileModal);
document.getElementById('userProfileModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'userProfileModal') closeUserProfileModal();
});
document.getElementById('profileAddBenchCTA')?.addEventListener('click', () => {
  closeUserProfileModal();
  document.getElementById('openAddBenchBtn')?.click();
});

document.getElementById('modalEditBenchBtn')?.addEventListener('click', () => {
  if (state.selectedBench) openEditBenchModal(state.selectedBench);
});
document.getElementById('closeEditBenchBtn')?.addEventListener('click', closeEditBenchModal);
document.getElementById('cancelEditBtn')?.addEventListener('click', closeEditBenchModal);
document.getElementById('editBenchModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'editBenchModal') closeEditBenchModal();
});

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  const isLive = initSupabase();

  initMap();
  loadBenches();
  checkUrlParams();
  checkAuthStatus();

  BenchAPI.onAuthStateChange((event, session) => {
    state.currentUser = session?.user || null;
    renderAuthUI();
  });

  if (isLive) {
    BenchAPI.subscribeToChanges(() => {
      console.log('Realtime promjena u bazi - osvježavam klupice');
      loadBenches();
    });
  }
});
