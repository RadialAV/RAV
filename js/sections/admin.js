// js/sections/admin.js

import { getSupabaseClient } from '../supabase.js';

let supabase = null;
let adminGuardEl = null;
let adminPanelsEl = null;
let adminReleasesListEl = null;
let adminTracksListEl = null;
let adminRelIdEl = null;
let adminRelPublishEl = null;
let adminRelFeaturedEl = null;
let adminRelSaveBtn = null;
let adminRelStatusEl = null;
let adminAllowEmailEl = null;
let adminAllowAddBtn = null;
let adminAllowStatusEl = null;
let adminAllowListEl = null;
let adminArtSearchEl = null;
let adminArtStatusEl = null;
let adminArtListEl = null;
let adminLabelsSearchEl = null;
let adminLabelsStatusEl = null;
let adminLabelsListEl = null;
let adminLabelsCreateBtn = null;
let adminActiveTab = 'releases';

export async function initAdminSection() {
  adminGuardEl = document.getElementById('admin-guard');
  adminPanelsEl = document.getElementById('admin-panels');
  adminReleasesListEl = document.getElementById('admin-releases-list');
  adminTracksListEl = document.getElementById('admin-tracks-list');
  adminRelIdEl = document.getElementById('admin-rel-id');
  adminRelPublishEl = document.getElementById('admin-rel-publish');
  adminRelFeaturedEl = document.getElementById('admin-rel-featured');
  adminRelSaveBtn = document.getElementById('admin-rel-save');
  adminRelStatusEl = document.getElementById('admin-rel-status');
  adminAllowEmailEl = document.getElementById('admin-allow-email');
  adminAllowAddBtn = document.getElementById('admin-allow-add');
  adminAllowStatusEl = document.getElementById('admin-allow-status');
  adminAllowListEl = document.getElementById('admin-allow-list');
  adminArtSearchEl = document.getElementById('admin-art-search');
  adminArtStatusEl = document.getElementById('admin-art-status');
  adminArtListEl = document.getElementById('admin-art-list');
  adminLabelsSearchEl = document.getElementById('admin-labels-search');
  adminLabelsStatusEl = document.getElementById('admin-labels-status');
  adminLabelsListEl = document.getElementById('admin-labels-list');
  adminLabelsCreateBtn = document.getElementById('admin-labels-create');
  supabase = await getSupabaseClient();
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  const user = session && session.user ? session.user : null;
  const isAdmin = await checkAdmin(user);
  if (!isAdmin) {
    if (adminGuardEl) adminGuardEl.textContent = 'Acesso restrito: apenas Admin Master.';
    if (adminPanelsEl) adminPanelsEl.style.display = 'none';
    return;
  }

function slugify(s) {
  try {
    return String(s || '')
      .normalize('NFKD').replace(/[\u0000-\u001f]/g, '')
      .replace(/[\s_]+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '')
      .replace(/\-+/g, '-').replace(/^-|-$|\.$/g, '')
      .toLowerCase() || 'label';
  } catch(_) { return 'label'; }
}

async function handleCreateLabel(){
  if (!supabase) return;
  try { if (adminLabelsStatusEl) adminLabelsStatusEl.textContent = ''; } catch(_) {}
  let name = window.prompt('Nome da editora:', 'Nova Editora');
  if (!name) return;
  try { if (adminLabelsStatusEl) adminLabelsStatusEl.textContent = 'A criar…'; } catch(_) {}
  let slug = slugify(name);
  let ins = await supabase.from('labels').insert({ name, slug }).select('id').maybeSingle();
  if (ins.error || !ins.data || !ins.data.id) {
    // tentar com slug único
    slug = `${slug}-${Date.now()}`;
    ins = await supabase.from('labels').insert({ name, slug }).select('id').maybeSingle();
    if (ins.error || !ins.data || !ins.data.id) {
      if (adminLabelsStatusEl) adminLabelsStatusEl.textContent = 'Erro ao criar editora.'; return;
    }
  }
  const newId = ins.data.id;
  let email = '';
  try { const { data: { session } } = await supabase.auth.getSession(); email = session && session.user ? (session.user.email || '') : ''; } catch(_) {}
  if (email) {
    try { await supabase.from('label_members').insert({ label_id: newId, email }); } catch(_) {}
  }
  if (adminLabelsStatusEl) adminLabelsStatusEl.textContent = '✔️ Editora criada';
  await loadAdminLabels(adminLabelsSearchEl ? (adminLabelsSearchEl.value || '') : '');
  // Garantir que o botão Label Admin aparece e navegar
  try {
    const labBtn = document.getElementById('nav-labeladmin-btn');
    if (labBtn) labBtn.style.display = '';
    if (window.showSection) window.showSection('label-admin');
    window.location.hash = '#label-admin';
  } catch(_) {}
}

// ======== Labels (Editoras) ========
async function loadAdminLabels(query){
  if (!supabase || !adminLabelsListEl) return;
  try { if (adminLabelsStatusEl) adminLabelsStatusEl.textContent = 'A carregar…'; } catch(_) {}
  const like = (query || '').trim();
  let data = null, error = null;
  try {
    const req = supabase.from('labels').select('id,name,logo_url').order('name');
    const res = like ? await req.ilike('name', `%${like}%`) : await req;
    data = res.data; error = res.error;
  } catch(e) { error = e; }
  if (error) { if (adminLabelsStatusEl) adminLabelsStatusEl.textContent = 'Erro a carregar editoras.'; return; }
  const list = Array.isArray(data) ? data : [];
  renderAdminLabels(list);
  if (adminLabelsStatusEl) adminLabelsStatusEl.textContent = '';
}

function renderAdminLabels(list){
  if (!adminLabelsListEl) return;
  if (!list.length) { adminLabelsListEl.innerHTML = '<p class="text-muted">Sem editoras.</p>'; return; }
  adminLabelsListEl.innerHTML = list.map(l => {
    const cover = l.logo_url ? `<img src="${l.logo_url}" alt="${l.name}" class="track-cover-img">` : '🏷️';
    return `
      <div class="track-item">
        <div class="track-cover">${cover}</div>
        <div class="track-info"><div class="track-title">${l.name || ''}</div></div>
        <div class="track-actions">
          <button class="action-btn" data-lbl-del="${l.id}" title="Eliminar editora">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
  adminLabelsListEl.querySelectorAll('[data-lbl-del]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-lbl-del');
    await handleDeleteLabel(id);
  }));
}

async function handleDeleteLabel(labelId){
  if (!labelId) return;
  const ok = confirm('Eliminar esta editora e os seus releases e músicas?');
  if (!ok) return;
  try { if (adminLabelsStatusEl) adminLabelsStatusEl.textContent = 'A eliminar…'; } catch(_) {}
  // Apagar tracks dos releases desta label
  let rels = [];
  try {
    const res = await supabase.from('releases').select('id,credits,label_id').eq('label_id', labelId);
    if (!res.error && Array.isArray(res.data)) rels = res.data;
  } catch(_) {}
  // Apagar ficheiros R2 de cada release via Worker (best-effort)
  try {
    const apiBase = resolveApiBase();
    const token = await getAuthToken();
    for (const r of rels) {
      try {
        const credits = r && r.credits ? r.credits : {};
        const folder = credits && credits.storage_folder ? String(credits.storage_folder) : '';
        const ownerUserId = credits && credits.storage_user_id ? String(credits.storage_user_id) : '';
        if (folder) {
          await fetch(`${apiBase}/delete-release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ folder, releaseId: r.id, ownerUserId, labelId })
          }).catch(()=>{});
        }
      } catch(_) {}
    }
  } catch(_) {}
  // Apagar purchases das faixas desta label (evitar 409 por FK)
  try {
    const relIds = rels.map(r => r.id);
    if (relIds.length) {
      const tr = await supabase.from('tracks').select('id').in('release_id', relIds);
      const trackIds = Array.isArray(tr.data) ? tr.data.map(t => t.id) : [];
      if (trackIds.length) {
        await supabase.from('purchases').delete().in('track_id', trackIds);
      }
    }
  } catch(_) {}
  for (const r of rels) {
    try { await supabase.from('tracks').delete().eq('release_id', r.id); } catch(_) {}
  }
  // Apagar releases
  try { await supabase.from('releases').delete().eq('label_id', labelId); } catch(_) {}
  // Tentar remover memberships se existir tabela
  try { await supabase.from('label_members').delete().eq('label_id', labelId); } catch(_) {}
  // Apagar label
  const del = await supabase.from('labels').delete().eq('id', labelId);
  if (del && del.error) {
    if (adminLabelsStatusEl) adminLabelsStatusEl.textContent = 'Erro ao eliminar editora.';
    return;
  }
  if (adminLabelsStatusEl) adminLabelsStatusEl.textContent = '✔️ Editora eliminada';
  await loadAdminLabels(adminLabelsSearchEl ? (adminLabelsSearchEl.value || '') : '');
}

