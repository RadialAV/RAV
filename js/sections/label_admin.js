// js/sections/label_admin.js

import { getSupabaseClient } from '../supabase.js';

let supabase = null;
let guardEl = null;
let panelsEl = null;
let selectEl = null;
let relListEl = null;
let tracksListEl = null;
let relIdEl = null;
let relPublishEl = null;
let relSaveBtn = null;
let relDeleteBtn = null;
let relStatusEl = null;
let relTitleEl = null;
let relYearEl = null;
let relArtistGlobalEl = null;
let relApplyArtistBtn = null;
let curReleaseCredits = {};
// Upload (novo release)
let ulTitleEl = null;
let ulArtistEl = null;
let ulYearEl = null;
let ulPriceEl = null;
let ulDateEl = null;
let ulDescEl = null;
let ulCoverEl = null;
let ulTracksWrapEl = null;
let ulAddTrackBtn = null;
let ulSubmitBtn = null;
let ulStatusEl = null;
let ulBulkEl = null;
let ulPickFilesBtn = null;
let ulUploadSectionEl = null;
let ulDroppedFiles = [];
let ulFolderEl = null;
let ulPickFolderBtn = null;
let ulCompilationEl = null;
// Perfil da Label
let profNameEl = null;
let profUrlEl = null;
let profDescEl = null;
let profLogoEl = null;
let profSaveBtn = null;
let profStatusEl = null;
// Membros da Label
let memListEl = null;
let memEmailEl = null;
let memAddBtn = null;
let memStatusEl = null;

export async function initLabelAdminSection() {
  guardEl = document.getElementById('label-admin-guard');
  panelsEl = document.getElementById('label-admin-panels');
  selectEl = document.getElementById('label-admin-select');
  relListEl = document.getElementById('label-admin-releases-list');
  tracksListEl = document.getElementById('label-admin-tracks-list');
  relIdEl = document.getElementById('label-admin-rel-id');
  relPublishEl = document.getElementById('label-admin-rel-publish');
  relSaveBtn = document.getElementById('label-admin-rel-save');
  relDeleteBtn = document.getElementById('label-admin-rel-delete');
  relStatusEl = document.getElementById('label-admin-rel-status');
  relTitleEl = document.getElementById('label-admin-rel-title');
  relYearEl = document.getElementById('label-admin-rel-year');
  relArtistGlobalEl = document.getElementById('label-admin-rel-artist');
  relApplyArtistBtn = document.getElementById('label-admin-apply-artist');
  // Upload refs
  ulTitleEl = document.getElementById('label-admin-new-title');
  ulArtistEl = document.getElementById('label-admin-new-artist');
  ulYearEl = document.getElementById('label-admin-new-year');
  ulPriceEl = document.getElementById('label-admin-new-price');
  ulDateEl = document.getElementById('label-admin-new-date');
  ulDescEl = document.getElementById('label-admin-new-desc');
  ulCoverEl = document.getElementById('label-admin-new-cover');
  ulTracksWrapEl = document.getElementById('label-admin-tracks-container');
  ulAddTrackBtn = document.getElementById('label-admin-add-track');
  ulSubmitBtn = document.getElementById('label-admin-submit-upload');
  ulStatusEl = document.getElementById('label-admin-upload-status');
  ulBulkEl = document.getElementById('label-admin-bulk');
  ulPickFilesBtn = document.getElementById('label-admin-pick-files');
  ulFolderEl = document.getElementById('label-admin-folder');
  ulPickFolderBtn = document.getElementById('label-admin-pick-folder');
  ulUploadSectionEl = document.getElementById('label-admin-upload');
  // Perfil refs
  profNameEl = document.getElementById('label-admin-prof-name');
  profUrlEl = document.getElementById('label-admin-prof-url');
  profDescEl = document.getElementById('label-admin-prof-desc');
  profLogoEl = document.getElementById('label-admin-prof-logo');
  profSaveBtn = document.getElementById('label-admin-prof-save');
  profStatusEl = document.getElementById('label-admin-prof-status');
  // Members refs
  memListEl = document.getElementById('label-admin-members-list');
  memEmailEl = document.getElementById('label-admin-member-email');
  memAddBtn = document.getElementById('label-admin-member-add');
  memStatusEl = document.getElementById('label-admin-members-status');

  supabase = await getSupabaseClient();
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  const user = session && session.user ? session.user : null;
  if (!user) { showGuard('Entra para aceder.'); return; }
  const allowed = await canUseLabelAdmin(user.email);
  if (!allowed) { showGuard('Sem permissões para Label Admin.'); return; }
  hideGuard();
  const labels = await fetchMyLabels(user.email);
  await populateLabelSelect(labels);
  ensureCreateLabelControl();
  bindEditorHandlers();
  bindUploadHandlers();
  bindProfileHandlers();
  bindMembersHandlers();
  bindBackfillHandlers();
  bindTabs();
  // default tab or saved
  let savedTab = 'profile';
  try { const t = localStorage.getItem('label_admin_active_tab'); if (t) savedTab = t; } catch(_) {}
  // Update active class on buttons
  try {
    const tabs = Array.from(document.querySelectorAll('#label-admin-tabs .label-tab'));
    tabs.forEach(b => {
      const tab = b.getAttribute('data-tab');
      if (tab === savedTab) b.classList.add('active'); else b.classList.remove('active');
    });
  } catch(_) {}
  showLabelTab(savedTab);
}

function showGuard(msg){
  if (guardEl) guardEl.textContent = msg || '';
  if (panelsEl) panelsEl.style.display = 'none';
}
function hideGuard(){
  if (guardEl) guardEl.textContent = '';
  if (panelsEl) panelsEl.style.display = 'flex';
}

async function fetchMyLabels(email){
  try {
    // Admin master: ver todas as labels
    const admin = await isAdminMaster(email);
    if (admin) {
      const all = await supabase.from('labels').select('id,name').order('name');
      if (all.error) return [];
      return all.data || [];
    }
    // Caso normal: labels a que pertenço
    const lm = await supabase.from('label_members').select('label_id').eq('email', email);
    if (lm.error) return [];
    const ids = (lm.data || []).map(r => r.label_id).filter(Boolean);
    if (!ids.length) return [];
    const { data, error } = await supabase.from('labels').select('id,name').in('id', ids).order('name');
    if (error) return [];
    return data || [];
  } catch(_) { return []; }
}

async function canUseLabelAdmin(email){
  try {
    // Admin Master
    const am = await supabase.from('admin_masters').select('email').eq('email', email).maybeSingle();
    if (am && am.data && am.data.email) return true;
  } catch(_) {}
  try {
    // Allowed Uploader
    const au = await supabase.from('allowed_uploaders').select('email').eq('email', email).limit(1);
    if (!au.error && Array.isArray(au.data) && au.data.length > 0) return true;
  } catch(_) {}
  try {
    // Membro de alguma label
    const lm = await supabase.from('label_members').select('label_id').eq('email', email).limit(1);
    if (!lm.error && Array.isArray(lm.data) && lm.data.length > 0) return true;
  } catch(_) {}
  return false;
}

