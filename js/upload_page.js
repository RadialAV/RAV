import { getSupabaseClient } from './supabase.js';

function qs(id) { return document.getElementById(id); }
function val(id) { const el = qs(id); return el ? el.value : ''; }
function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s_]+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '')
    .replace(/\-+/g, '-').replace(/^-|-$|\.$/g, '')
    .toLowerCase() || 'release';
}
function fileExt(name) {
  try { const m = String(name || '').match(/\.([a-zA-Z0-9]+)$/); return m ? m[1].toLowerCase() : ''; } catch(_) { return ''; }
}
function baseName(name) {
  try { return String(name || '').replace(/\\/g,'/').split('/').pop().replace(/\.[^/.]+$/, ''); } catch(_) { return 'track'; }
}
function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

const guardLoading = qs('guard-loading');
const guardDenied = qs('guard-denied');
const uploadSection = qs('upload-section');
const tracksContainer = qs('tracks-container');
const addTrackBtn = qs('add-track-btn');
const form = qs('upload-form');
const statusEl = qs('upload-status');

let supabase = null;
let currentUser = null;

async function checkAllowlist(user) {
  try {
    if (!user || !user.email) return false;
    const { data, error } = await supabase
      .from('allowed_uploaders')
      .select('email')
      .eq('email', user.email)
      .maybeSingle();
    if (error) { console.warn('allowlist check error:', error); }
    return !!(data && data.email);
  } catch (e) {
    console.warn('allowlist exception:', e);
    return false;
  }
}

function setGuard(state, userEmail = '') {
  // CSS define .section { display:none }, por isso precisamos forçar 'block' quando visível
  try { if (guardLoading) guardLoading.style.display = (state === 'loading') ? 'block' : 'none'; } catch(_) {}
  try { if (guardDenied) guardDenied.style.display = (state === 'denied') ? 'block' : 'none'; } catch(_) {}
  try { if (uploadSection) uploadSection.style.display = (state === 'ok') ? 'block' : 'none'; } catch(_) {}
  const nameEl = qs('auth-username');
  if (nameEl) {
    nameEl.style.display = userEmail ? '' : 'none';
    nameEl.textContent = userEmail || '';
  }
}

async function ensureArtistId(artistName) {
  const name = String(artistName || '').trim();
  if (!name) return null;
  // 1) tentar selecionar
  let sel = await supabase.from('artists').select('id').eq('name', name).maybeSingle();
  if (sel && sel.data && sel.data.id) return sel.data.id;
  // 2) inserir
  const ins = await supabase.from('artists').insert({ name }).select('id').maybeSingle();
  if (ins && ins.data && ins.data.id) return ins.data.id;
  // 3) fallback: tentar upsert
  const up = await supabase.from('artists').upsert({ name }, { onConflict: 'name' }).select('id').maybeSingle();
  return up && up.data ? up.data.id : null;
}

function makeTrackRow(idx) {
  const wrap = document.createElement('div');
  wrap.className = 'track-row';
  wrap.style = 'display:grid;grid-template-columns:1fr 100px 1fr auto;gap:0.5rem;align-items:end;margin:0.5rem 0;';
  wrap.innerHTML = `
    <div class="form-group" style="margin:0;">
      <label class="form-label">Título</label>
      <input class="form-input track-title" type="text" placeholder="Ex: Simbaye">
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label">#</label>
      <input class="form-input track-number" type="number" min="1" placeholder="1">
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
  `;
  const removeBtn = wrap.querySelector('.remove-track');
  removeBtn.addEventListener('click', () => {
    wrap.remove();
  });
  return wrap;
}

function collectTracks() {
  const rows = Array.from(tracksContainer.querySelectorAll('.track-row'));
  const list = rows.map((row, i) => {
    const title = row.querySelector('.track-title')?.value || '';
    const numStr = row.querySelector('.track-number')?.value || '';
    const priceStr = row.querySelector('.track-price')?.value || '';
    const file = row.querySelector('.track-file')?.files?.[0] || null;
    const order = num(numStr) ?? (i + 1);
    return { title, order, price: num(priceStr), file };
  }).filter(t => !!t.file);
  // ordenar por order
  list.sort((a,b) => (a.order||0) - (b.order||0));
  return list;
}

