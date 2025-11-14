// Cloudflare Worker for Radial AV R2 API
// Endpoints:
//  - GET /api/tracks?prefix=&limit=&cursor=
//  - GET /api/file/:key (supports Range)

const AUDIO_EXT = ["mp3", "m4a", "wav", "flac", "ogg", "aiff", "aif"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      return json({ error: "Internal Error", details: String(err) }, 500);
    }
  }
}

function withCORS(headers = new Headers(), origin) {
  const h = new Headers(headers);
  // For testing we allow all. In production, restrict to your app domain.
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type,Range");
  h.set("Access-Control-Expose-Headers", "Accept-Ranges,Content-Length,Content-Range,Content-Type");
  return h;
}

function json(body, status = 200) {
  const h = withCORS(new Headers({ "Content-Type": "application/json; charset=utf-8" }));
  return new Response(JSON.stringify(body), { status, headers: h });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCORS() });
  }

  if (url.pathname.startsWith("/api/tracks")) {
    if (!env.R2) return json({ error: "R2 binding not configured" }, 500);
    return await handleListTracks(request, env);
  }

  if (url.pathname.startsWith("/api/file/")) {
    if (!env.R2) return new Response("R2 binding not configured", { status: 500 });
    const key = decodeURIComponent(url.pathname.replace("/api/file/", ""));
    return await handleGetFile(request, env, key);
  }

  if (url.pathname === "/api/chat-config") {
    const urlCfg = env.SUPABASE_URL || env.SUPABASE_PROJECT_URL || null;
    const anon = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLIC_ANON_KEY || null;
    if (!urlCfg || !anon) {
      return json({ error: "Missing Supabase config in Worker env", url: urlCfg || null, anonKey: anon || null }, 200);
    }
    return json({ url: urlCfg, anonKey: anon });
  }

  return json({ ok: true, message: "Radial R2 API" });
}

function getExt(key) {
  const i = key.lastIndexOf(".");
  return i >= 0 ? key.slice(i + 1).toLowerCase() : "";
}

function removeExt(key) {
  const i = key.lastIndexOf(".");
  return i >= 0 ? key.slice(0, i) : key;
}

function filenameFromKey(key) {
  const parts = key.split("/");
  return parts[parts.length - 1];
}

function parseArtistTitle(basename) {
  // Heurística: "Artist - Title" | "artist_title" | fallback
  const name = basename.replace(/[_]+/g, " ").trim();
  if (name.includes(" - ")) {
    const [artist, title] = name.split(" - ", 2).map(s => s.trim());
    return { artist, title };
  }
  return { artist: "Unknown", title: name };
}

async function handleListTracks(request, env) {
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000", 10), 1000);
  const cursor = url.searchParams.get("cursor") || undefined;

  const list = await env.R2.list({ prefix, limit, cursor });
  const byDir = new Map(); // dir -> { audios: [], cover: null }
  const imageByBase = new Map(); // full base path (without ext) -> image key

  for (const obj of list.objects) {
    const key = obj.key;
    const ext = getExt(key);
    const lastSlash = key.lastIndexOf('/');
    if (lastSlash < 0) continue; // ignorar ficheiros na raiz sem pasta
    const dir = key.slice(0, lastSlash); // diretório completo
    if (!byDir.has(dir)) byDir.set(dir, { audios: [], cover: null });
    const rec = byDir.get(dir);
    if (AUDIO_EXT.includes(ext)) {
      rec.audios.push(key);
    } else if (IMAGE_EXT.includes(ext)) {
      // Preferir nomes sugestivos como cover/art/front
      if (!rec.cover || /cover|art|front/i.test(key)) rec.cover = key;
      // Mapear também por base completo para matching direto por faixa
      imageByBase.set(removeExt(key), key);
    }
  }

  const tracks = [];
  for (const [dir, rec] of byDir.entries()) {
    const dirParts = dir.split('/');
    const dirName = dirParts[dirParts.length - 1] || 'Unknown';
    for (const audioKey of rec.audios) {
      const baseNoExt = removeExt(audioKey);
      const fileNameNoExt = filenameFromKey(baseNoExt);
      const { artist, title } = parseArtistTitle(fileNameNoExt);
      const urlFile = `/api/file/${encodeURIComponent(audioKey)}`;
      const matchImage = imageByBase.get(baseNoExt);
      const coverKey = matchImage || rec.cover;
      const coverUrl = coverKey ? `/api/file/${encodeURIComponent(coverKey)}` : null;

      tracks.push({
        id: baseNoExt,
        title,
        artist: artist && artist !== 'Unknown' ? artist : dirName,
        url: urlFile,
        coverUrl,
        cover: title ? title.charAt(0).toUpperCase() : '🎵',
        duration: ''
      });
    }
  }

  return json({
    tracks,
    meta: {
      count: tracks.length,
      truncated: list.truncated || false,
      cursor: list.cursor || null
    }
  });
}

function contentTypeFromExt(ext) {
  switch (ext) {
    case "mp3": return "audio/mpeg";
    case "m4a": return "audio/mp4";
    case "wav": return "audio/wav";
    case "flac": return "audio/flac";
    case "ogg": return "audio/ogg";
    case "aif":
    case "aiff": return "audio/aiff";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

async function handleGetFile(request, env, key) {
  const rangeHeader = request.headers.get("Range");
  let r2Range = undefined;
  let start = 0, end = undefined;

  if (rangeHeader) {
    // Format: bytes=start-end
    const m = /bytes=(\d+)-(\d+)?/.exec(rangeHeader);
    if (m) {
      start = parseInt(m[1], 10);
      if (m[2]) {
        end = parseInt(m[2], 10);
        if (end >= start) {
          r2Range = { offset: start, length: end - start + 1 };
        }
      } else {
        r2Range = { offset: start };
      }
    }
  }

  const obj = await env.R2.get(key, r2Range ? { range: r2Range } : undefined);
  if (!obj) {
    return new Response("Not found", { status: 404, headers: withCORS() });
  }

  const ext = getExt(key);
  const headers = withCORS(new Headers());
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", contentTypeFromExt(ext));

  if (obj.range) {
    const { offset, length } = obj.range;
    const totalSize = (typeof obj.size === 'number') ? obj.size : '*';
    const contentRange = `bytes ${offset}-${offset + length - 1}/${totalSize}`;
    headers.set("Content-Range", contentRange);
    headers.set("Content-Length", String(length));
    return new Response(obj.body, { status: 206, headers });
  } else {
    if (typeof obj.size === "number") headers.set("Content-Length", String(obj.size));
    return new Response(obj.body, { status: 200, headers });
  }
}
