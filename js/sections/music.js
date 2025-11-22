// js/sections/music.js

import { tracks, videos, releases, favorites, recentTracks, getAllArtists, getArtistStats } from '../data.js';
import { escapeHtml } from '../utils.js';
import { getSupabaseClient } from '../supabase.js';
import { createTrackCard, createVideoCard, createArtistCard } from '../ui/render.js';

let state = {
  query: '',
  type: 'all', // all | tracks | artists | releases | videos
  favoritesOnly: false,
  sort: 'recent', // recent | az
  year: '',
  label: '',
  multiTypes: new Set(),
  selArtists: new Set()
};

let els = {};
let debounceTimer = null;
let initialized = false;
let labelsMeta = [];
let labelsMetaLoaded = false;
const FILTERS_KEY = 'music_filters_v1';

function qs(id) { return document.getElementById(id); }

function getReleaseLabelName(rel){
  try {
    if (!rel) return '';
    if (rel.labelId && labelsMeta && labelsMeta.length) {
      const l = labelsMeta.find(x => String(x.id) === String(rel.labelId));
      if (l && l.name) return l.name;
    }
    if (rel.credits) {
      const c = rel.credits;
      return c.label || c.Label || c.editora || c.publisher || '';
    }
  } catch(_) {}
  return '';
}

function openFilters() {
  if (els.panel) els.panel.style.display = '';
  syncFacetControls();
}

function closeFilters() { if (els.panel) els.panel.style.display = 'none'; }

function toggleFilters() {
  if (!els.panel) return;
  const isHidden = (els.panel.style.display === 'none') || (getComputedStyle(els.panel).display === 'none');
  if (isHidden === true) openFilters(); else closeFilters();
}

function syncFacetControls() {
  if (els.facetTypeTracks) els.facetTypeTracks.checked = state.multiTypes.has('tracks');
  if (els.facetTypeArtists) els.facetTypeArtists.checked = state.multiTypes.has('artists');
  if (els.facetTypeLabels) els.facetTypeLabels.checked = state.multiTypes.has('labels');
  if (els.facetTypeReleases) els.facetTypeReleases.checked = state.multiTypes.has('releases');
  if (els.facetTypeVideos) els.facetTypeVideos.checked = state.multiTypes.has('videos');
  if (els.facetFavorites) els.facetFavorites.checked = !!state.favoritesOnly;
  if (els.facetSort) els.facetSort.value = state.sort || 'recent';
}

function populateArtistsFacetList(filterText) {
  const all = getAllArtists();
  const q = (filterText || '').toLowerCase();
  const list = q ? all.filter(a => a.toLowerCase().includes(q)) : all;
  if (!els.facetArtistsList) return;
  els.facetArtistsList.innerHTML = list.map(name => {
    const id = 'facet-artist-' + name.replace(/[^a-z0-9]+/gi, '-');
    const checked = state.selArtists.has(name) ? 'checked' : '';
    return `<label class="filter-check"><input type="checkbox" id="${id}" value="${name}" ${checked}> ${name}</label>`;
  }).join('');
  // Bind changes
  try {
    Array.from(els.facetArtistsList.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
      cb.addEventListener('change', () => {
        const val = cb.value;
        if (cb.checked) state.selArtists.add(val); else state.selArtists.delete(val);
        renderChips();
      });
    });
  } catch (_) {}
}

