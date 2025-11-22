function qs(id){return document.getElementById(id);} 

function effectiveNickname(user){
  if (!user) return '';
  const m = user.user_metadata || {};
  return m.nickname || m.full_name || m.name || (user.email ? user.email.split('@')[0] : '');
}

async function openSettings(){
  const btn = qs('settings-open-btn');
  const modalId = 'settingsModal';
  if (!window.supabase) return;
  try{
    const { data: { user } } = await window.supabase.auth.getUser();
    const nick = effectiveNickname(user);
    const input = qs('settings-nickname');
    if (input) input.value = nick || '';
    const acc = qs('settings-account');
    if (acc) acc.textContent = user ? (user.email || nick || '') : '';
    if (window.openModal) window.openModal(modalId); else document.getElementById(modalId).style.display='block';
  }catch(_){ /* no-op */ }
}

async function saveSettings(){
  const input = qs('settings-nickname');
  const val = (input && input.value ? input.value.trim() : '').substring(0,40);
  if (!val) { alert('Indica um nickname.'); return; }
  // Validação simples
  if (!/^[\w .\-À-ÿ]{2,40}$/.test(val)) { alert('Nickname inválido.'); return; }

  if (!window.supabase) { alert('Supabase não disponível.'); return; }
  try{
    const { error } = await window.supabase.auth.updateUser({ data: { nickname: val } });
    if (error) { alert('Falha ao guardar no perfil.'); }
  }catch(_){ /* ignore */ }

  try{ localStorage.setItem('chat_display_name', val); }catch(_){}
  try{ const el = qs('auth-username'); if (el){ el.textContent = val; el.style.display=''; } }catch(_){}
  try{ if (window.restartChatWithName) window.restartChatWithName(val); }catch(_){}

  const modalId = 'settingsModal';
  if (window.closeModal) window.closeModal(modalId); else document.getElementById(modalId).style.display='none';
}

(function init(){
  const openBtn = qs('settings-open-btn');
  if (openBtn) openBtn.addEventListener('click', openSettings);
  const saveBtn = qs('settings-save');
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);
  const logoutBtn = qs('settings-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    try { if (window.supabase) await window.supabase.auth.signOut(); } catch(_) {}
    try { localStorage.removeItem('chat_display_name'); } catch(_) {}
    const modalId = 'settingsModal';
    if (window.closeModal) window.closeModal(modalId); else document.getElementById(modalId).style.display='none';
  });
})();