async function isAdminMaster(email){
  try {
    if (!email) return false;
    const am = await supabase.from('admin_masters').select('email').eq('email', email).maybeSingle();
    return !!(am && am.data && am.data.email);
  } catch(_) { return false; }
}

async function populateLabelSelect(labels){
  if (!selectEl) return;
  const options = labels.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  selectEl.innerHTML = options;
  try {
    const saved = localStorage.getItem('label_admin_active_id');
    if (saved && labels.some(l => String(l.id) === String(saved))) selectEl.value = saved;
  } catch(_) {}
  selectEl.addEventListener('change', () => {
    try { localStorage.setItem('label_admin_active_id', selectEl.value); } catch(_) {}
    loadReleasesForLabel(selectEl.value);
    loadLabelProfile(selectEl.value);
    loadMembers(selectEl.value);
  });
  loadReleasesForLabel(selectEl.value);
  loadLabelProfile(selectEl.value);
  loadMembers(selectEl.value);
}

function ensureCreateLabelControl(){
  try {
    const host = selectEl ? selectEl.closest('section') : null;
    if (!host) return;
    if (host.querySelector('#label-admin-create')) return;
    const wrap = document.createElement('div');
    wrap.className = 'form-actions';
    wrap.style = 'display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem;';
    wrap.innerHTML = `<button id="label-admin-create" type="button" class="btn btn-secondary btn-sm">Criar Editora</button>`;
    host.appendChild(wrap);
    const btn = wrap.querySelector('#label-admin-create');
    btn.addEventListener('click', handleCreateLabelLA);
  } catch(_) {}
}

async function handleCreateLabelLA(){
  if (!supabase) return;
  const btn = document.getElementById('label-admin-create');
  if (btn && btn.__busy) return;
  if (btn) { btn.__busy = true; btn.disabled = true; }
  const name = (window.prompt && window.prompt('Nome da editora:', 'Nova Editora')) || '';
  if (!name) { if (btn) { btn.disabled = false; btn.__busy = false; } return; }
  try {
    if (profStatusEl) profStatusEl.textContent = 'A criar editora…';
    let slug = slugify(name) || 'label';
    let ins = await supabase.from('labels').insert({ name, slug }).select('id').maybeSingle();
    if (!ins || ins.error || !ins.data || !ins.data.id) {
      slug = `${slug}-${Math.random().toString(36).slice(2,7)}`;
      ins = await supabase.from('labels').insert({ name, slug }).select('id').maybeSingle();
      if (!ins || ins.error || !ins.data || !ins.data.id) { if (profStatusEl) profStatusEl.textContent = 'Erro ao criar editora (conflito ou permissões).'; return; }
    }
    const newId = ins.data.id;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session && session.user ? (session.user.email || '') : '';
      if (email) { await supabase.from('label_members').insert({ label_id: newId, email }); }
    } catch(_) {}
    try { if (profStatusEl) profStatusEl.textContent = '✔️ Editora criada'; } catch(_) {}
    const labels = await fetchMyLabels((await supabase.auth.getSession()).data.session.user.email);
    await populateLabelSelect(labels);
    try { selectEl.value = newId; localStorage.setItem('label_admin_active_id', newId); } catch(_) {}
    loadReleasesForLabel(newId);
    loadLabelProfile(newId);
  } finally {
    if (btn) { btn.disabled = false; btn.__busy = false; }
  }
}

function bindTabs(){
  try {
    const tabs = Array.from(document.querySelectorAll('#label-admin-tabs .label-tab'));
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        try { localStorage.setItem('label_admin_active_tab', tab); } catch(_) {}
        showLabelTab(tab);
      });
    });
  } catch(_) {}
}

function showLabelTab(tab){
  const secUpload = document.getElementById('label-admin-upload');
  const secReleases = document.getElementById('label-admin-releases');
  const secEditor = document.getElementById('label-admin-release-editor');
  const secTracks = document.getElementById('label-admin-tracks');
  const secProfile = document.getElementById('label-admin-profile');
  const secMembers = document.getElementById('label-admin-members');
  const isUpload = tab === 'upload';
  const isReleases = tab === 'releases';
  const isProfile = tab === 'profile';
  const isMembers = tab === 'members';
  try { if (secUpload) secUpload.style.display = isUpload ? 'block' : 'none'; } catch(_) {}
  try { if (secReleases) secReleases.style.display = isReleases ? 'block' : 'none'; } catch(_) {}
  try { if (secEditor) secEditor.style.display = isReleases ? 'block' : 'none'; } catch(_) {}
  try { if (secTracks) secTracks.style.display = isReleases ? 'block' : 'none'; } catch(_) {}
  try { if (secProfile) secProfile.style.display = isProfile ? 'block' : 'none'; } catch(_) {}
  try { if (secMembers) secMembers.style.display = isMembers ? 'block' : 'none'; } catch(_) {}
}

async function loadReleasesForLabel(labelId){
  if (!relListEl || !labelId) return;
  try { relListEl.innerHTML = '<p class="text-muted">A carregar…</p>'; tracksListEl && (tracksListEl.innerHTML = ''); } catch(_) {}
  const cols = 'id,title,year,cover_url,publish_at,featured,coming_soon,credits';
  const { data, error } = await supabase.from('releases').select(cols).eq('label_id', labelId).order('id', { ascending: false });
  if (error) { relListEl.innerHTML = '<p class="text-muted">Erro a carregar releases.</p>'; return; }
  const list = Array.isArray(data) ? data : [];
  if (!list.length) { relListEl.innerHTML = '<p class="text-muted">Sem releases.</p>'; return; }
  relListEl.innerHTML = list.map(r => releaseRow(r)).join('');
  relListEl.querySelectorAll('[data-rel-edit]').forEach(btn => btn.addEventListener('click', () => loadEditor(btn.getAttribute('data-rel-edit'), list)));
  relListEl.querySelectorAll('[data-rel-tracks]').forEach(btn => btn.addEventListener('click', () => loadTracks(btn.getAttribute('data-rel-tracks'))));
  relListEl.querySelectorAll('[data-rel-del]').forEach(btn => btn.addEventListener('click', async () => { await handleDeleteRelease(btn.getAttribute('data-rel-del')); loadReleasesForLabel(labelId); }));
}

function releaseRow(r){
  const cover = r.cover_url ? `<img src="${r.cover_url}" alt="${r.title}" class="track-cover-img">` : '💿';
  const pub = r.publish_at ? new Date(r.publish_at).toLocaleString() : '—';
  const soon = r.coming_soon ? ' • Em breve' : '';
  return `
    <div class="track-item">
      <div class="track-cover">${cover}</div>
      <div class="track-info">
        <div class="track-title">${r.title || ''}</div>
        <div class="track-artist">${r.year || ''} • Publica: ${pub}${soon}</div>
      </div>
      <div class="track-actions">
        <button class="action-btn" data-rel-edit="${r.id}">✏️</button>
        <button class="action-btn" data-rel-tracks="${r.id}">🎵</button>
        <button class="action-btn" data-rel-del="${r.id}">🗑️</button>
      </div>
    </div>
  `;
}