// ======== Artists (featured) ========
async function loadAdminArtists(query){
  if (!supabase || !adminArtListEl) return;
  try { if (adminArtStatusEl) adminArtStatusEl.textContent = 'A carregar…'; } catch(_) {}
  const like = (query || '').trim();
  let cols = 'id,name,featured';
  let data = null, error = null, featuredSupported = true;
  try {
    const req = supabase.from('artists').select(cols).order('name');
    const res = like ? await req.ilike('name', `%${like}%`) : await req;
    data = res.data; error = res.error;
  } catch(e) { error = e; }
  if (error) {
    // fallback sem coluna featured
    featuredSupported = false; cols = 'id,name';
    try {
      const req2 = supabase.from('artists').select(cols).order('name');
      const res2 = like ? await req2.ilike('name', `%${like}%`) : await req2;
      data = res2.data; error = res2.error;
    } catch(e2) { error = e2; }
  }
  if (error) { if (adminArtStatusEl) adminArtStatusEl.textContent = 'Erro a carregar artistas.'; return; }
  const list = Array.isArray(data) ? data : [];
  renderAdminArtists(list, featuredSupported);
  if (adminArtStatusEl) adminArtStatusEl.textContent = featuredSupported ? '' : 'Nota: coluna artists.featured não encontrada. Ativa para permitir destaque.';
}

