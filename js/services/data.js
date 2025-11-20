// js/services/data.js
// Serviço de catálogo (tracks, releases, videos) via Supabase

import { getSupabaseClient } from '../supabase.js';

function secsToStr(v) {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  if (!isFinite(n)) return String(v || '');
  const s = Math.max(0, Math.floor(n));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

export async function fetchCatalogFromSupabase() {
  const supa = await getSupabaseClient();
  if (!supa) return null;
  const makeAbs = (u, audioUrl) => {
    try {
      if (!u) return '';
      const s = String(u);
      if (/^https?:\/\//i.test(s)) return s;
      let base = (typeof window !== 'undefined' && window.R2_API_URL) ? window.R2_API_URL : '';
      if (!base && audioUrl) {
        try { const o = new URL(audioUrl); base = o.origin; } catch (_) {}
      }
      if (!base) return s;
      if (s.startsWith('/')) return `${base}${s}`;
      return `${base}/${s}`;
    } catch(_) { return String(u || ''); }
  };
  const [trRes, relRes, vidRes] = await Promise.all([
    supa.from('tracks').select('id,title,artist,url,cover_url,duration,release_id').order('url', { ascending: true }),
    supa.from('releases').select('id,title,subtitle,year,cover_url,total_duration,description,genres,credits,featured,coming_soon,release_price,label_id,publish_at'),
    supa.from('videos').select('id,title,youtube_url,thumb_url,duration,views')
  ]);
  if (trRes.error) return null;

  const relMapById = new Map();
  let releases = [];
  const now = Date.now();
  if (!relRes.error && Array.isArray(relRes.data)) {
    releases = relRes.data.map(r => {
      const obj = {
        id: r.id,
        title: r.title || '',
        subtitle: r.subtitle || '',
        year: r.year ? String(r.year) : '',
        cover: 'R',
        coverUrl: r.cover_url ? makeAbs(r.cover_url) : null,
        totalDuration: secsToStr(r.total_duration),
        genres: Array.isArray(r.genres) ? r.genres : [],
        credits: r.credits || {},
        links: {},
        trackIds: [],
        featured: !!r.featured,
        // Fallback: se publish_at estiver no futuro, marcar como comingSoon
        comingSoon: (r.publish_at ? (new Date(r.publish_at).getTime() > now) : !!r.coming_soon),
        labelId: r.label_id || null,
        publishAt: r.publish_at || null,
        releasePrice: (typeof r.release_price === 'number' ? r.release_price : 5.00)
      };
      relMapById.set(r.id, obj);
      return obj;
    });

  }

  const sortedTracks = [...trRes.data].sort((a, b) => String(a.url).localeCompare(String(b.url)));
  const tracks = sortedTracks
    .filter((t) => {
      try {
        if (!t.release_id) return true;
        const rel = relMapById.get(t.release_id);
        if (!rel) return true;
        // Ocultar faixas de releases por publicar
        if (rel.publishAt) {
          return new Date(rel.publishAt).getTime() <= now;
        }
        return !rel.comingSoon;
      } catch (_) { return true; }
    })
    .map((t, idx) => {
      const localId = idx + 1;
      const title = (t.title || '').toString() || 'Track';
      const artist = (t.artist || 'Unknown').toString();
      const obj = {
        id: localId,
        dbId: t.id,
        title,
        artist,
        url: t.url,
        coverUrl: t.cover_url ? makeAbs(t.cover_url, t.url) : null,
        cover: (title && title.charAt(0)) ? title.charAt(0).toUpperCase() : '🎵',
        duration: secsToStr(t.duration),
        price: 1.00
      };
      if (t.release_id && relMapById.has(t.release_id)) {
        const rel = relMapById.get(t.release_id);
        if (rel && Array.isArray(rel.trackIds)) rel.trackIds.push(localId);
      }
      return obj;
    });

  // Ocultar releases por publicar e fallbacks de capas
  try {
    // Filtrar releases com publish_at no futuro
    releases = (releases || []).filter(r => {
      try {
        if (r.publishAt) return new Date(r.publishAt).getTime() <= now;
        return !r.comingSoon;
      } catch(_) { return true; }
    });
    // Mapear trackId local -> release
    const trackIdToRelease = new Map();
    for (const rel of releases) {
      if (rel && Array.isArray(rel.trackIds)) {
        for (const id of rel.trackIds) trackIdToRelease.set(id, rel);
      }
    }
    // Se release não tiver capa, usar a primeira capa de track disponível
    for (const rel of releases) {
      if (!rel || rel.coverUrl) continue;
      const firstWithCoverId = (rel.trackIds || []).find(id => {
        const t = tracks.find(x => x.id === id);
        return t && t.coverUrl;
      });
      if (firstWithCoverId) {
        const t = tracks.find(x => x.id === firstWithCoverId);
        if (t && t.coverUrl) rel.coverUrl = t.coverUrl;
      }
    }
    // Se track não tiver capa, herdar capa do release
    for (const t of tracks) {
      if (!t.coverUrl) {
        const rel = trackIdToRelease.get(t.id);
        if (rel && rel.coverUrl) t.coverUrl = rel.coverUrl;
      }
    }
  } catch (_) {}

  // Filtrar releases sem faixas e deduplicar por título
  try {
    // 1) Remover releases sem faixas associadas (evita placeholders como RAV2/rascunhos)
    releases = (releases || []).filter(r => Array.isArray(r.trackIds) && r.trackIds.length > 0);
    // 2) Deduplicar por título, mantendo o com mais faixas (e preferindo quem tem capa)
    const byTitle = new Map();
    for (const r of releases) {
      const key = String((r.title || '').trim().toLowerCase());
      const score = (Array.isArray(r.trackIds) ? r.trackIds.length : 0) + (r.coverUrl ? 0.5 : 0);
      if (!byTitle.has(key)) {
        byTitle.set(key, { r, score });
      } else {
        const prev = byTitle.get(key);
        if (score > prev.score) byTitle.set(key, { r, score });
      }
    }
    releases = Array.from(byTitle.values()).map(x => x.r);
  } catch (_) {}

  const videos = !vidRes.error && Array.isArray(vidRes.data) ? vidRes.data.map((v, i) => ({
    id: i + 1,
    title: v.title || '',
    duration: v.duration || '',
    views: typeof v.views === 'number' ? String(v.views) : (v.views || ''),
    thumbnail: v.thumb_url ? makeAbs(v.thumb_url) : '',
    url: v.youtube_url || ''
  })) : [];

  return { tracks, releases, videos };
}
