import { getSupabaseClient } from './supabase.js';

function ensureUploadNavBtn() {
  const nav = document.getElementById('nav-container');
  if (!nav) return null;
  let btn = document.getElementById('upload-nav-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'upload-nav-btn';
    btn.className = 'nav-btn';
    btn.dataset.section = 'upload';
    btn.textContent = '⬆️ Upload';
    btn.style.display = 'none';
    btn.addEventListener('click', () => {
      window.location.href = 'upload.html';
    });
    nav.appendChild(btn);
  }
  return btn;
}

async function isAllowed(supabase, email) {
  if (!email) return false;
  const { data, error } = await supabase
    .from('allowed_uploaders')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (error) { console.warn('allowlist read', error); }
  return !!(data && data.email);
}

async function init() {
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  const btn = ensureUploadNavBtn();
  const refresh = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const email = session && session.user ? (session.user.email || '') : '';
    const allowed = await isAllowed(supabase, email);
    if (btn) btn.style.display = allowed ? '' : 'none';
  };
  await refresh();
  try { supabase.auth.onAuthStateChange(() => { refresh(); }); } catch(_) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
