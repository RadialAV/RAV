import { getSupabaseClient } from './supabase.js';

const SUPABASE_URL = 'https://ezdmaipnmuudckdrvxxc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6ZG1haXBubXV1ZGNrZHJ2eHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NTQwODAsImV4cCI6MjA3ODEzMDA4MH0.aw5pJGrohkzu13eLNNsS-6uU78YZ3tQ1iBT-4L-KYFM';

let supabaseClient = null;
async function supa() {
  if (supabaseClient) return supabaseClient;
  const c = await getSupabaseClient();
  if (c) { supabaseClient = c; window.supabase = c; }
  return c;
}
try {
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  localStorage.setItem('supabase_url', SUPABASE_URL);
  localStorage.setItem('supabase_anon_key', SUPABASE_ANON_KEY);
} catch(_) {}

function qs(id) { return document.getElementById(id); }

const signinBtn = qs('auth-signin');
const signoutBtn = qs('auth-signout');
const userNameEl = qs('auth-username');
const settingsBtn = qs('settings-open-btn');

async function updateAuthUI() {
  try {
    const supabase = await supa();
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session && session.user ? session.user : null;
    if (signinBtn) signinBtn.style.display = user ? 'none' : '';
    if (signoutBtn) signoutBtn.style.display = user ? '' : 'none';
    const nickname = user ? (user.user_metadata && (user.user_metadata.nickname || user.user_metadata.full_name || user.user_metadata.name)) || user.email || '' : '';
    if (userNameEl) {
      userNameEl.textContent = user ? nickname : '';
      userNameEl.style.display = user ? '' : 'none';
    }
    if (settingsBtn) settingsBtn.style.display = user ? '' : 'none';
    // Mostrar botão Admin apenas para Admin Masters
    try {
      const adminBtn = document.getElementById('nav-admin-btn');
      if (adminBtn) {
        if (!user) { adminBtn.style.display = 'none'; }
        else {
          const { data, error } = await supabase.from('admin_masters').select('email').eq('email', user.email).maybeSingle();
          const isAdmin = (!error && data && data.email);
          adminBtn.style.display = isAdmin ? '' : 'none';
        }
      }
    } catch(_) {}
    // Mostrar botão Label Admin para membros de alguma label
    try {
      const labBtn = document.getElementById('nav-labeladmin-btn');
      if (labBtn) {
        if (!user) { labBtn.style.display = 'none'; }
        else {
          // Visibilidade se for Admin Master, Allowed Uploader ou membro de alguma label
          let isAdminMaster = false;
          try {
            const r1 = await supabase.from('admin_masters').select('email').eq('email', user.email).maybeSingle();
            isAdminMaster = !!(r1 && r1.data && r1.data.email);
          } catch(_) {}
          let hasLabel = false;
          try {
            const r2 = await supabase.from('label_members').select('label_id').eq('email', user.email).limit(1);
            hasLabel = !r2.error && Array.isArray(r2.data) && r2.data.length > 0;
          } catch(_) {}
          let isAllowedUploader = false;
          try {
            const r3 = await supabase.from('allowed_uploaders').select('email').eq('email', user.email).limit(1);
            isAllowedUploader = !r3.error && Array.isArray(r3.data) && r3.data.length > 0;
          } catch(_) {}
          labBtn.style.display = (isAdminMaster || hasLabel || isAllowedUploader) ? '' : 'none';
        }
      }
    } catch(_) {}
    try { if (nickname) localStorage.setItem('chat_display_name', nickname); } catch (_) {}
    // Se não existir nickname no perfil, pedir ao utilizador uma vez
    if (user && !(user.user_metadata && user.user_metadata.nickname)) {
      const flagKey = `nick_prompted_v1:${user.id}`;
      const wasPrompted = localStorage.getItem(flagKey);
      if (!wasPrompted) {
        const suggested = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || (user.email ? user.email.split('@')[0] : '');
        try {
          const input = document.getElementById('settings-nickname');
          if (input) input.value = suggested || '';
          if (window.openModal) window.openModal('settingsModal');
          else {
            const m = document.getElementById('settingsModal');
            if (m) m.style.display = 'block';
          }
          localStorage.setItem(flagKey, '1');
        } catch(_) {}
      }
    }
  } catch (_) {}
}

