import { getSupabaseClient } from '../supabase.js';

function toSeconds(s) {
  if (!s) return null;
  if (typeof s === 'number' && isFinite(s)) return Math.max(0, Math.floor(s));
  const parts = String(s).split(':').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function uniq(arr) { return Array.from(new Set(arr)); }

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch failed: ' + url);
  return await r.json();
}

async function ensureArtists(supabase, names) {
  const list = uniq(names.filter(Boolean).map(s => s.trim()).filter(Boolean)).map(name => ({ name }));
  if (list.length === 0) return new Map();
  const { error: upErr } = await supabase.from('artists').upsert(list, { onConflict: 'name' });
  if (upErr) throw upErr;
  const { data, error } = await supabase.from('artists').select('id,name').in('name', list.map(x => x.name));
  if (error) throw error;
  const map = new Map();
  (data || []).forEach(row => map.set(String(row.name).toLowerCase(), row.id));
  return map;
}

async function ensureReleases(supabase, releasesJson) {
  const titles = releasesJson.map(r => r.title).filter(Boolean);
  const { data: existing, error: errSel } = await supabase.from('releases').select('id,title');
  if (errSel) throw errSel;
  const byTitle = new Map();
  (existing || []).forEach(r => byTitle.set(String(r.title), r.id));
  const toInsert = [];
  releasesJson.forEach(r => {
    if (!byTitle.has(String(r.title))) {
      toInsert.push({
        title: r.title,
        subtitle: r.subtitle || null,
        year: r.year ? parseInt(String(r.year), 10) || null : null,
        cover_url: r.coverUrl || null,
        total_duration: toSeconds(r.totalDuration),
        description: r.description || null,
        genres: Array.isArray(r.genres) ? r.genres : [],
        credits: r.credits || {},
        featured: !!r.featured,
        coming_soon: !!r.comingSoon
      });
    }
  });
  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await supabase.from('releases').insert(toInsert).select('id,title');
    if (insErr) throw insErr;
    (inserted || []).forEach(r => byTitle.set(String(r.title), r.id));
  }
  return byTitle;
}

function buildReleaseTrackMap(releasesJson, releasesByTitle) {
  const m = new Map();
  releasesJson.forEach(r => {
    const rid = releasesByTitle.get(String(r.title));
    if (!rid) return;
    const ids = Array.isArray(r.trackIds) ? r.trackIds : [];
    ids.forEach(tid => m.set(Number(tid), rid));
  });
  return m;
}

function buildTracksRows(tracksJson, artistMap, relTrackMap) {
  return tracksJson.map(t => ({
    title: t.title || 'Track',
    artist: t.artist || 'Unknown',
    artist_id: artistMap.get(String(t.artist || '').toLowerCase()) || null,
    release_id: relTrackMap.get(Number(t.id)) || null,
    url: t.url,
    cover_url: t.coverUrl || null,
    duration: toSeconds(t.duration),
    bpm: null,
    key: null,
    genre_tags: []
  }));
}

function buildVideosRows(videosJson) {
  return videosJson.map(v => ({
    title: v.title || 'Video',
    youtube_url: v.url,
    thumb_url: v.thumbnail || null,
    duration: v.duration || null,
    views: isNaN(parseInt(String(v.views), 10)) ? null : parseInt(String(v.views), 10)
  }));
}

// ---------- Worker-based helpers ----------
function resolveApiBase() {
  const devDefault = (typeof location !== 'undefined' && location.origin.startsWith('file:')) ? 'http://127.0.0.1:8787' : '';
  return (typeof window !== 'undefined' && window.R2_API_URL) ? window.R2_API_URL : devDefault;
}

function makeAbs(u, apiBase) {
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `${apiBase}${u}`;
}

function extractKey(u) {
  try {
    if (!u) return '';
    if (u.startsWith('/api/file/')) return decodeURIComponent(u.slice(10));
    const uu = new URL(u);
    const i = uu.pathname.indexOf('/api/file/');
    if (i >= 0) return decodeURIComponent(uu.pathname.slice(i + 10));
  } catch (_) {}
  return '';
}

function folderPathOfKey(key) {
  if (!key) return '';
  const idx = key.lastIndexOf('/');
  return idx >= 0 ? key.slice(0, idx) : '';
}

function baseNameOfKey(key) {
  if (!key) return '';
  const parts = key.split('/');
  const file = parts[parts.length - 1] || '';
  return file.replace(/\.[^/.]+$/, '');
}

function parseArtistTitleFromBase(name) {
  if (typeof name !== 'string') return { artist: 'Unknown', title: String(name || 'Track') };
  let n = name;
  n = n.replace(/^[0-9]+(?:[ _-]+)/, '');
  n = n.replace(/_/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  const parts = n.split(/\s*-\s*/);
  if (parts.length >= 2) {
    const artist = parts.shift().trim();
    const title = parts.join(' - ').trim();
    if (artist && title) return { artist, title };
  }
  return { artist: 'Unknown', title: n };
}

async function ensureReleasesFromTitles(supabase, rels) {
  // rels: [{ title, cover_url }]
  const titles = Array.from(new Set(rels.map(r => r.title).filter(Boolean)));
  const { data: existing, error: errSel } = await supabase.from('releases').select('id,title');
  if (errSel) throw errSel;
  const byTitle = new Map();
  (existing || []).forEach(r => byTitle.set(String(r.title), r.id));
  const toInsert = [];
  rels.forEach(r => {
    if (!byTitle.has(String(r.title))) {
      toInsert.push({
        title: r.title,
        cover_url: r.cover_url || null,
        subtitle: null,
        year: null,
        total_duration: null,
        description: null,
        genres: [],
        credits: {},
        featured: false,
        coming_soon: false
      });
    }
  });
  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await supabase.from('releases').insert(toInsert).select('id,title');
    if (insErr) throw insErr;
    (inserted || []).forEach(r => byTitle.set(String(r.title), r.id));
  }
  return byTitle;
}