function bindEditorHandlers(){
  if (relSaveBtn) relSaveBtn.addEventListener('click', handleSave);
  if (relDeleteBtn) relDeleteBtn.addEventListener('click', async () => {
    const id = relIdEl && relIdEl.value ? relIdEl.value : '';
    if (!id) return;
    await handleDeleteRelease(id);
    const labelId = selectEl ? selectEl.value : '';
    loadReleasesForLabel(labelId);
  });
  if (relApplyArtistBtn) relApplyArtistBtn.addEventListener('click', applyArtistToAllTracks);
}

function toLocalInputValue(iso){
  try{
    const d = new Date(iso);
    const pad=(n)=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch(_){ return ''; }
}

function fromLocalInputValue(v){
  try { return new Date(v).toISOString(); } catch(_){ return null; }
}

function loadEditor(id, list){
  const r = Array.isArray(list) ? list.find(x => String(x.id) === String(id)) : null;
  if (!relIdEl) return;
  relIdEl.value = r ? r.id : '';
  if (relPublishEl) relPublishEl.value = (r && r.publish_at) ? toLocalInputValue(r.publish_at) : '';
  if (relTitleEl) relTitleEl.value = r && r.title ? r.title : '';
  if (relYearEl) relYearEl.value = r && r.year ? String(r.year) : '';
  try {
    curReleaseCredits = (r && r.credits && typeof r.credits === 'object') ? r.credits : {};
    const globArtist = curReleaseCredits && curReleaseCredits.release_artist ? String(curReleaseCredits.release_artist) : '';
    if (relArtistGlobalEl) relArtistGlobalEl.value = globArtist;
  } catch(_) { curReleaseCredits = {}; }
  if (relStatusEl) relStatusEl.textContent = '';
  loadTracks(id);
}

async function handleSave(){
  if (!supabase || !relIdEl) return;
  const id = relIdEl.value || '';
  if (!id) return;
  const patch = {};
  if (relPublishEl && relPublishEl.value) patch.publish_at = fromLocalInputValue(relPublishEl.value);
  if (relTitleEl) {
    const t = (relTitleEl.value || '').trim();
    if (t !== '') patch.title = t; else patch.title = '';
  }
  if (relYearEl) {
    const y = num(relYearEl.value || '');
    if (y !== null) patch.year = y; else patch.year = null;
  }
  try {
    const a = (relArtistGlobalEl?.value || '').trim();
    const credits = (curReleaseCredits && typeof curReleaseCredits === 'object') ? { ...curReleaseCredits } : {};
    if (a) credits.release_artist = a; else delete credits.release_artist;
    patch.credits = credits;
    curReleaseCredits = credits;
  } catch(_) {}
  try { if (relStatusEl) relStatusEl.textContent = 'A guardar…'; } catch(_) {}
  const { error } = await supabase.from('releases').update(patch).eq('id', id);
  if (error) { if (relStatusEl) relStatusEl.textContent = 'Erro ao guardar.'; return; }
  if (relStatusEl) relStatusEl.textContent = '✔️ Guardado';
}

async function applyArtistToAllTracks(){
  if (!supabase || !relIdEl) return;
  const rid = relIdEl.value || '';
  const a = (relArtistGlobalEl?.value || '').trim();
  if (!rid || !a) return;
  try { if (relStatusEl) relStatusEl.textContent = 'A aplicar artista a todas as faixas…'; } catch(_) {}
  let aid = null;
  try { aid = await ensureArtistId(a); } catch(_) {}
  const { error } = await supabase.from('tracks').update({ artist: a, artist_id: aid }).eq('release_id', rid);
  if (error) { if (relStatusEl) relStatusEl.textContent = 'Erro ao aplicar artista.'; return; }
  try {
    const inputs = Array.from(document.querySelectorAll('#label-admin-tracks-list .edit-track-artist'));
    inputs.forEach(i => i.value = a);
  } catch(_) {}
  if (relStatusEl) relStatusEl.textContent = '✔️ Artista aplicado';
}

async function loadTracks(releaseId){
  if (!tracksListEl || !releaseId) return;
  try { tracksListEl.innerHTML = '<p class="text-muted">A carregar…</p>'; } catch(_) {}
  let list = [];
  let got = null;
  try {
    got = await supabase.from('tracks').select('id,title,artist,track_order').eq('release_id', releaseId).order('track_order').order('id');
  } catch(_) {}
  if (!got || got.error) {
    const res2 = await supabase.from('tracks').select('id,title,artist').eq('release_id', releaseId).order('id');
    if (res2.error) { tracksListEl.innerHTML = '<p class="text-muted">Erro a carregar faixas.</p>'; return; }
    list = Array.isArray(res2.data) ? res2.data : [];
  } else {
    list = Array.isArray(got.data) ? got.data : [];
  }
  if (!list.length) { tracksListEl.innerHTML = '<p class="text-muted">Sem faixas.</p>'; return; }
  tracksListEl.innerHTML = list.map(t => `
    <div class="track-item" data-track-id="${t.id}">
      <div class="track-cover">🎵</div>
      <div class="track-info" style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;align-items:center;">
        <input class="form-input edit-track-title" type="text" value="${(t.title||'').replace(/"/g,'&quot;')}">
        <input class="form-input edit-track-artist" type="text" value="${(t.artist||'').replace(/"/g,'&quot;')}">
      </div>
      <div class="track-actions" style="display:flex; gap:0.25rem; align-items:center;">
        <button class="action-btn" data-trk-save="${t.id}" title="Guardar">💾</button>
        <button class="action-btn" data-trk-del="${t.id}" title="Eliminar">🗑️</button>
      </div>
    </div>
  `).join('');
  tracksListEl.querySelectorAll('[data-trk-del]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-trk-del');
    const ok = confirm('Eliminar esta música?');
    if (!ok) return;
    await supabase.from('tracks').delete().eq('id', id);
    loadTracks(releaseId);
  }));
  tracksListEl.querySelectorAll('[data-trk-save]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-trk-save');
    const item = btn.closest('.track-item');
    const titleEl = item ? item.querySelector('.edit-track-title') : null;
    const artistEl = item ? item.querySelector('.edit-track-artist') : null;
    const newTitle = (titleEl?.value || '').trim();
    const newArtist = (artistEl?.value || '').trim();
    if (!newTitle) return;
    let patch = { title: newTitle };
    if (newArtist) {
      try {
        const aid = await ensureArtistId(newArtist);
        if (aid) patch.artist_id = aid;
      } catch(_) {}
      patch.artist = newArtist;
    }
    try { if (relStatusEl) relStatusEl.textContent = 'A guardar…'; } catch(_) {}
    const { error } = await supabase.from('tracks').update(patch).eq('id', id);
    if (error) { if (relStatusEl) relStatusEl.textContent = 'Erro ao guardar faixa.'; return; }
    if (relStatusEl) relStatusEl.textContent = '✔️ Faixa guardada';
  }));
  enableReleaseTracksDnD(releaseId);
  enableReleaseTracksTouchDnD(releaseId);
}