function bindUI() {
  els.search = qs('music-search-input');
  els.type = qs('music-type');
  els.favs = qs('music-favorites');
  els.sort = qs('music-sort');
  els.year = qs('music-year');
  els.label = qs('music-label');
  els.btnFilters = qs('music-filters-btn');
  els.panel = qs('music-filters-panel');
  els.chips = qs('music-active-chips');
  els.btnFiltersClear = document.getElementById('filters-clear');
  // painel de filtros
  els.facetFavorites = document.getElementById('facet-favorites');
  els.facetSort = document.getElementById('facet-sort');
  els.facetTypeTracks = document.getElementById('facet-type-tracks');
  els.facetTypeArtists = document.getElementById('facet-type-artists');
  els.facetTypeLabels = document.getElementById('facet-type-labels');
  els.facetTypeReleases = document.getElementById('facet-type-releases');
  els.facetTypeVideos = document.getElementById('facet-type-videos');
  els.facetLabelSearch = document.getElementById('facet-label-search');
  els.facetLabelsList = document.getElementById('facet-labels-list');

  els.grpTracks = qs('music-results-tracks');
  els.grpArtists = qs('music-results-artists');
  els.grpLabels = qs('music-results-labels');
  els.grpReleases = qs('music-results-releases');
  els.grpVideos = qs('music-results-videos');

  els.gridTracks = qs('music-results-tracks-grid');
  els.gridArtists = qs('music-results-artists-grid');
  els.gridLabels = qs('music-results-labels-grid');
  els.gridReleases = qs('music-results-releases-grid');
  els.gridVideos = qs('music-results-videos-grid');

  if (els.search) {
    els.search.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.query = (els.search.value || '').trim();
        saveFilters();
        render();
      }, 250);
    });
  }
  if (els.type) {
    els.type.addEventListener('change', () => {
      state.type = els.type.value;
      updateFavsVisibility();
      updateFacetVisibility();
      saveFilters();
      render();
    });
  }
  if (els.favs) {
    els.favs.addEventListener('change', () => {
      state.favoritesOnly = !!els.favs.checked;
      saveFilters();
      render();
    });
  }
  if (els.sort) {
    els.sort.addEventListener('change', () => {
      state.sort = els.sort.value;
      saveFilters();
      render();
    });
  }
  if (els.year) {
    els.year.addEventListener('change', () => {
      state.year = els.year.value || '';
      saveFilters();
      render();
    });
  }
  if (els.label) {
    els.label.addEventListener('change', () => {
      state.label = els.label.value || '';
      saveFilters();
      render();
    });
  }

  if (els.btnFilters) { els.btnFilters.addEventListener('click', () => toggleFilters()); }
  if (els.btnFiltersClear) {
    els.btnFiltersClear.addEventListener('click', () => {
      state.multiTypes.clear();
      state.selArtists.clear();
      state.favoritesOnly = false;
      state.sort = 'recent';
      syncFacetControls();
      renderChips();
      saveFilters();
      render();
    });
  }
  // favoritos e sort dentro do painel
  if (els.facetFavorites) {
    els.facetFavorites.checked = !!state.favoritesOnly;
    els.facetFavorites.addEventListener('change', () => {
      state.favoritesOnly = !!els.facetFavorites.checked;
      saveFilters();
      render();
    });
  }
  if (els.facetSort) {
    els.facetSort.value = state.sort;
    els.facetSort.addEventListener('change', () => {
      state.sort = els.facetSort.value || 'recent';
      saveFilters();
      render();
    });
  }
  // facet type checkboxes
  [els.facetTypeTracks, els.facetTypeArtists, els.facetTypeLabels, els.facetTypeReleases, els.facetTypeVideos].forEach(cb => {
    if (!cb) return;
    cb.addEventListener('change', () => {
      const v = cb.value;
      if (cb.checked) state.multiTypes.add(v); else state.multiTypes.delete(v);
      renderChips();
      saveFilters();
      render();
    });
  });

  if (els.facetLabelSearch) {
    els.facetLabelSearch.addEventListener('input', () => {
      const q = (els.facetLabelSearch.value || '').trim();
      populateLabelsFacetList(q);
    });
  }
}

function updateFavsVisibility() {
  const wrapper = document.getElementById('music-favs-wrapper');
  if (!wrapper) return;
  wrapper.style.display = (state.type === 'tracks' || state.type === 'all') ? '' : 'none';
}

function updateFacetVisibility() {
  const showFor = (state.type === 'tracks' || state.type === 'releases' || state.type === 'all');
  try {
    if (els.year) {
      if (els.year.hasAttribute('data-temp-hide')) {
        els.year.style.display = 'none';
      } else {
        els.year.style.display = showFor ? '' : 'none';
      }
    }
  } catch (_) {}
  try {
    if (els.label) {
      if (els.label.hasAttribute('data-temp-hide')) {
        els.label.style.display = 'none';
      } else {
        els.label.style.display = showFor ? '' : 'none';
      }
    }
  } catch (_) {}
}

function populateFacetOptions() {
  const years = Array.from(new Set((releases || []).map(r => String(r.year || '').trim()).filter(Boolean)))
    .sort((a, b) => Number(b) - Number(a));
  if (els.year) {
    const cur = state.year;
    const opts = ['<option value="">Todos os anos</option>'].concat(years.map(y => `<option value="${y}">${y}</option>`));
    els.year.innerHTML = opts.join('');
    els.year.value = cur;
  }
  const labels = Array.from(new Set((releases || [])
    .map(r => {
      const c = r && r.credits ? r.credits : null;
      return c && (c.label || c.Label || c.editora || c.publisher) ? (c.label || c.Label || c.editora || c.publisher) : '';
    })
    .filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b)));
  if (els.label) {
    const curL = state.label;
    const optsL = ['<option value="">Todas as editoras</option>'].concat(labels.map(l => `<option value="${l}">${l}</option>`));
    els.label.innerHTML = optsL.join('');
    els.label.value = curL;
    els.label.disabled = labels.length === 0;
  }
  // Facet list (labels) populated separately (async meta)
}