async function uploadFile(bucket, path, file) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function handleSubmit(e) {
  e.preventDefault();
  statusEl.textContent = '';
  const btn = qs('submit-upload');
  try { btn.disabled = true; } catch(_) {}

  try {
    const title = val('release-title').trim();
    const artist = val('release-artist').trim();
    const year = num(val('release-year'));
    const releasePrice = num(val('release-price'));
    const description = val('release-description').trim() || null;
    const coverFile = qs('release-cover')?.files?.[0] || null;

    if (!title || !artist) { statusEl.textContent = 'Título e Artista são obrigatórios.'; btn.disabled = false; return; }

    const tracks = collectTracks();
    if (tracks.length === 0) { statusEl.textContent = 'Adiciona pelo menos uma faixa com ficheiro de áudio.'; btn.disabled = false; return; }

    statusEl.textContent = 'A preparar…';
    const folder = slugify(title) + '-' + Date.now();

    // Upload cover (opcional)
    let coverUrl = null;
    if (coverFile) {
      statusEl.textContent = 'A carregar capa…';
      const ext = fileExt(coverFile.name) || 'jpg';
      const coverPath = `${folder}/cover_${Date.now()}.${ext}`;
      coverUrl = await uploadFile('covers', coverPath, coverFile);
    }

    // Garantir artista
    statusEl.textContent = 'A registar artista…';
    const artist_id = await ensureArtistId(artist);

    // Criar release
    statusEl.textContent = 'A criar release…';
    const relInsert = await supabase
      .from('releases')
      .insert({
        title,
        subtitle: null,
        year,
        cover_url: coverUrl,
        total_duration: null,
        description,
        genres: [],
        credits: {},
        featured: false,
        coming_soon: false,
        release_price: releasePrice
      })
      .select('id')
      .maybeSingle();
    if (!relInsert || !relInsert.data || !relInsert.data.id) throw new Error('Falha a criar release');
    const release_id = relInsert.data.id;

    // Upload e inserir faixas
    const trackRows = [];
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      statusEl.textContent = `A carregar faixa ${i+1}/${tracks.length}…`;
      const base = slugify(t.title || baseName(t.file?.name || 'track'));
      const ext = fileExt(t.file?.name) || 'mp3';
      const audioPath = `${folder}/${String(t.order || (i+1)).padStart(2,'0')}-${base}-${Date.now()}.${ext}`;
      const audioUrl = await uploadFile('audio', audioPath, t.file);
      trackRows.push({
        title: t.title || baseName(t.file?.name || 'Track'),
        artist,
        artist_id,
        release_id,
        url: audioUrl,
        cover_url: coverUrl,
        duration: null,
        bpm: null,
        key: null,
        genre_tags: [],
        price: t.price
      });
    }

    statusEl.textContent = 'A registar faixas…';
    const insTracks = await supabase.from('tracks').insert(trackRows);
    if (insTracks.error) throw insTracks.error;

    statusEl.textContent = `✅ Upload concluído: 1 release, ${trackRows.length} faixas.`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Erro: ${err.message || err}`;
  } finally {
    try { btn.disabled = false; } catch(_) {}
  }
}

async function init() {
  supabase = await getSupabaseClient();
  if (!supabase) { setGuard('denied'); return; }

  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session && session.user ? session.user : null;

  if (!currentUser) {
    setGuard('loading');
  } else {
    const allowed = await checkAllowlist(currentUser);
    setGuard(allowed ? 'ok' : 'denied', currentUser.email || '');
  }

  try {
    supabase.auth.onAuthStateChange(async (_evt, sess) => {
      currentUser = sess && sess.user ? sess.user : null;
      if (!currentUser) { setGuard('loading'); return; }
      const allowed = await checkAllowlist(currentUser);
      setGuard(allowed ? 'ok' : 'denied', currentUser.email || '');
    });
  } catch(_) {}

  // UI: adicionar primeira linha de faixa
  if (addTrackBtn) {
    addTrackBtn.addEventListener('click', () => {
      tracksContainer.appendChild(makeTrackRow(tracksContainer.children.length));
    });
    // pelo menos uma linha inicial
    tracksContainer.appendChild(makeTrackRow(0));
  }

  if (form) form.addEventListener('submit', handleSubmit);
}

init();