function enableReleaseTracksDnD(releaseId){
  const container = tracksListEl;
  if (!container) return;
  const items = Array.from(container.querySelectorAll('.track-item'));
  items.forEach(item => {
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', () => item.classList.add('dragging'));
    item.addEventListener('dragend', async () => {
      item.classList.remove('dragging');
      await persistTrackOrderFromDOM(releaseId);
    });
  });
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = container.querySelector('.dragging');
    if (!dragging) return;
    const after = getAfterElement(container, e.clientY);
    if (after == null) container.appendChild(dragging); else container.insertBefore(dragging, after);
  });
}

function enableReleaseTracksTouchDnD(releaseId){
  const container = tracksListEl;
  if (!container || container.__touchDnDBound) return;
  container.__touchDnDBound = true;
  let dragging = null;
  container.addEventListener('touchstart', (e) => {
    const item = e.target && e.target.closest ? e.target.closest('.track-item') : null;
    if (!item) return;
    dragging = item;
    item.classList.add('dragging');
  }, { passive: true });
  container.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const y = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
    const after = getAfterElement(container, y);
    if (after == null) container.appendChild(dragging); else container.insertBefore(dragging, after);
  }, { passive: false });
  container.addEventListener('touchend', async () => {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    dragging = null;
    await persistTrackOrderFromDOM(releaseId);
  });
}

function getAfterElement(container, y){
  const els = [...container.querySelectorAll('.track-item:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function persistTrackOrderFromDOM(releaseId){
  const ids = Array.from(tracksListEl.querySelectorAll('.track-item')).map(el => el.getAttribute('data-track-id')).filter(Boolean);
  if (!ids.length) return;
  try { if (relStatusEl) relStatusEl.textContent = 'A guardar ordem…'; } catch(_) {}
  let hadError = false;
  for (let i=0;i<ids.length;i++){
    const id = ids[i];
    const order = i+1;
    const { error } = await supabase.from('tracks').update({ track_order: order }).eq('id', id);
    if (error) { hadError = true; break; }
  }
  if (relStatusEl) relStatusEl.textContent = hadError ? 'Nota: coluna track_order pode não existir. (Ordem não guardada)' : '✔️ Ordem guardada';
}

async function handleDeleteRelease(id){
  const ok = confirm('Eliminar este release e todas as suas músicas?');
  if (!ok) return false;
  try { if (relStatusEl) relStatusEl.textContent = 'A eliminar…'; } catch(_) {}
  let labelId = '';
  try {
    const rel = await supabase.from('releases').select('id,credits,label_id').eq('id', id).maybeSingle();
    const credits = rel && rel.data ? (rel.data.credits || {}) : {};
    const folder = credits && credits.storage_folder ? String(credits.storage_folder) : '';
    const ownerUserId = credits && credits.storage_user_id ? String(credits.storage_user_id) : '';
    labelId = rel && rel.data && rel.data.label_id ? String(rel.data.label_id) : '';
    if (folder) {
      try {
        const apiBase = resolveApiBase();
        const token = await getAuthToken();
        const r = await fetch(`${apiBase}/delete-release`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ folder, releaseId: id, ownerUserId, labelId }) });
        if (!r.ok) {
          const t = await r.text().catch(()=> '');
          console.warn('delete-release falhou', r.status, t);
        }
      } catch(_) {}
    }
  } catch(_) {}
  const delTracks = await supabase.from('tracks').delete().eq('release_id', id);
  if (delTracks && delTracks.error) { try { if (relStatusEl) relStatusEl.textContent = 'Erro a eliminar faixas.'; } catch(_) {} return false; }
  const delRel = await supabase.from('releases').delete().eq('id', id);
  if (delRel && delRel.error) { try { if (relStatusEl) relStatusEl.textContent = 'Erro a eliminar release.'; } catch(_) {} return false; }
  try { if (relStatusEl) relStatusEl.textContent = '✔️ Eliminado'; } catch(_) {}
  if (labelId) { try { await loadReleasesForLabel(labelId); } catch(_) {} }
  return true;
}

// ======== Perfil da Label ========
function bindProfileHandlers(){
  if (profSaveBtn) profSaveBtn.addEventListener('click', handleProfileSave);
}

async function loadLabelProfile(labelId){
  if (!supabase || !labelId) return;
  try { if (profStatusEl) profStatusEl.textContent = 'A carregar…'; } catch(_) {}
  const { data, error } = await supabase.from('labels').select('id,name,slug,url,description,logo_url').eq('id', labelId).maybeSingle();
  if (error || !data) { if (profStatusEl) profStatusEl.textContent = 'Erro a carregar perfil.'; return; }
  try {
    if (profNameEl) profNameEl.value = data.name || '';
    if (profUrlEl) profUrlEl.value = data.url || '';
    if (profDescEl) profDescEl.value = data.description || '';
    if (profLogoEl) profLogoEl.value = '';
  } catch(_) {}
  if (profStatusEl) profStatusEl.textContent = '';
}

async function handleProfileSave(){
  if (!supabase || !selectEl || !selectEl.value) return;
  const labelId = selectEl.value;
  const name = (profNameEl?.value || '').trim();
  const url = (profUrlEl?.value || '').trim();
  const description = (profDescEl?.value || '').trim();
  if (!name) { if (profStatusEl) profStatusEl.textContent = 'Nome obrigatório.'; return; }
  try { if (profStatusEl) profStatusEl.textContent = 'A guardar…'; } catch(_) {}
  let patch = { name, url, description };
  try {
    const file = profLogoEl && profLogoEl.files && profLogoEl.files[0] ? profLogoEl.files[0] : null;
    if (file) {
      const up = await uploadFileToWorker(file, `labels/${labelId}`, 'cover', { fileName: `logo-${Date.now()}.${fileExt(file.name)||'jpg'}`, contentType: file.type || 'image/jpeg' });
      if (up && up.publicUrl) patch.logo_url = up.publicUrl;
    }
  } catch(_) {}
  const { error } = await supabase.from('labels').update(patch).eq('id', labelId);
  if (error) { if (profStatusEl) profStatusEl.textContent = 'Erro ao guardar.'; return; }
  if (profStatusEl) profStatusEl.textContent = '✔️ Guardado';
}

// ======== Membros ========
function bindMembersHandlers(){
  if (memAddBtn) memAddBtn.addEventListener('click', handleAddMember);
}

async function loadMembers(labelId){
  if (!supabase || !memListEl || !labelId) return;
  try { if (memStatusEl) memStatusEl.textContent = 'A carregar…'; } catch(_) {}
  const res = await supabase.from('label_members').select('email').eq('label_id', labelId).order('email');
  if (res.error) { if (memListEl) memListEl.innerHTML = '<p class="text-muted">Erro a carregar membros.</p>'; if (memStatusEl) memStatusEl.textContent = ''; return; }
  const list = Array.isArray(res.data) ? res.data : [];
  if (!list.length) { memListEl.innerHTML = '<p class="text-muted">Sem membros.</p>'; if (memStatusEl) memStatusEl.textContent = ''; return; }
  memListEl.innerHTML = list.map(r => memberRow(r.email)).join('');
  memListEl.querySelectorAll('[data-mem-del]').forEach(btn => btn.addEventListener('click', async () => {
    const email = btn.getAttribute('data-mem-del');
    if (!email) return;
    const ok = confirm(`Remover membro ${email}?`);
    if (!ok) return;
    try { if (memStatusEl) memStatusEl.textContent = 'A remover…'; } catch(_) {}
    await supabase.from('label_members').delete().eq('label_id', labelId).eq('email', email);
    if (memStatusEl) memStatusEl.textContent = '';
    loadMembers(labelId);
  }));
  if (memStatusEl) memStatusEl.textContent = '';
}