function renderAdminArtists(list, featuredSupported){
  if (!adminArtListEl) return;
  if (!list.length) { adminArtListEl.innerHTML = '<p class="text-muted">Sem artistas.</p>'; return; }
  adminArtListEl.innerHTML = list.map(a => `
    <div class="track-item">
      <div class="track-cover">👤</div>
      <div class="track-info"><div class="track-title">${a.name || ''}</div></div>
      <div class="track-actions">
        ${featuredSupported ? `<label class="filter-check" title="Destacar"><input type="checkbox" class="admin-art-featured" data-art-id="${a.id}" ${a.featured ? 'checked' : ''}> Destaque</label>` : ''}
      </div>
    </div>
  `).join('');
  if (featuredSupported) {
    adminArtListEl.querySelectorAll('.admin-art-featured').forEach(cb => cb.addEventListener('change', async () => {
      const id = cb.getAttribute('data-art-id');
      const val = !!cb.checked;
      await toggleArtistFeatured(id, val);
    }));
  }
}

async function toggleArtistFeatured(artistId, featured){
  try { if (adminArtStatusEl) adminArtStatusEl.textContent = 'A guardar…'; } catch(_) {}
  const { error } = await supabase.from('artists').update({ featured }).eq('id', artistId);
  if (error) { if (adminArtStatusEl) adminArtStatusEl.textContent = 'Erro ao guardar.'; return; }
  if (adminArtStatusEl) adminArtStatusEl.textContent = '✔️ Guardado';
}

function bindAdminTabs(){
  try {
    const tabs = Array.from(document.querySelectorAll('#admin-tabs .admin-tab'));
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        try { localStorage.setItem('admin_active_tab', tab); } catch(_) {}
        adminActiveTab = tab;
        showAdminTab(tab);
      });
    });
  } catch(_) {}
}

