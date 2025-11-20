export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return corsResponse();
    }

function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) throw new Error('bad token');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '='));
  return JSON.parse(json);
}

// ============ Delete Release (R2 cleanup) ============
async function handleDeleteRelease(req, env) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return json({ error: 'missing token' }, 401);

    // Validate user via Supabase when configured; otherwise decode JWT payload as best-effort
    let userId = '';
    let email = '';
    if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
      const uRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY } });
      if (!uRes.ok) return json({ error: 'invalid token' }, 401);
      const user = await uRes.json();
      userId = user && (user.id || user.sub) ? String(user.id || user.sub) : '';
      email = user && user.email ? String(user.email) : '';
      if (!userId) return json({ error: 'invalid user' }, 401);
    } else {
      try {
        const payload = decodeJwt(token);
        userId = String(payload.sub || payload.user_id || payload.id || '');
        email = String(payload.email || '');
      } catch(_) {}
      if (!userId) return json({ error: 'invalid user' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const folderRaw = String(body.folder || '').trim();
    const releaseId = String(body.releaseId || '').trim();
    const ownerUserId = String(body.ownerUserId || '').trim();
    if (!folderRaw) return json({ error: 'missing folder' }, 400);
    const folder = sanitize(folderRaw);

    // Authorization: Owner (uploaded), Admin Master OR label member of the release
    let isAdminMaster = false;
    let isLabelMember = false;
    let isOwner = !!(ownerUserId && ownerUserId === userId);
    if (env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY)) {
      // Check admin_masters
      try {
        const resA = await fetch(`${env.SUPABASE_URL}/rest/v1/admin_masters?select=email&email=eq.${encodeURIComponent(email)}&limit=1`, {
          headers: { apikey: env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE || token}` }
        });
        if (resA.ok) { const arr = await resA.json(); isAdminMaster = Array.isArray(arr) && arr.length > 0; }
      } catch(_) {}
      // If releaseId provided, ensure membership of its label
      if (releaseId) {
        try {
          const relRes = await fetch(`${env.SUPABASE_URL}/rest/v1/releases?select=label_id&id=eq.${encodeURIComponent(releaseId)}&limit=1`, {
            headers: { apikey: env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE || token}` }
          });
          if (relRes.ok) {
            const rows = await relRes.json();
            const labelId = Array.isArray(rows) && rows.length ? rows[0].label_id : null;
            if (labelId) {
              const memRes = await fetch(`${env.SUPABASE_URL}/rest/v1/label_members?select=email&email=eq.${encodeURIComponent(email)}&label_id=eq.${encodeURIComponent(labelId)}&limit=1`, {
                headers: { apikey: env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE || token}` }
              });
              if (memRes.ok) { const arr = await memRes.json(); isLabelMember = Array.isArray(arr) && arr.length > 0; }
            }
          }
        } catch(_) {}
      }
    }
    // If ownerUserId is missing, detect ownership by checking if there are objects under `${userId}/${folder}/`
    const bucketForCheck = getBucket(env);
    if (!isOwner) {
      try {
        const testPrefix = `${userId}/${folder}/`;
        const testList = await bucketForCheck.list({ prefix: testPrefix, limit: 1 });
        if (testList && Array.isArray(testList.objects) && testList.objects.length > 0) isOwner = true;
      } catch(_) {}
    }
    if (!(isOwner || isAdminMaster || isLabelMember)) return json({ error: 'forbidden' }, 403);

    // helper to delete by prefix
    const bucket = getBucket(env);
    async function deleteByPrefix(pfx){
      let cur = undefined; let count = 0;
      do {
        const list = await bucket.list({ prefix: pfx, cursor: cur });
        cur = list.truncated ? list.cursor : undefined;
        const objects = Array.isArray(list.objects) ? list.objects : [];
        for (const obj of objects) { try { await bucket.delete(obj.key); count++; } catch(_) {} }
      } while (cur);
      return count;
    }

    let deleted = 0;
    const mainPrefix = `${ownerUserId || userId}/${folder}/`;
    deleted += await deleteByPrefix(mainPrefix);

    // Fallback: scan all top-level user prefixes if none deleted (legacy releases without storage_user_id)
    let scanned = [];
    if (deleted === 0) {
      let c2 = undefined;
      do {
        const l = await bucket.list({ prefix: '', delimiter: '/', cursor: c2 });
        c2 = l.truncated ? l.cursor : undefined;
        const prefixes = Array.isArray(l.delimitedPrefixes) ? l.delimitedPrefixes : [];
        for (const p of prefixes) {
          // p like 'userid/'
          const pfx = `${p}${folder}/`;
          scanned.push(pfx);
          deleted += await deleteByPrefix(pfx);
          if (deleted > 0) break;
        }
      } while (c2 && deleted === 0);
      // Legacy root-level prefix (no userId)
      if (deleted === 0) {
        const rootPfx = `${folder}/`;
        scanned.push(rootPfx);
        deleted += await deleteByPrefix(rootPfx);
      }
    }

    return json({ ok: true, deleted, prefix: mainPrefix, scanned });
  } catch (e) {
    return json({ error: 'delete error', details: String((e && e.message) || e) }, 500);
  }
}

    if (url.pathname === '/upload' && req.method === 'POST') {
      return handleUpload(req, env);
    }
    if (url.pathname === '/delete-release' && req.method === 'POST') {
      return handleDeleteRelease(req, env);
    }

    if (url.pathname === '/checkout/create-session' && req.method === 'POST') {
      return handleCreateCheckoutSession(req, env);
    }

    if (url.pathname === '/webhooks/stripe' && req.method === 'POST') {
      return handleStripeWebhook(req, env);
    }

    // Fallback routes in case success/cancel point to the Worker
    if (url.pathname === '/checkout-success') {
      return redirectToReturnBase(req, env, 'success');
    }
    if (url.pathname === '/checkout-cancel') {
      return redirectToReturnBase(req, env, 'cancel');
    }

    // Temporary diagnostics endpoint (no secrets leaked)
    if (url.pathname === '/diag/stripe-config' && (req.method === 'GET' || req.method === 'HEAD')) {
      return handleStripeDiag(env);
    }

    if (url.pathname.startsWith('/api/file/')) {
      const key = decodeURIComponent(url.pathname.replace('/api/file/', ''));
      return handleGetFile(env, key, req);
    }

    return json({ error: 'Not found' }, 404);
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'authorization, content-type, range',
    'Access-Control-Expose-Headers': 'accept-ranges, content-length, content-range',
    'Access-Control-Max-Age': '86400'
  };
}

function getBucket(env) {
  return env.R2_BUCKET || env.R2;
}

function corsResponse(status = 204) {
  return new Response(null, { status, headers: corsHeaders() });
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

async function handleGetFile(env, key, req) {
  try {
    if (!key) return json({ error: 'missing key' }, 400);
    const rangeHeader = (req.headers.get('range') || '').toLowerCase();
    const wantsRange = /^bytes=/.test(rangeHeader);
    const bucket = getBucket(env);
    const head = await bucket.head(key);
    if (!head) return json({ error: 'not found' }, 404);
    const size = head.size ?? undefined;
    const ct = head.httpMetadata && head.httpMetadata.contentType ? head.httpMetadata.contentType : undefined;

    if (wantsRange && typeof size === 'number') {
      const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
      let start = 0;
      let end = size - 1;
      if (m) {
        start = parseInt(m[1], 10);
        if (m[2] && m[2].length > 0) end = Math.min(size - 1, parseInt(m[2], 10));
      }
      if (isNaN(start) || start < 0 || start >= size) {
        return new Response(null, { status: 416, headers: { ...corsHeaders(), 'content-range': `bytes */${size}` } });
      }
      const length = (end - start) + 1;
      const ranged = await bucket.get(key, { range: { offset: start, length } });
      if (!ranged) return json({ error: 'not found' }, 404);
      const headers = new Headers({
        ...corsHeaders(),
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': String(length),
        'cache-control': 'public, max-age=31536000, immutable'
      });
      if (ct) headers.set('content-type', ct);
      return new Response(ranged.body, { status: 206, headers });
    }

    const obj = await bucket.get(key);
    if (!obj) return json({ error: 'not found' }, 404);
    const headers = new Headers({
      ...corsHeaders(),
      'accept-ranges': 'bytes',
      'cache-control': 'public, max-age=31536000, immutable'
    });
    if (obj.httpMetadata && obj.httpMetadata.contentType) {
      headers.set('content-type', obj.httpMetadata.contentType);
    }
    if (typeof obj.size === 'number') headers.set('content-length', String(obj.size));
    return new Response(obj.body, { status: 200, headers });
  } catch (e) {
    return json({ error: 'read error', details: String(e && e.message || e) }, 500);
  }
}

async function handleUpload(req, env) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return json({ error: 'missing token' }, 401);

    // 1) Validar JWT via Supabase Auth endpoint (sem dependências JOSE)
    const uRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_ANON_KEY
      }
    });
    if (!uRes.ok) return json({ error: 'invalid token' }, 401);
    const user = await uRes.json();
    const email = user && user.email ? String(user.email) : '';
    const userId = user && (user.id || user.sub) ? String(user.id || user.sub) : '';
    if (!email || !userId) return json({ error: 'invalid user' }, 401);

    // 2) Autorizar por allowlist
    let allowed = false;
    const aRes = await fetch(`${env.SUPABASE_URL}/rest/v1/allowed_uploaders?select=email&email=eq.${encodeURIComponent(email)}&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE || token}`
      }
    });
    if (aRes.ok) {
      const arr = await aRes.json();
      allowed = Array.isArray(arr) && arr.length > 0;
    }
    if (!allowed) return json({ error: 'forbidden' }, 403);

    // 3) Ler FormData
    const form = await req.formData();
    const file = form.get('file');
    const folder = sanitize(String(form.get('folder') || 'uploads'));
    const type = String(form.get('type') || 'audio');
    const order = String(form.get('order') || '');
    const base = sanitize(String(form.get('base') || '')); // base name sem extensão
    const contentType = String(form.get('contentType') || (file && file.type) || 'application/octet-stream');

    if (!(file instanceof Blob)) return json({ error: 'missing file' }, 400);

    const now = Date.now();
    const nameFromFile = file && typeof file.name === 'string' ? file.name : 'file.bin';
    const ext = getExt(nameFromFile) || (type === 'cover' ? 'jpg' : 'mp3');
    const safeName = (order ? `${order.padStart(2,'0')}-` : '') + (base || stripExt(nameFromFile));
    const fileName = `${safeName}-${now}.${ext}`;

    const key = `${userId}/${folder}/${type}/${fileName}`;

    const bucket = getBucket(env);
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType },
      customMetadata: { uploader: email, type, folder }
    });

    const baseUrl = env.PUBLIC_BASE_URL || new URL(req.url).origin;
    const publicUrl = `${baseUrl}/api/file/${encodeURIComponent(key)}`;

    // Opcional: calcular duração no Worker (não implementado aqui)
    const duration = null;

    return json({ publicUrl, duration });
  } catch (e) {
    return json({ error: 'upload error', details: String(e && e.message || e) }, 500);
  }
}

function sanitize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\-_/]/g, '-').replace(/-{2,}/g, '-').replace(/\/+/, '/').replace(/^\/+|\/+$/g, '');
}
function getExt(name) {
  const m = String(name || '').match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}
function stripExt(name) {
  return String(name || '').replace(/\.[^/.]+$/, '');
}

// ============ Stripe Checkout ============
async function handleCreateCheckoutSession(req, env) {
  try {
    const stripeKey = env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY || env.STRIPE_SECRET;
    if (!stripeKey) return json({ error: 'stripe not configured' }, 500);
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return json({ error: 'missing token' }, 401);

    // Validate Supabase user
    const uRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY }
    });
    if (!uRes.ok) return json({ error: 'invalid token' }, 401);
    const user = await uRes.json();
    const userId = user && (user.id || user.sub) ? String(user.id || user.sub) : '';
    const email = user && user.email ? String(user.email) : '';
    if (!userId) return json({ error: 'invalid user' }, 401);

    // Parse body
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.trackDbIds) ? body.trackDbIds : [];
    if (!ids.length) return json({ error: 'empty cart' }, 400);

    const { totalCents, itemCount } = await computeTotalCents(env, ids);
    if (!totalCents || totalCents < 50) return json({ error: 'bad total' }, 400);

    const origin = env.CHECKOUT_RETURN_BASE || env.PUBLIC_BASE_URL || new URL(req.url).origin;
    const successUrl = `${origin}/?checkout=success`;
    const cancelUrl = `${origin}/?checkout=cancel`;

    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);
    params.set('payment_method_types[0]', 'card');
    params.set('client_reference_id', userId);
    if (email) params.set('customer_email', email);
    params.set('line_items[0][price_data][currency]', 'eur');
    params.set('line_items[0][price_data][unit_amount]', String(totalCents));
    params.set('line_items[0][price_data][product_data][name]', `Radial AV • ${itemCount} tracks`);
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[track_db_ids]', JSON.stringify(ids));

    const sRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${stripeKey}`,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    if (!sRes.ok) {
      const errTxt = await sRes.text().catch(() => '');
      return json({ error: 'stripe error', details: errTxt }, 500);
    }
    const session = await sRes.json();
    return json({ url: session.url });
  } catch (e) {
    return json({ error: 'checkout error', details: String((e && e.message) || e) }, 500);
  }
}

async function computeTotalCents(env, ids) {
  const pricePerTrackCents = Number(env.PRICE_PER_TRACK_CENTS || 100);
  const releasePriceCents = Number(env.RELEASE_PRICE_CENTS || 500);
  // Fetch selected tracks (id,title,release_id)
  const orFilter = ids.map((id) => `id.eq.${encodeURIComponent(id)}`).join(',');
  const trUrl = `${env.SUPABASE_URL}/rest/v1/tracks?select=id,release_id&or=(${orFilter})`;
  const trRes = await fetch(trUrl, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY}` } });
  if (!trRes.ok) throw new Error('failed to fetch tracks');
  const selected = await trRes.json();
  const itemCount = Array.isArray(selected) ? selected.length : 0;
  if (!itemCount) return { totalCents: 0, itemCount: 0 };

  // Group selected by release
  const byRelease = new Map();
  const releaseIds = new Set();
  for (const t of selected) {
    const rid = t && t.release_id ? String(t.release_id) : 'none';
    if (!byRelease.has(rid)) byRelease.set(rid, 0);
    byRelease.set(rid, byRelease.get(rid) + 1);
    if (rid !== 'none') releaseIds.add(rid);
  }

  // Fetch total tracks for those releases
  const totalByRelease = new Map();
  if (releaseIds.size > 0) {
    const orR = Array.from(releaseIds).map((rid) => `release_id.eq.${encodeURIComponent(rid)}`).join(',');
    const allTrUrl = `${env.SUPABASE_URL}/rest/v1/tracks?select=id,release_id&or=(${orR})`;
    const allRes = await fetch(allTrUrl, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY}` } });
    if (allRes.ok) {
      const all = await allRes.json();
      for (const rid of releaseIds) {
        const count = all.filter((x) => String(x.release_id) === String(rid)).length;
        totalByRelease.set(String(rid), count);
      }
    }
  }

  // Compute price with bundle rule
  let totalCents = 0;
  for (const [rid, selCount] of byRelease.entries()) {
    if (rid !== 'none' && totalByRelease.has(rid)) {
      const allCount = totalByRelease.get(rid) || 0;
      if (allCount > 0 && selCount === allCount) {
        totalCents += Math.min(selCount * pricePerTrackCents, releasePriceCents);
        continue;
      }
    }
    totalCents += selCount * pricePerTrackCents;
  }
  totalCents = Math.max(50, Math.floor(totalCents));
  return { totalCents, itemCount };
}