function memberRow(email){
  const e = String(email || '');
  return `
    <div class="track-item">
      <div class="track-cover">👤</div>
      <div class="track-info">
        <div class="track-title">${e}</div>
      </div>
      <div class="track-actions">
        <button class="action-btn" data-mem-del="${e}">🗑️</button>
      </div>
    </div>
  `;
}

async function handleAddMember(){
  if (!supabase || !selectEl || !selectEl.value) return;
  const labelId = selectEl.value;
  const email = (memEmailEl?.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) { if (memStatusEl) memStatusEl.textContent = 'Email inválido.'; return; }
  try { if (memStatusEl) memStatusEl.textContent = 'A adicionar…'; } catch(_) {}
  const { error } = await supabase.from('label_members').insert({ label_id: labelId, email });
  if (error) { if (memStatusEl) memStatusEl.textContent = 'Erro ao adicionar.'; return; }
  try { if (memEmailEl) memEmailEl.value = ''; } catch(_) {}
  if (memStatusEl) memStatusEl.textContent = '';
  loadMembers(labelId);
}

function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s_]+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '')
    .replace(/\-+/g, '-').replace(/^-|-$|\.$/g, '')
    .toLowerCase() || 'release';
}

function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v); return isFinite(n) ? n : null;
}
function fileExt(name) { try { const m = String(name || '').match(/\.([a-zA-Z0-9]+)$/); return m ? m[1].toLowerCase() : ''; } catch(_) { return ''; } }
function baseName(name) { try { return String(name || '').replace(/\\/g,'/').split('/').pop().replace(/\.[^/.]+$/, ''); } catch(_) { return 'track'; } }
function resolveApiBase() {
  try {
    const devDefault = (typeof location !== 'undefined' && location.origin.startsWith('file:')) ? 'http://127.0.0.1:8787' : '';
    return (typeof window !== 'undefined' && window.R2_API_URL) ? window.R2_API_URL : (devDefault || '');
  } catch(_) { return ''; }
}
async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session && session.access_token ? session.access_token : '';
  if (!token) throw new Error('Sem sessão válida');
  return token;
}
async function uploadFileToWorker(file, folder, type = 'audio', opts = {}) {
  const apiBase = resolveApiBase();
  if (!apiBase) throw new Error('R2 API base não configurada');
  const token = await getAuthToken();
  const fd = new FormData();
  fd.append('file', file, opts.fileName || file.name || 'file');
  fd.append('folder', folder || 'uploads');
  fd.append('type', type);
  if (opts.order != null) fd.append('order', String(opts.order));
  if (opts.base) fd.append('base', String(opts.base));
  if (opts.contentType) fd.append('contentType', String(opts.contentType));
  let j = {};
  if (typeof XMLHttpRequest !== 'undefined') {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${apiBase}/upload`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.responseType = 'json';
      if (xhr.upload && typeof opts.onProgress === 'function') {
        xhr.upload.onprogress = (e) => {
          try {
            if (e && e.lengthComputable) {
              const p = Math.max(0, Math.min(100, (e.loaded / Math.max(1, e.total)) * 100));
              opts.onProgress(p);
            } else { opts.onProgress(null); }
          } catch(_) {}
        };
      }
      xhr.onerror = () => reject(new Error('xhr error'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response || {});
        else reject(new Error(`Worker falhou (${xhr.status}): ${xhr.responseText || ''}`));
      };
      xhr.send(fd);
    }).then((resp) => { j = resp || {}; }).catch((e) => { throw e; });
  } else {
    const res = await fetch(`${apiBase}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    if (!res.ok) { const txt = await res.text().catch(()=>'' ); throw new Error(`Worker falhou (${res.status}): ${txt}`); }
    j = await res.json().catch(()=>({}));
  }
  return { publicUrl: j.publicUrl || j.url || '', duration: typeof j.duration === 'number' ? j.duration : null };
}
async function ensureArtistId(artistName) {
  const name = String(artistName || '').trim();
  if (!name) return null;
  let sel = await supabase.from('artists').select('id').eq('name', name).maybeSingle();
  if (sel && sel.data && sel.data.id) return sel.data.id;
  const ins = await supabase.from('artists').insert({ name }).select('id').maybeSingle();
  if (ins && ins.data && ins.data.id) return ins.data.id;
  const up = await supabase.from('artists').upsert({ name }, { onConflict: 'name' }).select('id').maybeSingle();
  return up && up.data ? up.data.id : null;
}
async function ensureArtistIdsBatch(namesArr) {
  const names = Array.from(new Set((namesArr || []).map(n => String(n || '').trim()).filter(Boolean)));
  const map = new Map();
  if (!names.length) return map;
  let sel = await supabase.from('artists').select('id,name').in('name', names);
  if (!sel.error && Array.isArray(sel.data)) sel.data.forEach(r => map.set(r.name, r.id));
  const missing = names.filter(n => !map.has(n));
  if (missing.length) {
    const up = await supabase.from('artists').upsert(missing.map(n => ({ name: n })), { onConflict: 'name' }).select('id,name');
    if (!up.error && Array.isArray(up.data)) up.data.forEach(r => map.set(r.name, r.id));
    const still = missing.filter(n => !map.has(n));
    if (still.length) {
      sel = await supabase.from('artists').select('id,name').in('name', still);
      if (!sel.error && Array.isArray(sel.data)) sel.data.forEach(r => map.set(r.name, r.id));
    }
  }
  return map;
}
function makeTrackRow() {
  const wrap = document.createElement('div');
  wrap.className = 'track-row';
  wrap.style = 'display:grid;grid-template-columns:1.2fr 80px 1fr 0.8fr auto;gap:0.5rem;align-items:end;margin:0.5rem 0;';
  wrap.innerHTML = `
    <div class="form-group" style="margin:0;">
      <label class="form-label">Título</label>
      <input class="form-input track-title" type="text" placeholder="Ex: Faixa 1">
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label">#</label>
      <input class="form-input track-number" type="number" min="1" placeholder="1">
    </div>
    <div class="form-group track-artist-group" style="margin:0; display:none;">
      <label class="form-label">Artista</label>
      <input class="form-input track-artist" type="text" placeholder="Ex: Artista da faixa">
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label">Preço</label>
      <input class="form-input track-price" type="number" step="0.01" min="0" placeholder="1.00">
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label">Áudio</label>
      <input class="form-input track-file" type="file" accept="audio/*" required>
    </div>
    <div style="grid-column: 1 / -1; display:flex; justify-content:flex-end;">
      <button type="button" class="btn btn-ghost btn-sm remove-track">Remover</button>
    </div>
    <div class="upload-progress" style="grid-column: 1 / -1; height:6px; background:#e5e7eb; border-radius:6px; overflow:hidden; display:none; margin-top:4px;">
      <div class="bar" style="height:100%; width:0; background:#1e90ff;"></div>
    </div>`;
  wrap.querySelector('.remove-track').addEventListener('click', () => { wrap.remove(); try { recomputeUploadControls(); } catch(_) {} });
  attachRowDragHandlers(wrap);
  return wrap;
}
function collectNewTracks() {
  const rows = Array.from(ulTracksWrapEl.querySelectorAll('.track-row'));
  const list = rows.map((row, i) => {
    const title = row.querySelector('.track-title')?.value || '';
    const numStr = row.querySelector('.track-number')?.value || '';
    const priceStr = row.querySelector('.track-price')?.value || '';
    const artist = row.querySelector('.track-artist')?.value || '';
    const fileInput = row.querySelector('.track-file');
    let file = (fileInput && fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;
    if (!file && row.dataset && row.dataset.fileIndex) {
      const idx = Number(row.dataset.fileIndex);
      if (Number.isFinite(idx) && ulDroppedFiles[idx]) file = ulDroppedFiles[idx];
    }
    const order = num(numStr) ?? (i + 1);
    return { title, order, price: num(priceStr), file, artist, row };
  }).filter(t => !!t.file);
  list.sort((a,b) => (a.order||0) - (b.order||0));
  return list;
}
function bindUploadHandlers(){
  if (ulAddTrackBtn && ulTracksWrapEl && ulTracksWrapEl.children.length === 0) {
    ulTracksWrapEl.appendChild(makeTrackRow());
  }
  if (ulAddTrackBtn) ulAddTrackBtn.addEventListener('click', () => { ulTracksWrapEl.appendChild(makeTrackRow()); toggleCompilationUI(); setUploadSubtab('tracks'); });
  if (ulSubmitBtn) ulSubmitBtn.addEventListener('click', handleUploadSubmit);
  if (ulPickFilesBtn && ulBulkEl) ulPickFilesBtn.addEventListener('click', () => ulBulkEl.click());
  ulCompilationEl = document.getElementById('label-admin-compilation');
  if (ulCompilationEl) ulCompilationEl.addEventListener('change', toggleCompilationUI);
  bindUploadSubtabs();
  if (ulBulkEl) ulBulkEl.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addBulkFiles(files);
    try { ulBulkEl.value = ''; } catch(_) {}
  });
  if (ulPickFolderBtn && ulFolderEl) ulPickFolderBtn.addEventListener('click', () => ulFolderEl.click());
  if (ulFolderEl) ulFolderEl.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addBulkFiles(files);
    try { ulFolderEl.value = ''; } catch(_) {}
  });
  if (ulUploadSectionEl) {
    ;['dragenter','dragover'].forEach(ev => ulUploadSectionEl.addEventListener(ev, (e)=>{ e.preventDefault(); e.stopPropagation(); }));
    ;['drop'].forEach(ev => ulUploadSectionEl.addEventListener(ev, (e)=>{
      e.preventDefault(); e.stopPropagation();
      const files = Array.from(e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : []);
      if (files.length) addBulkFiles(files);
    }));
  }
  enableUploadTouchDnD();
  toggleCompilationUI();
  try { const saved = localStorage.getItem('label_admin_upload_subtab') || 'meta'; setUploadSubtab(saved); } catch(_) { setUploadSubtab('meta'); }
}