function showAdminTab(tab){
  const secReleases = document.getElementById('admin-releases');
  const secEditor = document.getElementById('admin-release-editor');
  const secTracks = document.getElementById('admin-tracks');
  const secAllow = document.getElementById('admin-allowlist');
  const secArtists = document.getElementById('admin-artists');
  const secLabels = document.getElementById('admin-labels');
  const isReleases = tab === 'releases';
  const isArtists = tab === 'artists';
  const isLabels = tab === 'labels';
  const isAllow = tab === 'allowlist';
  try { if (secReleases) secReleases.style.display = isReleases ? 'block' : 'none'; } catch(_) {}
  try { if (secEditor) secEditor.style.display = isReleases ? 'block' : 'none'; } catch(_) {}
  try { if (secTracks) secTracks.style.display = isReleases ? 'block' : 'none'; } catch(_) {}
  try { if (secAllow) secAllow.style.display = isAllow ? 'block' : 'none'; } catch(_) {}
  try { if (secArtists) secArtists.style.display = isArtists ? 'block' : 'none'; } catch(_) {}
  try { if (secLabels) secLabels.style.display = isLabels ? 'block' : 'none'; } catch(_) {}
}
  if (adminGuardEl) adminGuardEl.textContent = '';
  if (adminPanelsEl) adminPanelsEl.style.display = 'flex';
  await loadAdminReleases();
  await loadAdminAllowlist();
  await loadAdminArtists('');
  await loadAdminLabels('');
  bindAdminTabs();
  try {
    const savedTab = localStorage.getItem('admin_active_tab');
    if (savedTab) adminActiveTab = savedTab;
  } catch(_) {}
  showAdminTab(adminActiveTab || 'releases');
  try { if (adminRelSaveBtn) adminRelSaveBtn.addEventListener('click', handleAdminRelSave); } catch(_) {}
  try { if (adminAllowAddBtn) adminAllowAddBtn.addEventListener('click', handleAdminAllowAdd); } catch(_) {}
  try {
    if (adminArtSearchEl && !adminArtSearchEl.__bound) {
      let t = null;
      adminArtSearchEl.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => loadAdminArtists(adminArtSearchEl.value || ''), 250);
      });
      adminArtSearchEl.__bound = true;
    }
  } catch(_) {}
  try {
    if (adminLabelsCreateBtn && !adminLabelsCreateBtn.__bound) {
      adminLabelsCreateBtn.addEventListener('click', async () => {
        await handleCreateLabel();
      });
      adminLabelsCreateBtn.__bound = true;
    }
  } catch(_) {}
}

async function checkAdmin(user) {
  try {
    if (!user || !user.email) return false;
    const { data, error } = await supabase.from('admin_masters').select('email').eq('email', user.email).maybeSingle();
    if (error) return false;
    return !!(data && data.email);
  } catch (_) { return false; }
}

async function loadAdminReleases() {
  if (!supabase || !adminReleasesListEl) return;
  try { adminReleasesListEl.innerHTML = '<p class="text-muted">A carregar…</p>'; } catch(_) {}
  const cols = 'id,title,year,cover_url,label_id,publish_at,featured,coming_soon';
  const { data, error } = await supabase.from('releases').select(cols).order('id', { ascending: false });
  if (error) { adminReleasesListEl.innerHTML = '<p class="text-muted">Erro a carregar releases.</p>'; return; }
  const list = Array.isArray(data) ? data : [];
  if (!list.length) { adminReleasesListEl.innerHTML = '<p class="text-muted">Sem releases.</p>'; return; }
  adminReleasesListEl.innerHTML = list.map(r => releaseRow(r)).join('');
  adminReleasesListEl.querySelectorAll('[data-rel-del]').forEach(btn => btn.addEventListener('click', () => handleDeleteRelease(btn.getAttribute('data-rel-del'))));
  adminReleasesListEl.querySelectorAll('[data-rel-tracks]').forEach(btn => btn.addEventListener('click', () => loadAdminTracks(btn.getAttribute('data-rel-tracks'))));
  adminReleasesListEl.querySelectorAll('[data-rel-edit]').forEach(btn => btn.addEventListener('click', () => loadAdminEditor(btn.getAttribute('data-rel-edit'), list)));
}

function releaseRow(r) {
  const cover = r.cover_url ? `<img src="${r.cover_url}" alt="${r.title}" class="track-cover-img">` : '💿';
  const pub = r.publish_at ? new Date(r.publish_at).toLocaleString() : '—';
  const soon = r.coming_soon ? ' • Em breve' : '';
  const feat = r.featured ? ' • Destaque' : '';
  return `
    <div class="track-item">
      <div class="track-cover">${cover}</div>
      <div class="track-info">
        <div class="track-title">${r.title || ''}</div>
        <div class="track-artist">${r.year || ''} • Publica: ${pub}${soon}${feat}</div>
      </div>
      <div class="track-actions">
        <button class="action-btn" data-rel-edit="${r.id}" title="Editar">✏️</button>
        <button class="action-btn" data-rel-tracks="${r.id}" title="Ver músicas">🎵</button>
        <button class="action-btn" data-rel-del="${r.id}" title="Eliminar release">🗑️</button>
      </div>
    </div>
  `;
}