async function handleStripeWebhook(req, env) {
  try {
    if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'webhook not configured' }, 500);
    const sig = req.headers.get('stripe-signature') || req.headers.get('Stripe-Signature') || '';
    const raw = await req.text();
    const ok = await verifyStripeSignature(raw, sig, env.STRIPE_WEBHOOK_SECRET);
    if (!ok) return json({ error: 'invalid signature' }, 400);
    const event = JSON.parse(raw || '{}');
    if (event && event.type === 'checkout.session.completed') {
      const session = event.data && event.data.object ? event.data.object : {};
      const userId = session.client_reference_id || '';
      const meta = session.metadata || {};
      let trackDbIds = [];
      try { if (typeof meta.track_db_ids === 'string') trackDbIds = JSON.parse(meta.track_db_ids); } catch(_) {}
      // Optional: record purchases (if table exists and credentials available)
      try {
        if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE && Array.isArray(trackDbIds) && trackDbIds.length > 0 && userId) {
          await fetch(`${env.SUPABASE_URL}/rest/v1/purchases`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'prefer': 'resolution=merge-duplicates,return=minimal',
              'apikey': env.SUPABASE_SERVICE_ROLE,
              'authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE}`
            },
            body: JSON.stringify(trackDbIds.map((tid) => ({ user_id: userId, track_id: tid })))
          });
        }
      } catch(_) {}
    }
    return json({ received: true });
  } catch (e) {
    return json({ error: 'webhook error', details: String((e && e.message) || e) }, 500);
  }
}

