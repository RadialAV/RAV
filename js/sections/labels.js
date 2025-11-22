// js/sections/labels.js

import { releases, getTrackById, addToCart } from '../data.js';
import { createTrackItem } from '../ui/render.js';
import { getSupabaseClient } from '../supabase.js';
import { playPlaylist } from '../player.js';
import { showToast, escapeHtml } from '../utils.js';

let labelDetailsSection = null;
let currentLabelId = null;
let currentLabelMeta = null;
let currentLabelRels = [];
let currentLabelTrackIds = [];
let labelState = { sort: 'recent', year: '' };

export function initLabelsSection() {
  labelDetailsSection = document.getElementById('label-details-section');
  // Expor para uso a partir de outros módulos/botões
  window.showLabelDetails = showLabelDetails;
}

function headerLogoHtml(meta) {
  const name = (meta && meta.name) ? String(meta.name) : '';
  if (meta && meta.logo_url) {
    const url = encodeURI(String(meta.logo_url));
    return `<img src="${url}" alt="${escapeHtml(name)}" class="release-cover-large-img">`;
  }
  const initial = name ? name.charAt(0).toUpperCase() : '🏷️';
  return initial;
}

function createReleaseCardMinimal(rel) {
  const comingSoonBadge = rel.comingSoon ? '<span class="coming-soon-badge">Em Breve</span>' : '';
  const tracksCount = Array.isArray(rel.trackIds) ? rel.trackIds.length : 0;
  const opacity = rel.comingSoon ? 'opacity: 0.6;' : '';
  const titleEsc = escapeHtml(rel.title || '');
  const coverHtml = rel.coverUrl ? `<img src="${encodeURI(String(rel.coverUrl))}" alt="${titleEsc}" class="release-cover-img" loading="lazy">` : (rel.cover || '💿');
  const relIdAttr = escapeHtml(String(rel.id || ''));
  return `
    <div class="release-card" data-rel-id="${relIdAttr}" style="${opacity}">
      ${comingSoonBadge}
      <div class="release-cover">${coverHtml}</div>
      <div class="release-info">
        <div class="release-title">${titleEsc}</div>
        <div class="release-meta">${tracksCount} faixas • ${escapeHtml(String(rel.year || ''))}</div>
      </div>
    </div>
  `;
}

function renderLabelTracks(trackIds) {
  const list = trackIds.map(id => getTrackById(id)).filter(Boolean);
  return list.map((t, i) => createTrackItem(t, i, false, true, null, { titleLinksToRelease: true })).join('');
}