function addBulkFiles(files){
  const audioFiles = files.filter(f => (f.type && f.type.startsWith('audio')) || /\.(mp3|wav|flac|aiff|m4a|ogg)$/i.test(f.name));
  if (!audioFiles.length) return;
  // order by filename natural
  audioFiles.sort((a,b)=>String(a.name).localeCompare(String(b.name), undefined, { numeric:true, sensitivity:'base' }));
  const isFolderHint = audioFiles.some(f => !!(f.webkitRelativePath && f.webkitRelativePath.includes('/')));
  const isComp = !!(ulCompilationEl && ulCompilationEl.checked);
  audioFiles.forEach((file) => {
    const row = makeTrackRow();
    const name = file.name || 'Track';
    const base = baseName(name);
    const parsed = parseFilenameBase(base);
    const trackNum = parsed.number;
    const artistFromName = parsed.artist || '';
    const titleFromName = parsed.title || base;
    const titleEl = row.querySelector('.track-title');
    const numEl = row.querySelector('.track-number');
    const rowArtistEl = row.querySelector('.track-artist');
    if (titleEl) titleEl.value = titleFromName || base;
    if (numEl) numEl.value = Number.isFinite(trackNum) ? String(trackNum) : '';
    // Compilação: colocar artista na linha; Caso contrário, preencher global se vazio
    try {
      if (isComp) {
        if (rowArtistEl) rowArtistEl.value = artistFromName;
      } else if (ulArtistEl && !ulArtistEl.value && artistFromName) {
        ulArtistEl.value = artistFromName;
      }
    } catch(_) {}
    row.dataset.fileIndex = String(ulDroppedFiles.length);
    ulDroppedFiles.push(file);
    ulTracksWrapEl.appendChild(row);
  });
  normalizeTrackNumbers();
  toggleCompilationUI();
  setUploadSubtab('tracks');
  // Ocultar controlos redundantes quando usar pasta ou multi-ficheiro
  try {
    const many = audioFiles.length > 1;
    if ((isFolderHint || many)) {
      if (ulAddTrackBtn) ulAddTrackBtn.style.display = 'none';
      if (ulPickFilesBtn) ulPickFilesBtn.style.display = 'none';
    }
    recomputeUploadControls();
  } catch(_) {}
}

function toggleCompilationUI(){
  const isComp = !!(ulCompilationEl && ulCompilationEl.checked);
  try {
    if (ulArtistEl) ulArtistEl.placeholder = isComp ? 'Vários Artistas (opcional)' : 'Ex: Reu.Ven';
  } catch(_) {}
  try {
    const rows = Array.from(ulTracksWrapEl.querySelectorAll('.track-row'));
    rows.forEach(row => {
      const g = row.querySelector('.track-artist-group');
      if (g) g.style.display = isComp ? '' : 'none';
    });
  } catch(_) {}
}