async function ensureLabelsMeta(){
  if (labelsMetaLoaded) return;
  try {
    const supa = await getSupabaseClient();
    if (supa) {
      const { data, error } = await supa.from('labels').select('id,name,logo_url').order('name');
      if (!error && Array.isArray(data)) {
        labelsMeta = data.map(x => ({ id: x.id, name: x.name || 'Label', logo_url: x.logo_url || '' }));
        labelsMetaLoaded = true;
      }
    }
  } catch(_) {}
}

function populateLabelsFacetList(filterText){
  if (!els.facetLabelsList) return;
  const q = (filterText || '').toLowerCase();
  const list = (labelsMeta || []).filter(l => !q || String(l.name || '').toLowerCase().includes(q));
  els.facetLabelsList.innerHTML = list.map(l => {
    const active = state.label && state.label === l.name;
    return `<button type="button" class="btn btn-ghost btn-sm" data-label-name="${l.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">${active ? '✔️ ' : ''}${l.name}</button>`;
  }).join('');
  try {
    els.facetLabelsList.querySelectorAll('button[data-label-name]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-label-name');
        state.label = name || '';
        if (els.label) els.label.value = name || '';
        renderChips();
        saveFilters();
        closeFilters();
        render();
      });
    });
  } catch(_) {}
}

function matchQuery(text, query) {
  if (!query) return true;
  return String(text || '').toLowerCase().includes(query.toLowerCase());
}

function sortTracks(arr) {
  if (state.sort === 'az') {
    return [...arr].sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }
  // recent: ordenar por índice em recentTracks (0 é mais recente)
  const idx = (id) => {
    const i = Array.isArray(recentTracks) ? recentTracks.indexOf(id) : -1;
    return i === -1 ? 9999 : i;
  };
  return [...arr].sort((a, b) => idx(a.id) - idx(b.id));
}

function filterTracks(query) {
  let arr = tracks.filter(t => matchQuery(t.title, query) || matchQuery(t.artist, query));
  if (state.selArtists && state.selArtists.size > 0) {
    arr = arr.filter(t => state.selArtists.has(t.artist));
  }
  if (state.year || state.label) {
    const findReleaseOf = (trackId) => (releases || []).find(r => Array.isArray(r.trackIds) && r.trackIds.includes(trackId));
    arr = arr.filter(t => {
      const rel = findReleaseOf(t.id);
      if (!rel && (state.year || state.label)) return false;
      if (state.year && String(rel.year || '') !== String(state.year)) return false;
      if (state.label) {
        const labName = getReleaseLabelName(rel);
        if (labName !== state.label) return false;
      }
      return true;
    });
  }
  if (state.favoritesOnly) {
    const favSet = new Set(favorites);
    arr = arr.filter(t => favSet.has(t.id));
  }
  return sortTracks(arr);
}

function filterArtists(query) {
  const artists = getAllArtists();
  let base = artists;
  if (state.selArtists && state.selArtists.size > 0) base = base.filter(a => state.selArtists.has(a));
  let arr = base.filter(a => matchQuery(a, query));
  return arr.sort((a, b) => a.localeCompare(b));
}