export async function showLabelDetails(labelId) {
  currentLabelId = labelId;
  if (!labelDetailsSection) labelDetailsSection = document.getElementById('label-details-section');
  if (!labelDetailsSection) return;

  // Carregar meta da label
  let meta = { id: labelId, name: 'Label', slug: '', logo_url: '', description: '', url: '' };
  try {
    const supa = await getSupabaseClient();
    if (supa) {
      const { data, error } = await supa.from('labels').select('id,name,slug,logo_url,description,url').eq('id', labelId).maybeSingle();
      if (!error && data) meta = data;
    }
  } catch(_) {}
  currentLabelMeta = meta;

  // Agregar releases e faixas desta label
  currentLabelRels = (releases || []).filter(r => r && String(r.labelId || '') === String(labelId));
  currentLabelTrackIds = [];
  const allTrackIds = [];
  for (const r of currentLabelRels) {
    if (r && Array.isArray(r.trackIds)) allTrackIds.push(...r.trackIds);
  }
  // Dedup track ids (segurança)
  const seen = new Set();
  currentLabelTrackIds = allTrackIds.filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });

  const releaseCards = renderLabelReleases();
  const tracksHtml = currentLabelTrackIds.length ? renderLabelTracks(currentLabelTrackIds) : '<p class="text-muted">Sem músicas</p>';

  const years = Array.from(new Set(currentLabelRels.map(r => String(r.year || '').trim()).filter(Boolean))).sort((a,b) => Number(b) - Number(a));

  const firstRelId = currentLabelRels && currentLabelRels.length ? String(currentLabelRels[0].id) : '';
  const firstRelIdAttr = escapeHtml(firstRelId);
  const websiteAttr = meta.url ? encodeURI(String(meta.url)) : '';
  labelDetailsSection.innerHTML = `
    <button class="back-btn" onclick="(window.goBack ? goBack() : (window.showSection ? showSection('music') : null))">← Voltar</button>
    <div class="artist-header">
      <div class="artist-avatar-large">${headerLogoHtml(meta)}</div>
      <div class="artist-header-info">
        <h2 class="artist-title-large">🏷️ ${escapeHtml(meta.name || 'Label')}</h2>
        <div class="artist-meta-text">
          <div class="artist-meta-line">
            <strong>${currentLabelRels.length} ${currentLabelRels.length === 1 ? 'release' : 'releases'}</strong>
            <span class="meta-separator">•</span>
            <strong>${currentLabelTrackIds.length} ${currentLabelTrackIds.length === 1 ? 'faixa' : 'faixas'}</strong>
          </div>
        </div>
      </div>
    </div>

    ${meta.description ? `<div class="release-description"><p>${escapeHtml(meta.description)}</p></div>` : ''}

    <div class="artist-actions" style="display:flex; gap:0.5rem; flex-wrap:wrap;">
      ${firstRelId ? `<button class="btn btn-secondary" data-rel-id="${firstRelIdAttr}">Ver primeiro release</button>` : ''}
      ${websiteAttr ? `<button class="btn btn-ghost" data-external-link="${websiteAttr}">🌐 Website</button>` : ''}
      <button class="btn btn-secondary" id="label-play-all">▶️ Tocar tudo</button>
      <button class="btn btn-primary" id="label-add-all">🛒 Adicionar tudo</button>
    </div>

    <div class="library-tabs" style="display:flex; gap:0.5rem; margin:0.75rem 0;">
      <button class="btn btn-ghost btn-sm library-tab-btn active" data-tab="label-releases" type="button">💿 Releases</button>
      <button class="btn btn-ghost btn-sm library-tab-btn" data-tab="label-tracks" type="button">🎵 Músicas</button>
    </div>
    <div id="label-panel-releases">
      <div class="music-controls" style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; margin-bottom:0.5rem;">
        <select id="label-year-filter" class="form-input" style="min-width:120px;">
          <option value="">Todos os anos</option>
          ${years.map(y => `<option value="${y}" ${labelState.year===y?'selected':''}>${y}</option>`).join('')}
        </select>
        <select id="label-sort" class="form-input" style="min-width:120px;">
          <option value="recent" ${labelState.sort==='recent'?'selected':''}>Recentes</option>
          <option value="az" ${labelState.sort==='az'?'selected':''}>A‑Z</option>
        </select>
      </div>
      <div class="track-grid" id="label-releases-grid">${releaseCards}</div>
    </div>
    <div id="label-panel-tracks" style="display:none;">
      <div class="track-list">${tracksHtml}</div>
    </div>
  `;

  // Tabs simples
  try {
    const tabs = labelDetailsSection.querySelectorAll('.library-tab-btn');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const isReleases = btn.dataset.tab === 'label-releases';
        const pr = labelDetailsSection.querySelector('#label-panel-releases');
        const pt = labelDetailsSection.querySelector('#label-panel-tracks');
        if (pr) pr.style.display = isReleases ? '' : 'none';
        if (pt) pt.style.display = isReleases ? 'none' : '';
      });
    });
  } catch(_) {}

  // Bind filtros e ações
  try {
    const yearSel = document.getElementById('label-year-filter');
    const sortSel = document.getElementById('label-sort');
    if (yearSel) yearSel.addEventListener('change', () => { labelState.year = yearSel.value || ''; updateLabelReleasesGrid(); });
    if (sortSel) sortSel.addEventListener('change', () => { labelState.sort = sortSel.value || 'recent'; updateLabelReleasesGrid(); });
    const playAllBtn = document.getElementById('label-play-all');
    if (playAllBtn) playAllBtn.addEventListener('click', () => { try { playPlaylist(currentLabelTrackIds); } catch(_) {} });
    const addAllBtn = document.getElementById('label-add-all');
    if (addAllBtn) addAllBtn.addEventListener('click', () => {
      try {
        let added = 0;
        currentLabelTrackIds.forEach(id => { if (addToCart(id)) added++; });
        if (window.updateCartBadge) window.updateCartBadge();
        showToast(`${added} músicas adicionadas ao carrinho`, added>0?'success':'info');
      } catch(_) {}
    });
  } catch(_) {}

  window.showSection && window.showSection('label-details');
}

function updateLabelReleasesGrid(){
  const grid = document.getElementById('label-releases-grid');
  if (!grid) return;
  grid.innerHTML = renderLabelReleases();
}

function renderLabelReleases(){
  try {
    let list = Array.isArray(currentLabelRels) ? [...currentLabelRels] : [];
    if (labelState.year) list = list.filter(r => String(r.year || '') === String(labelState.year));
    if (labelState.sort === 'az') list.sort((a,b) => String(a.title).localeCompare(String(b.title)));
    else list.sort((a,b) => Number(b.year||0) - Number(a.year||0));
    return list.length ? list.map(createReleaseCardMinimal).join('') : '<p class="text-muted" style="grid-column:1/-1;">Sem releases</p>';
  } catch(_) {
    return '<p class="text-muted" style="grid-column:1/-1;">Sem releases</p>';
  }
}