function parseFilenameBase(base){
  try {
    let s = String(base || '').replace(/_/g,' ').trim();
    s = s.replace(/\s+/g,' ').trim();
    // Remove bracketed or explicit side markers or numbering
    s = s.replace(/^\[((?:\d{1,3}|[A-D]\d))\]\s*/, '')
         .replace(/^([A-D]\d)\s*[-.)]\s*/i, '')
         .replace(/^(\d{1,3})[).]\s*/, '$1 ');
    // Number + Artist + Title (hyphen-like)
    let m = s.match(/^\s*(\d{1,3}|[A-D]\d)\s*[-–—]\s*(.+?)\s*[-–—]\s*(.+)\s*$/);
    if (m) return normalizeFeaturing({ number: num(m[1]), artist: m[2].trim(), title: m[3].trim() });
    // Number (space) Artist - Title
    m = s.match(/^\s*(\d{1,3}|[A-D]\d)\s+(.+?)\s*[-–—]\s*(.+)\s*$/);
    if (m) return normalizeFeaturing({ number: num(m[1]), artist: m[2].trim(), title: m[3].trim() });
    // Number + Title
    m = s.match(/^\s*(\d{1,3}|[A-D]\d)\s*[-–—. ]+\s*(.+)\s*$/);
    if (m) return normalizeFeaturing({ number: num(m[1]), artist: '', title: m[2].trim() });
    // Artist - Title
    m = s.match(/^\s*(.+?)\s*[-–—]\s*(.+)\s*$/);
    if (m) return normalizeFeaturing({ number: null, artist: m[1].trim(), title: m[2].trim() });
    // Fallback
    return { number: null, artist: '', title: s };
  } catch(_){ return { number: null, artist: '', title: String(base||'') }; }
}

function normalizeFeaturing(obj){
  try {
    let { number, artist, title } = obj || {};
    artist = String(artist || '').trim();
    title = String(title || '').trim();
    // If artist contains featuring, move to title
    const mA = artist.match(/^(.*)\s+(?:ft\.|feat\.|featuring)\s+(.+)$/i);
    if (mA) {
      artist = mA[1].trim();
      const ftNames = mA[2].trim();
      if (!/\(feat\./i.test(title)) {
        title = `${title} (feat. ${ftNames})`.trim();
      }
    }
    // If title contains ft./feat. without parentheses, standardize to (feat. X)
    const mT = title.match(/^(.*)\s+(?:ft\.|feat\.|featuring)\s+(.+)$/i);
    if (mT) {
      title = `${mT[1].trim()} (feat. ${mT[2].trim()})`;
    }
    return { number, artist, title };
  } catch(_) { return obj; }
}

function bindUploadSubtabs(){
  try {
    const btns = Array.from(document.querySelectorAll('#label-admin-upload-tabs .upload-subtab'));
    btns.forEach(b => b.addEventListener('click', () => setUploadSubtab(b.getAttribute('data-subtab'))));
  } catch(_) {}
}

function setUploadSubtab(tab){
  const meta = document.getElementById('label-admin-upload-meta');
  const tracks = document.getElementById('label-admin-upload-tracks');
  const btns = Array.from(document.querySelectorAll('#label-admin-upload-tabs .upload-subtab'));
  const t = (tab === 'tracks') ? 'tracks' : 'meta';
  try { if (meta) meta.style.display = (t === 'meta') ? 'block' : 'none'; } catch(_) {}
  try { if (tracks) tracks.style.display = (t === 'tracks') ? 'block' : 'none'; } catch(_) {}
  try { btns.forEach(b => { if (b.getAttribute('data-subtab') === t) b.classList.add('active'); else b.classList.remove('active'); }); } catch(_) {}
  try { localStorage.setItem('label_admin_upload_subtab', t); } catch(_) {}
}

function normalizeTrackNumbers(){
  const rows = Array.from(ulTracksWrapEl.querySelectorAll('.track-row'));
  rows.forEach((row, i) => {
    const numEl = row.querySelector('.track-number');
    if (numEl && (!numEl.value || Number(numEl.value) <= 0)) numEl.value = String(i+1);
  });
}

function recomputeUploadControls(){
  try {
    const rows = Array.from(ulTracksWrapEl.querySelectorAll('.track-row'));
    const many = rows.length > 1;
    if (ulAddTrackBtn) ulAddTrackBtn.style.display = many ? 'none' : '';
    if (ulPickFilesBtn) ulPickFilesBtn.style.display = many ? 'none' : '';
  } catch(_) {}
}

function attachRowDragHandlers(row){
  try { row.setAttribute('draggable', 'true'); } catch(_) {}
  row.addEventListener('dragstart', (e)=>{
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  row.addEventListener('dragend', ()=>{
    row.classList.remove('dragging');
    normalizeTrackNumbers();
  });
  ulTracksWrapEl.addEventListener('dragover', (e)=>{
    e.preventDefault();
    const dragging = ulTracksWrapEl.querySelector('.dragging');
    if (!dragging) return;
    const after = getDragAfterElement(ulTracksWrapEl, e.clientY);
    if (after == null) ulTracksWrapEl.appendChild(dragging); else ulTracksWrapEl.insertBefore(dragging, after);
  });
}

function getDragAfterElement(container, y){
  const els = [...container.querySelectorAll('.track-row:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function enableUploadTouchDnD(){
  const container = ulTracksWrapEl;
  if (!container || container.__touchDnDBound) return;
  container.__touchDnDBound = true;
  let dragging = null;
  container.addEventListener('touchstart', (e) => {
    const item = e.target && e.target.closest ? e.target.closest('.track-row') : null;
    if (!item) return;
    dragging = item;
    item.classList.add('dragging');
  }, { passive: true });
  container.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const y = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
    const after = getDragAfterElement(container, y);
    if (after == null) container.appendChild(dragging); else container.insertBefore(dragging, after);
  }, { passive: false });
  container.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    dragging = null;
    normalizeTrackNumbers();
  });
}
async function handleUploadSubmit(){
  if (!supabase) return;
  if (!selectEl || !selectEl.value) { if (ulStatusEl) ulStatusEl.textContent = 'Seleciona uma Label.'; return; }
  const labelId = selectEl.value;
  const title = (ulTitleEl?.value || '').trim();
  const artist = (ulArtistEl?.value || '').trim();
  const isComp = !!(ulCompilationEl && ulCompilationEl.checked);
  const year = num(ulYearEl?.value || '');
  const releasePrice = num(ulPriceEl?.value || '');
  const publishLocal = (ulDateEl?.value || '').trim();
  const publishAt = publishLocal ? new Date(publishLocal).toISOString() : null;
  const description = (ulDescEl?.value || '').trim() || null;
  const coverFile = ulCoverEl && ulCoverEl.files && ulCoverEl.files[0] ? ulCoverEl.files[0] : null;
  if (!title) { if (ulStatusEl) ulStatusEl.textContent = 'Título do release é obrigatório.'; return; }
  const tracks = collectNewTracks();
  if (!tracks.length) { if (ulStatusEl) ulStatusEl.textContent = 'Adiciona pelo menos uma faixa.'; return; }
  if (isComp) {
    const missing = tracks.some(t => !(t.artist && t.artist.trim()));
    if (missing) { if (ulStatusEl) ulStatusEl.textContent = 'Em Compilação, cada faixa deve ter um Artista.'; return; }
  } else {
    if (!artist) { if (ulStatusEl) ulStatusEl.textContent = 'Artista principal é obrigatório (para não-compilação).'; return; }
  }
  try { if (ulStatusEl) ulStatusEl.textContent = 'A preparar…'; } catch(_) {}
  // Organizar uploads por Label: labels/<labelId>/<release-folder>
  const folder = `labels/${labelId}/${slugify(title)}-${Date.now()}`;
  let coverUrl = null;
  if (coverFile) {
    try {
      if (ulStatusEl) ulStatusEl.textContent = 'A carregar capa…';
      const ext = fileExt(coverFile.name) || 'jpg';
      const up = await uploadFileToWorker(coverFile, folder, 'cover', { fileName: `cover_${Date.now()}.${ext}`, contentType: coverFile.type || 'image/jpeg', onProgress: (p)=>{
        try {
          const bar = document.querySelector('#label-admin-upload-meta .upload-progress .bar');
          const wrap = document.querySelector('#label-admin-upload-meta .upload-progress');
          if (wrap) wrap.style.display = '';
          if (bar && typeof p === 'number') bar.style.width = `${p}%`;
        } catch(_) {}
      } });
      coverUrl = up.publicUrl || null;
    } catch(e) { if (ulStatusEl) ulStatusEl.textContent = 'Falha no upload da capa.'; return; }
  }
  let artist_id = null;
  let artistsMap = new Map();
  if (!isComp) {
    if (ulStatusEl) ulStatusEl.textContent = 'A registar artista…';
    artistsMap = await ensureArtistIdsBatch([artist]);
    artist_id = artistsMap.get(artist) || null;
  } else {
    const names = tracks.map(t => t.artist).filter(Boolean);
    artistsMap = await ensureArtistIdsBatch(names);
  }
  if (ulStatusEl) ulStatusEl.textContent = 'A criar release…';
  const creditsObj = {};
  if (isComp) creditsObj.release_artist = 'Vários Artistas';
  else if (artist) creditsObj.release_artist = artist;
  try { creditsObj.storage_folder = folder; } catch(_) {}
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session && session.user ? (session.user.id || session.user.sub || null) : null;
    if (uid) creditsObj.storage_user_id = uid;
  } catch(_) {}
  const payload = {
    title, subtitle: null, year, cover_url: coverUrl, total_duration: null, description,
    genres: [], credits: creditsObj, featured: false, release_price: releasePrice, label_id: labelId
  };
  if (publishAt) payload.publish_at = publishAt;
  const relInsert = await supabase.from('releases').insert(payload).select('id').maybeSingle();
  if (!relInsert || !relInsert.data || !relInsert.data.id) { if (ulStatusEl) ulStatusEl.textContent = 'Falha a criar release.'; return; }
  const release_id = relInsert.data.id;
  // Tracks upload
  const trackRows = [];
  for (let i=0;i<tracks.length;i++){
    const t = tracks[i];
    if (ulStatusEl) ulStatusEl.textContent = `A carregar faixa ${i+1}/${tracks.length}…`;
    const base = slugify(t.title || baseName(t.file?.name || 'track'));
    const ext = fileExt(t.file?.name) || 'mp3';
    const fname = `${String(t.order || (i+1)).padStart(2,'0')}-${base}-${Date.now()}.${ext}`;
    const rowBar = t.row ? t.row.querySelector('.upload-progress .bar') : null;
    const rowWrap = t.row ? t.row.querySelector('.upload-progress') : null;
    try { if (rowWrap) rowWrap.style.display = ''; } catch(_) {}
    const up = await uploadFileToWorker(t.file, folder, 'audio', { fileName: fname, base, order: t.order, contentType: t.file.type || 'audio/mpeg', onProgress: (p)=>{
      try { if (rowBar && typeof p === 'number') rowBar.style.width = `${p}%`; } catch(_) {}
    } });
    const artistName = isComp ? (t.artist || '').trim() : artist;
    const tArtistId = isComp ? (artistsMap.get(artistName) || null) : artist_id;
    trackRows.push({
      title: t.title || baseName(t.file?.name || 'Track'), artist: artistName, artist_id: tArtistId, release_id,
      url: up.publicUrl || '', cover_url: coverUrl, duration: (typeof up.duration==='number'?up.duration:null), price: t.price, track_order: t.order,
      bpm: null, key: null, genre_tags: []
    });
  }
  if (ulStatusEl) ulStatusEl.textContent = 'A registar faixas…';
  const insTracks = await supabase.from('tracks').insert(trackRows);
  if (insTracks.error) { if (ulStatusEl) ulStatusEl.textContent = 'Erro ao registar faixas.'; return; }
  if (ulStatusEl) ulStatusEl.textContent = `✅ Upload concluído: 1 release, ${trackRows.length} faixas.`;
  // Limpar form e atualizar lista
  try {
    if (ulTitleEl) ulTitleEl.value = '';
    if (ulArtistEl) ulArtistEl.value = '';
    if (ulYearEl) ulYearEl.value = '';
    if (ulPriceEl) ulPriceEl.value = '';
    if (ulDateEl) ulDateEl.value = '';
    if (ulDescEl) ulDescEl.value = '';
    if (ulCoverEl) ulCoverEl.value = '';
    if (ulTracksWrapEl) { ulTracksWrapEl.innerHTML=''; ulTracksWrapEl.appendChild(makeTrackRow()); }
  } catch(_) {}
  await loadReleasesForLabel(labelId);
}

