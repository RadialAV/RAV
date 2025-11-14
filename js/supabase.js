import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _client = null;
let _cache = { url: null, key: null };

function getLocalCreds() {
  const u = (typeof window !== 'undefined' && window.SUPABASE_URL) || localStorage.getItem('supabase_url') || '';
  const k = (typeof window !== 'undefined' && window.SUPABASE_ANON_KEY) || localStorage.getItem('supabase_anon_key') || '';
  return { url: u, key: k };
}

// --- Auth helpers (R1) ---
export async function getUser() {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session && session.user ? session.user : null;
  } catch (_) { return null; }
}

export async function onAuthChange(callback) {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase || !supabase.auth || !supabase.auth.onAuthStateChange) return () => {};
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      try { if (typeof callback === 'function') callback(event, session); } catch(_) {}
    });
    return () => { try { if (sub && sub.subscription) sub.subscription.unsubscribe(); } catch(_) {}; };
  } catch(_) { return () => {}; }
}

export async function signInWithGoogle(options = { redirectTo: new URL('.', window.location.href).href, skipBrowserRedirect: true }) {
  const supabase = await getSupabaseClient();
  if (!supabase) return { data: null, error: new Error('No Supabase client') };
  return supabase.auth.signInWithOAuth({ provider: 'google', options });
}

export async function signOut() {
  const supabase = await getSupabaseClient();
  if (!supabase) return { error: new Error('No Supabase client') };
  return supabase.auth.signOut();
}

async function getWorkerCreds() {
  try {
    const base = (typeof window !== 'undefined' && window.R2_API_URL) || '';
    if (!base) return { url: '', key: '' };
    const r = await fetch(`${base}/api/chat-config`);
    if (!r.ok) return { url: '', key: '' };
    const j = await r.json();
    const url = j.url || j.supabaseUrl || '';
    const key = j.anonKey || j.publicAnonKey || '';
    return { url, key };
  } catch (_) {
    return { url: '', key: '' };
  }
}

export async function getSupabaseClient() {
  try {
    let { url, key } = getLocalCreds();
    if (!url || !key) {
      const w = await getWorkerCreds();
      if (w.url && w.key) {
        try {
          localStorage.setItem('supabase_url', w.url);
          localStorage.setItem('supabase_anon_key', w.key);
        } catch (_) {}
        url = w.url; key = w.key;
      }
    }
    if (!url || !key) return null;
    if (_client && _cache.url === url && _cache.key === key) return _client;
    _client = createClient(url, key);
    _cache = { url, key };
    return _client;
  } catch (_) {
    return null;
  }
}