function filterReleases(query) {
  let arr = releases.filter(r => matchQuery(r.title, query));
  if (state.selArtists && state.selArtists.size > 0) {
    arr = arr.filter(r => Array.isArray(r.trackIds) && r.trackIds.some(id => {
      const t = tracks.find(tt => tt.id === id);
      return t && state.selArtists.has(t.artist);
    }));
  }
  if (state.year) {
    arr = arr.filter(r => String(r.year || '') === String(state.year));
  }
  if (state.label) {
    arr = arr.filter(r => getReleaseLabelName(r) === state.label);
  }
  return arr.sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

function filterVideos(query) {
  let arr = videos.filter(v => matchQuery(v.title, query));
  return arr.sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

function createReleaseCardSimple(release) {
  const titleEsc = escapeHtml(release.title || '');
  const coverHtml = release.coverUrl ? `<img src="${escapeHtml(release.coverUrl)}" alt="${titleEsc}" class="release-cover-img" loading="lazy">` : (release.cover || '💿');
  const tracksCount = Array.isArray(release.trackIds) ? release.trackIds.length : 0;
  const relId = String(release.id || '');
  const relIdAttr = relId.replace(/'/g, '&#39;');
  return `
    <div class="release-card" onclick="showReleaseDetails('${relIdAttr}')">
      <div class="release-cover">${coverHtml}</div>
      <div class="release-info">
        <div class="release-title">${titleEsc}</div>
        <div class="release-meta">${tracksCount} ${tracksCount === 1 ? 'faixa' : 'faixas'}</div>
      </div>
    </div>
  `;
}

function createLabelCardSimple(meta){
  const name = meta && meta.name ? String(meta.name) : 'Label';
  const nameEsc = escapeHtml(name);
  const logo = (meta && meta.logo_url) ? `<img src="${escapeHtml(meta.logo_url)}" alt="${nameEsc}" class="release-cover-img" loading="lazy">` : (name.charAt(0).toUpperCase());
  const idJs = JSON.stringify(String(meta && meta.id));
  return `
    <div class="release-card" onclick="(window.showLabelDetails ? showLabelDetails(${idJs}) : 0)">
      <div class="release-cover">${logo}</div>
      <div class="release-info">
        <div class="release-title">${nameEsc}</div>
        <div class="release-meta">Ver perfil</div>
      </div>
    </div>`;
}

function renderGroup(containerEl, itemsHtml, emptyText) {
  if (!containerEl) return;
  containerEl.style.display = itemsHtml && itemsHtml.trim().length ? '' : '';
  const grid = containerEl.querySelector('[data-grid]') || containerEl.querySelector('.track-grid, .videos-grid');
  if (grid) grid.innerHTML = itemsHtml && itemsHtml.trim().length ? itemsHtml : `<p style="text-align:center; color:var(--muted); grid-column:1/-1;">${emptyText}</p>`;
}

function render() {
  const q = state.query;
  const type = state.type;
  const activeMulti = state.multiTypes && state.multiTypes.size > 0;
  // Mostrar/ocultar grupos conforme o tipo
  const showTracks = activeMulti ? state.multiTypes.has('tracks') : (type === 'all' || type === 'tracks');
  const showArtists = activeMulti ? state.multiTypes.has('artists') : (type === 'all' || type === 'artists');
  const showLabels = activeMulti ? state.multiTypes.has('labels') : (type === 'all' || type === 'labels');
  const showReleases = activeMulti ? state.multiTypes.has('releases') : (type === 'all' || type === 'releases');
  const showVideos = activeMulti ? state.multiTypes.has('videos') : (type === 'all' || type === 'videos');
  if (els.grpTracks) els.grpTracks.style.display = showTracks ? '' : 'none';
  if (els.grpArtists) els.grpArtists.style.display = showArtists ? '' : 'none';
  if (els.grpLabels) els.grpLabels.style.display = showLabels ? '' : 'none';
  if (els.grpReleases) els.grpReleases.style.display = showReleases ? '' : 'none';
  if (els.grpVideos) els.grpVideos.style.display = showVideos ? '' : 'none';

  if (showTracks) {
    const ts = filterTracks(q);
    const html = ts.map(t => createTrackCard(t, true)).join('');
    if (els.gridTracks) els.gridTracks.innerHTML = html || '<p style="text-align:center; color:var(--muted); grid-column:1/-1;">Nenhuma música encontrada</p>';
  }
  if (showArtists) {
    const as = filterArtists(q);
    const html = as.map(a => createArtistCard(a, getArtistStats(a))).join('');
    if (els.gridArtists) els.gridArtists.innerHTML = html || '<p style="text-align:center; color:var(--muted); grid-column:1/-1;">Nenhum artista encontrado</p>';
  }
  if (showLabels) {
    const ql = state.query;
    const list = (labelsMeta || []).filter(l => matchQuery(l.name, ql));
    const html = list.map(createLabelCardSimple).join('');
    if (els.gridLabels) els.gridLabels.innerHTML = html || '<p style="text-align:center; color:var(--muted); grid-column:1/-1;">Nenhuma editora encontrada</p>';
  }
  if (showReleases) {
    const rs = filterReleases(q);
    const html = rs.map(r => createReleaseCardSimple(r)).join('');
    if (els.gridReleases) els.gridReleases.innerHTML = html || '<p style="text-align:center; color:var(--muted); grid-column:1/-1;">Nenhum release encontrado</p>';
  }
  if (showVideos) {
    const vs = filterVideos(q);
    const html = vs.map(v => createVideoCard(v)).join('');
    if (els.gridVideos) els.gridVideos.innerHTML = html || '<p style="text-align:center; color:var(--muted); grid-column:1/-1;">Nenhum vídeo encontrado</p>';
  }

  renderChips();
}

function renderChips() {
  if (!els.chips) return;
  const chips = [];
  if (state.multiTypes && state.multiTypes.size > 0) {
    state.multiTypes.forEach(t => {
      const label = ({tracks:'Músicas', artists:'Artistas', releases:'Releases', videos:'Vídeos'})[t] || t;
      chips.push(`<span class="chip">${label}<button onclick="window._removeChip('type','${t}')">×</button></span>`);
    });
  }
  if (state.year) {
    chips.push(`<span class="chip">${state.year}<button onclick="window._removeChip('year','${state.year}')">×</button></span>`);
  }
  if (state.label) {
    chips.push(`<span class="chip">${state.label}<button onclick="window._removeChip('label','${state.label}')">×</button></span>`);
  }
  if (state.favoritesOnly) {
    chips.push(`<span class="chip">Favoritos<button onclick="window._removeChip('favoritesOnly',true)">×</button></span>`);
  }
  if (state.sort === 'az') {
    chips.push(`<span class="chip">Ordem alfabética<button onclick="window._removeChip('sort','az')">×</button></span>`);
  }
  els.chips.innerHTML = chips.join('');
}

// Chip removal helper
window._removeChip = (kind, value) => {
  try {
    if (kind === 'type') {
      state.multiTypes.delete(value);
      syncFacetControls();
    } else if (kind === 'year') {
      state.year = '';
      if (els.year) els.year.value = '';
    } else if (kind === 'label') {
      state.label = '';
      if (els.label) els.label.value = '';
    } else if (kind === 'favoritesOnly') {
      state.favoritesOnly = false;
      if (els.favs) els.favs.checked = false;
      if (els.facetFavorites) els.facetFavorites.checked = false;
    } else if (kind === 'sort') {
      // Voltar ao default 'recent' quando removido
      state.sort = 'recent';
      if (els.sort) els.sort.value = 'recent';
      if (els.facetSort) els.facetSort.value = 'recent';
    }
    renderChips();
    saveFilters();
    render();
  } catch (_) {}
};

export function initMusicSection() {
  if (initialized) { try { render(); } catch(_) {}; return; }
  initialized = true;
  loadSavedFilters();
  bindUI();
  updateFavsVisibility();
  updateFacetVisibility();
  populateFacetOptions();
  (async () => {
    await ensureLabelsMeta();
    populateLabelsFacetList('');
    render();
  })();

  // Expor atalho global para abrir a secção já filtrada
  window.showMusicWithFilter = (type) => {
    try {
      if (els.type) { els.type.value = (type || 'all'); state.type = els.type.value; updateFavsVisibility(); }
      if (els.search) { els.search.value = ''; state.query = ''; }
      if (window.showSection) window.showSection('music');
      updateFacetVisibility();
      render();
    } catch (_) {}
  };
  // Expor refresh para pós-loadData
  window.refreshMusicResults = () => {
    try {
      populateFacetOptions();
      (async () => { await ensureLabelsMeta(); populateLabelsFacetList(els.facetLabelSearch ? (els.facetLabelSearch.value || '') : ''); render(); })();
    } catch(_) {}
  };

  // Focar tipo via botão "Ver Todas"
  window.showMusicWithFilter = (type) => {
    try {
      const t = type || 'all';
      state.type = t;
      if (els.type) els.type.value = t;
      // Sincronizar facet multiTypes com a seleção principal
      if (t === 'all') {
        state.multiTypes.clear();
      } else {
        state.multiTypes = new Set([t]);
      }
      syncFacetControls();
      saveFilters();
      render();
      // Scroll suave até ao grupo relevante
      const targetId = t === 'labels' ? 'music-results-labels' : (t === 'tracks' ? 'music-results-tracks' : (t === 'artists' ? 'music-results-artists' : (t === 'releases' ? 'music-results-releases' : null)));
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch(_) {}
  };
}

function loadSavedFilters(){
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return;
    state.query = obj.query || '';
    state.type = obj.type || 'all';
    state.favoritesOnly = !!obj.favoritesOnly;
    state.sort = obj.sort || 'recent';
    state.year = obj.year || '';
    state.label = obj.label || '';
    state.multiTypes = new Set(Array.isArray(obj.multiTypes) ? obj.multiTypes : []);
  } catch(_) {}
}

function saveFilters(){
  try {
    const obj = {
      query: state.query,
      type: state.type,
      favoritesOnly: !!state.favoritesOnly,
      sort: state.sort,
      year: state.year,
      label: state.label,
      multiTypes: Array.from(state.multiTypes || [])
    };
    localStorage.setItem(FILTERS_KEY, JSON.stringify(obj));
  } catch(_) {}
}

try { initMusicSection(); } catch (_) {}