// ======== Backfill storage metadata ========
function bindBackfillHandlers(){
  try {
    const btn = document.getElementById('label-admin-releases-backfill');
    const st = document.getElementById('label-admin-releases-status');
    if (btn && !btn.__bound){ btn.__bound = true; btn.addEventListener('click', async () => { const id = selectEl ? selectEl.value : ''; if (!id) return; if (st) st.textContent = 'A preencher…'; await backfillStorageMetaForLabel(id); if (st) st.textContent = '✔️ Concluído'; await loadReleasesForLabel(id); }); }
  } catch(_) {}
}
async function backfillStorageMetaForLabel(labelId){
  try {
    const relsRes = await supabase.from('releases').select('id,credits,cover_url').eq('label_id', labelId);
    if (relsRes.error || !Array.isArray(relsRes.data)) return;
    for (const r of relsRes.data){
      try {
        const credits = (r && r.credits && typeof r.credits === 'object') ? { ...r.credits } : {};
        if (credits.storage_folder && credits.storage_user_id) continue;
        let key = null;
        const tr = await supabase.from('tracks').select('url').eq('release_id', r.id).limit(1).maybeSingle();
        if (tr && tr.data && tr.data.url) key = extractKeyFromUrl(tr.data.url);
        if (!key && r && r.cover_url) key = extractKeyFromUrl(r.cover_url);
        if (!key) continue;
        const parts = decodeURIComponent(String(key || '').replace(/^\/+|\/+$/g, '')).split('/');
        if (parts.length >= 2){
          const userId = parts[0];
          const folder = parts[1];
          if (!credits.storage_user_id) credits.storage_user_id = userId;
          if (!credits.storage_folder) credits.storage_folder = folder;
          await supabase.from('releases').update({ credits }).eq('id', r.id);
        }
      } catch(_) {}
    }
  } catch(_) {}
}
function extractKeyFromUrl(u){
  try {
    const s = String(u || '');
    const m = s.match(/\/api\/file\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : '';
  } catch(_) { return ''; }
}