export async function run(opts = {}) {
  const dryRun = !!opts.dryRun;
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not available');

  // Path A: importar do Worker (/api/tracks)
  if (opts.useWorker) {
    const apiBase = opts.apiBase || resolveApiBase();
    if (!apiBase) throw new Error('R2 API base not set. Define window.R2_API_URL or pass opts.apiBase');

    // Ler lista de faixas do Worker
    const r = await fetch(`${apiBase}/api/tracks`);
    if (!r.ok) throw new Error('Falha a ler /api/tracks do Worker');
    const j = await r.json();
    const arr = Array.isArray(j) ? j : (j && Array.isArray(j.tracks) ? j.tracks : []);
    if (!arr || arr.length === 0) throw new Error('Worker /api/tracks devolveu vazio');

    // Normalizar e inferir títulos/artistas a partir do nome do ficheiro quando necessário
    const normalized = arr.map(item => {
      const absUrl = makeAbs(item.url || '', apiBase);
      const absCover = item.coverUrl ? makeAbs(item.coverUrl, apiBase) : null;
      const key = extractKey(absUrl);
      const base = baseNameOfKey(key);
      const parsed = parseArtistTitleFromBase(base);
      const artist = (item.artist && String(item.artist).trim()) || parsed.artist || 'Unknown';
      const title = (item.title && String(item.title).trim()) || parsed.title || 'Track';
      const folderPath = folderPathOfKey(key);
      const folderTitle = folderPath ? folderPath.split('/').pop() : '';
      return { title, artist, url: absUrl, cover_url: absCover, folderTitle };
    });

    const artistNames = normalized.map(t => t.artist).filter(Boolean);
    const artistsMap = dryRun ? new Map() : await ensureArtists(supabase, artistNames);

    // Preparar releases minimal a partir das pastas
    const relByTitle = new Map();
    normalized.forEach(t => {
      if (!t.folderTitle) return;
      if (!relByTitle.has(t.folderTitle)) {
        relByTitle.set(t.folderTitle, { title: t.folderTitle, cover_url: t.cover_url || null });
      } else {
        const cur = relByTitle.get(t.folderTitle);
        if (!cur.cover_url && t.cover_url) cur.cover_url = t.cover_url;
      }
    });
    const relArr = Array.from(relByTitle.values());
    const releasesByTitle = dryRun ? new Map() : await ensureReleasesFromTitles(supabase, relArr);

    // Construir rows de tracks com release_id
    const trackRows = normalized.map(t => ({
      title: t.title,
      artist: t.artist,
      artist_id: artistsMap.get(String(t.artist).toLowerCase()) || null,
      release_id: t.folderTitle ? (releasesByTitle.get(t.folderTitle) || null) : null,
      url: t.url,
      cover_url: t.cover_url || null,
      duration: null,
      bpm: null,
      key: null,
      genre_tags: []
    }));

    // Videos continuam a partir do JSON
    const videosJson = await fetchJson('data/videos.json').catch(() => []);
    const videoRows = buildVideosRows(videosJson);

    if (dryRun) {
      return { artists: uniq(artistNames).length, releases: relArr.length, tracks: trackRows.length, videos: videoRows.length };
    }

    if (trackRows.length > 0) {
      const { error: trErr } = await supabase.from('tracks').upsert(trackRows, { onConflict: 'url' });
      if (trErr) throw trErr;
    }
    if (videoRows.length > 0) {
      const { error: vErr } = await supabase.from('videos').upsert(videoRows, { onConflict: 'youtube_url' });
      if (vErr) throw vErr;
    }
    return { ok: true, inserted: { tracks: trackRows.length, videos: videoRows.length } };
  }

  // Path B: importar dos JSONs locais (com releases.json)
  const [tracksJson, releasesJson, videosJson] = await Promise.all([
    fetchJson('data/tracks.json'),
    fetchJson('data/releases.json').catch(() => []),
    fetchJson('data/videos.json')
  ]);

  const artistNames = tracksJson.map(t => t.artist || '').filter(Boolean);
  const artistsMap = dryRun ? new Map() : await ensureArtists(supabase, artistNames);
  const releasesByTitle = dryRun ? new Map() : await ensureReleases(supabase, Array.isArray(releasesJson) ? releasesJson : []);
  const relTrackMap = buildReleaseTrackMap(Array.isArray(releasesJson) ? releasesJson : [], releasesByTitle);

  const trackRows = buildTracksRows(tracksJson, artistsMap, relTrackMap);
  const videoRows = buildVideosRows(videosJson);

  if (dryRun) {
    return { artists: uniq(artistNames).length, releases: (Array.isArray(releasesJson) ? releasesJson.length : 0), tracks: trackRows.length, videos: videoRows.length };
  }

  if (trackRows.length > 0) {
    const { error: trErr } = await supabase.from('tracks').upsert(trackRows, { onConflict: 'url' });
    if (trErr) throw trErr;
  }
  if (videoRows.length > 0) {
    const { error: vErr } = await supabase.from('videos').upsert(videoRows, { onConflict: 'youtube_url' });
    if (vErr) throw vErr;
  }

  return { ok: true, inserted: { tracks: trackRows.length, videos: videoRows.length } };
}

if (typeof window !== 'undefined') {
  window.RadialMigrate = { run };
}