if (signinBtn) {
  signinBtn.addEventListener('click', async () => {
    const supabase = await supa();
    if (!supabase) return;
    const redirectTo = new URL('.', window.location.href).href; // garante trailing '/'
    try {
      // Desativar botão para evitar popups duplicados
      try { signinBtn.disabled = true; signinBtn.dataset.prevText = signinBtn.textContent || ''; signinBtn.textContent = 'A abrir…'; } catch(_) {}
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true }
      });
      if (error) { console.error('OAuth error', error); return; }
      if (data && data.url) {
        // Abrir em popup com referência ao opener (sem 'noopener') para permitir fechar após autenticação
        const features = 'width=520,height=650,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
        const w = window.open(data.url, 'supabase_oauth', features);
        if (!w) { window.location.href = data.url; }
        else {
          try { window.__authPopup = w; } catch(_) {}
          // Fallback por tempo: evita consultar popup.closed (gera COOP warnings)
          const start = Date.now();
          const timeoutMs = 45000; // 45s
          const intervalMs = 1500;
          const chk = setInterval(() => {
            try {
              const elapsed = Date.now() - start;
              const shouldStop = !window.__authPopup || elapsed > timeoutMs;
              if (shouldStop) {
                clearInterval(chk);
                try { signinBtn.disabled = false; signinBtn.textContent = signinBtn.dataset.prevText || 'Entrar com Google'; } catch(_) {}
              }
            } catch(_) { clearInterval(chk); try { signinBtn.disabled = false; signinBtn.textContent = signinBtn.dataset.prevText || 'Entrar com Google'; } catch(_) {} }
          }, intervalMs);
        }
      }
    } catch (e) {
      console.error('OAuth exception', e);
      try { signinBtn.disabled = false; signinBtn.textContent = signinBtn.dataset.prevText || 'Entrar com Google'; } catch(_) {}
    }
  });
}

if (signoutBtn) {
  signoutBtn.addEventListener('click', async () => {
    const supabase = await supa();
    if (!supabase) return;
    await supabase.auth.signOut();
    try { localStorage.removeItem('chat_display_name'); } catch (_) {}
    updateAuthUI();
  });
}

updateAuthUI();

supa().then((supabase) => {
  if (supabase && supabase.auth && supabase.auth.onAuthStateChange) {
    supabase.auth.onAuthStateChange(() => { updateAuthUI(); });
  }
});

// Se este for o popup de retorno de OAuth, fechar automaticamente após obter sessão
(async () => {
  try {
    const supabase = await supa();
    if (!supabase) return;
    const isPopupWin = window.name === 'supabase_oauth';
    const isOAuthCallback = () => {
      try {
        const qs = new URLSearchParams(window.location.search || '');
        return qs.has('code') || qs.has('access_token') || (window.location.hash || '').includes('access_token') || qs.has('error') || (window.location.hash || '').includes('error');
      } catch(_) { return false; }
    };
    const notifyAndClose = () => {
      const canClose = isPopupWin && !!(window.opener && !window.opener.closed);
      try { if (canClose) window.opener.postMessage({ type: 'supabase:auth', status: 'signed_in' }, '*'); } catch (_) {}
      if (canClose) {
        try { window.close(); } catch (_) {}
      }
    };
    const { data: { session } } = await supabase.auth.getSession();
    if (session) { notifyAndClose(); return; }
    // Escutar eventos e polling (robustez)
    try { supabase.auth.onAuthStateChange((evt) => { if (evt && evt.event === 'SIGNED_IN' && isOAuthCallback()) notifyAndClose(); }); } catch(_) {}
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s && isOAuthCallback()) { clearInterval(timer); notifyAndClose(); }
      } catch(_) {}
      if (tries > 60) { clearInterval(timer); }
    }, 500);
  } catch(_) {}
})();

// No opener (janela principal): escutar mensagem do popup e atualizar UI
if (!window.__authMsgBound) {
  window.__authMsgBound = true;
  window.addEventListener('message', (e) => {
    try {
      if (e && e.data && e.data.type === 'supabase:auth') {
        updateAuthUI();
        try { if (window.__authPopup) window.__authPopup.close(); } catch(_) {}
        try { signinBtn.disabled = false; signinBtn.textContent = signinBtn.dataset.prevText || 'Entrar com Google'; } catch(_) {}
      }
    } catch(_) {}
  });
}