async function verifyStripeSignature(payload, header, secret) {
  try {
    const parts = Object.fromEntries(String(header).split(',').map(s => s.trim().split('=')));
    const t = parts.t; const v1 = parts.v1;
    if (!t || !v1) return false;
    const msg = `${t}.${payload}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
    const sigHex = bufToHex(sig);
    return constantTimeEqual(sigHex, v1);
  } catch (_) { return false; }
}

function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Redirect helper used by fallback routes
function redirectToReturnBase(req, env, state){
  try {
    const origin = env.CHECKOUT_RETURN_BASE || env.PUBLIC_BASE_URL || new URL(req.url).origin;
    const url = `${origin}/?checkout=${state === 'success' ? 'success' : 'cancel'}`;
    return new Response(null, { status: 302, headers: { ...corsHeaders(), 'location': url } });
  } catch (e) {
    return json({ error: 'redirect error', details: String((e && e.message) || e) }, 500);
  }
}

// ============ Diagnostics (no secret values) ============
function handleStripeDiag(env){
  try {
    return json({
      ok: true,
      hasStripeSecretKey: !!env.STRIPE_SECRET_KEY,
      hasStripeWebhookSecret: !!env.STRIPE_WEBHOOK_SECRET,
      hasSupabaseUrl: !!env.SUPABASE_URL,
      hasSupabaseAnonKey: !!env.SUPABASE_ANON_KEY,
      hasSupabaseServiceRole: !!env.SUPABASE_SERVICE_ROLE,
      hasCheckoutReturnBase: !!env.CHECKOUT_RETURN_BASE,
      hasPublicBaseUrl: !!env.PUBLIC_BASE_URL,
      hasR2Binding: !!(env.R2_BUCKET || env.R2)
    });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500);
  }
}