async function loadAdminTracks(releaseId) {
  if (!supabase || !adminTracksListEl) return;
  try { adminTracksListEl.innerHTML = '<p class="text-muted">A carregar…</p>'; } catch(_) {}
  let list = [];
  let got = null;
  try {
    got = await supabase.from('tracks').select('id,title,artist,track_order').eq('release_id', releaseId).order('track_order').order('id');
  } catch(_) {}
  if (!got || got.error) {
    const res2 = await supabase.from('tracks').select('id,title,artist').eq('release_id', releaseId).order('id');
    if (res2.error) { adminTracksListEl.innerHTML = '<p class="text-muted">Erro ao carregar músicas.</p>'; return; }
    list = Array.isArray(res2.data) ? res2.data : [];
  } else {
    list = Array.isArray(got.data) ? got.data : [];
  }
  if (!list.length) { adminTracksListEl.innerHTML = '<p class="text-muted">Sem músicas.</p>'; return; }
  adminTracksListEl.innerHTML = list.map(t => `
    <div class="track-item" data-track-id="${t.id}">
      <div class="track-cover">🎵</div>
      <div class="track-info"><div class="track-title">${t.title || ''}</div><div class="track-artist">${t.artist || ''}</div></div>
      <div class="track-actions"><button class="action-btn" data-trk-del="${t.id}">🗑️</button></div>
    </div>
  `).join('');
  adminTracksListEl.querySelectorAll('[data-trk-del]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-trk-del');
    const ok = confirm('Eliminar esta música?');
    if (!ok) return;
    const { error } = await supabase.from('tracks').delete().eq('id', id);
    if (!error) loadAdminTracks(releaseId);
  }));
  enableAdminTracksDnD(releaseId);
  enableAdminTracksTouchDnD(releaseId);
}

function enableAdminTracksDnD(releaseId){
  const container = adminTracksListEl;
  if (!container) return;
  const items = Array.from(container.querySelectorAll('.track-item'));
  items.forEach(item => {
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', () => item.classList.add('dragging'));
    item.addEventListener('dragend', async () => {
      item.classList.remove('dragging');
      await persistAdminTrackOrderFromDOM(releaseId);
    });
  });
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = container.querySelector('.dragging');
    if (!dragging) return;
    const after = getAfterElementForAdmin(container, e.clientY);
    if (after == null) container.appendChild(dragging); else container.insertBefore(dragging, after);
  });
}

function getAfterElementForAdmin(container, y){
  const els = [...container.querySelectorAll('.track-item:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function persistAdminTrackOrderFromDOM(releaseId){
  const ids = Array.from(adminTracksListEl.querySelectorAll('.track-item')).map(el => el.getAttribute('data-track-id')).filter(Boolean);
  if (!ids.length) return;
  try { if (adminRelStatusEl) adminRelStatusEl.textContent = 'A guardar ordem…'; } catch(_) {}
  let hadError = false;
  for (let i=0;i<ids.length;i++){
    const id = ids[i];
    const order = i+1;
    const { error } = await supabase.from('tracks').update({ track_order: order }).eq('id', id);
    if (error) { hadError = true; break; }
  }
  if (adminRelStatusEl) adminRelStatusEl.textContent = hadError ? 'Nota: coluna track_order pode não existir. (Ordem não guardada)' : '✔️ Ordem guardada';
}

function enableAdminTracksTouchDnD(releaseId){
  const container = adminTracksListEl;
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
    const after = getAfterElementForAdmin(container, y);
    if (after == null) container.appendChild(dragging); else container.insertBefore(dragging, after);
  }, { passive: false });
  container.addEventListener('touchend', async () => {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    dragging = null;
    await persistAdminTrackOrderFromDOM(releaseId);
  });
}

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

async function handleDeleteRelease(id) {
  if (!id) return;
  const ok = confirm('Eliminar este release e todas as suas músicas?');
  if (!ok) return;
  try {
    // Tentar apagar do R2 via Worker primeiro (eliminação consistente)
    const rel = await supabase.from('releases').select('id,credits,label_id').eq('id', id).maybeSingle();
    const credits = rel && rel.data ? (rel.data.credits || {}) : {};
    const folder = credits && credits.storage_folder ? String(credits.storage_folder) : '';
    const ownerUserId = credits && credits.storage_user_id ? String(credits.storage_user_id) : '';
    const labelId = rel && rel.data && rel.data.label_id ? String(rel.data.label_id) : '';
    if (folder) {
      try {
        const apiBase = resolveApiBase();
        const token = await getAuthToken();
        await fetch(`${apiBase}/delete-release`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ folder, releaseId: id, ownerUserId, labelId }) });
      } catch(_) {}
    }
  } catch(_) {}
  await supabase.from('tracks').delete().eq('release_id', id);
  const { error } = await supabase.from('releases').delete().eq('id', id);
  if (!error) {
    await loadAdminReleases();
    if (adminTracksListEl) adminTracksListEl.innerHTML = '';
  }
}

// ======== Release Editor ========
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

function loadAdminEditor(id, list){
  if (!adminRelIdEl) return;
  const r = Array.isArray(list) ? list.find(x => String(x.id) === String(id)) : null;
  adminRelIdEl.value = r ? r.id : '';
  if (adminRelPublishEl) adminRelPublishEl.value = (r && r.publish_at) ? toLocalInputValue(r.publish_at) : '';
  if (adminRelFeaturedEl) adminRelFeaturedEl.checked = !!(r && r.featured);
}

async function handleAdminRelSave(){
  if (!supabase || !adminRelIdEl) return;
  const id = adminRelIdEl.value || '';
  if (!id) { if (adminRelStatusEl) adminRelStatusEl.textContent = 'Seleciona um release.'; return; }
  const patch = {};
  if (adminRelPublishEl && adminRelPublishEl.value) patch.publish_at = fromLocalInputValue(adminRelPublishEl.value);
  if (adminRelFeaturedEl) patch.featured = !!adminRelFeaturedEl.checked;
  try { if (adminRelStatusEl) adminRelStatusEl.textContent = 'A guardar…'; } catch(_) {}
  const { error } = await supabase.from('releases').update(patch).eq('id', id);
  if (error) { if (adminRelStatusEl) adminRelStatusEl.textContent = 'Erro ao guardar.'; return; }
  if (adminRelStatusEl) adminRelStatusEl.textContent = '✔️ Guardado';
  await loadAdminReleases();
}

// ======== Allowlist ========
async function loadAdminAllowlist(){
  if (!supabase || !adminAllowListEl) return;
  try { adminAllowListEl.innerHTML = '<p class="text-muted">A carregar…</p>'; } catch(_) {}
  const { data, error } = await supabase.from('allowed_uploaders').select('email').order('email');
  if (error) { adminAllowListEl.innerHTML = '<p class="text-muted">Erro a carregar allowlist.</p>'; return; }
  const list = Array.isArray(data) ? data : [];
  if (!list.length) { adminAllowListEl.innerHTML = '<p class="text-muted">Sem emails.</p>'; return; }
  adminAllowListEl.innerHTML = list.map(e => `
    <div class="track-item">
      <div class="track-cover">✉️</div>
      <div class="track-info"><div class="track-title">${e.email}</div></div>
      <div class="track-actions"><button class="action-btn" data-allow-del="${e.email}">🗑️</button></div>
    </div>
  `).join('');
  adminAllowListEl.querySelectorAll('[data-allow-del]').forEach(btn => btn.addEventListener('click', async () => {
    const email = btn.getAttribute('data-allow-del');
    const ok = confirm(`Remover ${email} da allowlist?`);
    if (!ok) return;
    await supabase.from('allowed_uploaders').delete().eq('email', email);
    loadAdminAllowlist();
  }));
}

async function handleAdminAllowAdd(){
  if (!supabase || !adminAllowEmailEl) return;
  const email = (adminAllowEmailEl.value || '').trim();
  if (!email) return;
  try { if (adminAllowStatusEl) adminAllowStatusEl.textContent = 'A adicionar…'; } catch(_) {}
  const { error } = await supabase.from('allowed_uploaders').insert({ email });
  if (error) { if (adminAllowStatusEl) adminAllowStatusEl.textContent = 'Erro ao adicionar.'; return; }
  if (adminAllowStatusEl) adminAllowStatusEl.textContent = '✔️ Adicionado';
  try { adminAllowEmailEl.value = ''; } catch(_) {}
  await loadAdminAllowlist();
}
