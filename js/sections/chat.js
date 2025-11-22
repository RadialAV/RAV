// js/sections/chat.js

import { formatTime } from '../utils.js';
import { getSupabaseClient } from '../supabase.js';

let supabase = null;
let presenceChannel = null;
let messagesChannel = null;
let typingChannel = null;
let lastSentAt = 0;
let lastTypingSentAt = 0;
const TYPING_WINDOW_MS = 3000;
const typingUsers = new Map(); // username -> lastTs

const CHAT_ROOM = 'global';

function getCreds() {
  const url = (typeof window !== 'undefined' && window.SUPABASE_URL) || localStorage.getItem('supabase_url');
  const key = (typeof window !== 'undefined' && window.SUPABASE_ANON_KEY) || localStorage.getItem('supabase_anon_key');
  const name = localStorage.getItem('chat_display_name') || null;
  return { url, key, name };
}

function setupTyping(username) {
  typingChannel = supabase.channel('typing:radial_chat');

  // Receber eventos de typing
  typingChannel.on('broadcast', { event: 'typing' }, (msg) => {
    const p = msg.payload || {};
    if (!p.username || p.username === username) return; // ignora próprio
    typingUsers.set(p.username, Date.now());
    updateTypingUI();
  });

  typingChannel.subscribe();

  // Enviar eventos enquanto escreve (com throttle)
  const input = qs('chat-input');
  if (input) {
    input.addEventListener('input', () => {
      const now = Date.now();
      if (now - lastTypingSentAt < 1000) return;
      lastTypingSentAt = now;
      try {
        typingChannel.send({ type: 'broadcast', event: 'typing', payload: { username, ts: now } });
      } catch(_) {}
    });
  }

  // Limpar utilizadores expirados periodicamente
  setInterval(() => pruneTypingUsers(), 1500);
}

function pruneTypingUsers() {
  const now = Date.now();
  let changed = false;
  for (const [name, ts] of typingUsers.entries()) {
    if (now - ts > TYPING_WINDOW_MS) {
      typingUsers.delete(name);
      changed = true;
    }
  }
  if (changed) updateTypingUI();
}

function updateTypingUI() {
  const el = qs('chat-typing');
  if (!el) return;
  const names = Array.from(typingUsers.keys());
  if (names.length === 0) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  let text = '';
  if (names.length === 1) text = `${names[0]} está a escrever…`;
  else if (names.length === 2) text = `${names[0]} e ${names[1]} estão a escrever…`;
  else text = `${names[0]}, ${names[1]} e ${names.length - 2} outros estão a escrever…`;
  el.textContent = text;
  el.style.display = 'block';
}

function saveCreds(url, key, name) {
  localStorage.setItem('supabase_url', url.trim());
  localStorage.setItem('supabase_anon_key', key.trim());
  if (name && name.trim()) localStorage.setItem('chat_display_name', name.trim());
}

function qs(id) { return document.getElementById(id); }

function showSetupUI() {
  qs('chat-setup').style.display = 'block';
  qs('chat-container').style.display = 'none';
}

function showChatUI() {
  qs('chat-setup').style.display = 'none';
  qs('chat-container').style.display = 'flex';
}

async function startChat({ url, key, name }) {
  showChatUI();
  supabase = await getSupabaseClient();
  if (!supabase) { showSetupUI(); return; }

  setupPresence(name);
  setupMessagesRealtime();
  setupSend(name);
  setupTyping(name);
  setupEditSettings();
  loadInitialMessages();
}

function renderMessage({ username, content, created_at }) {
  const messagesEl = qs('chat-messages');
  const item = document.createElement('div');
  item.className = 'chat-message';

  let prefix = '';
  try {
    if (window.currentAudio && isFinite(window.currentAudio.currentTime)) {
      prefix = `[${formatTime(Math.floor(window.currentAudio.currentTime))}]`;
    } else if (created_at) {
      const d = new Date(created_at);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      prefix = `[${hh}:${mm}]`;
    }
  } catch (_) {}

  item.innerHTML = `
    <span class="chat-meta">${prefix} <strong>${escapeHtml(username)}</strong></span>
    <span class="chat-text">${escapeHtml(content)}</span>
  `;
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]+/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

async function loadInitialMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room', CHAT_ROOM)
    .order('created_at', { ascending: true })
    .limit(200);
  if (!error && data) {
    data.forEach(renderMessage);
  }
}

function setupPresence(username) {
  presenceChannel = supabase.channel('presence:radial_chat', {
    config: { presence: { key: username } }
  });

  presenceChannel.on('presence', { event: 'sync' }, () => {
    const state = presenceChannel.presenceState();
    const users = Object.values(state).flat();
    qs('chat-online').textContent = `${users.length} online`;
  });

  presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({ username, online_at: new Date().toISOString() });
    }
  });
}

function setupMessagesRealtime() {
  messagesChannel = supabase
    .channel('realtime:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const msg = payload.new;
      if (msg.room === CHAT_ROOM) renderMessage(msg);
    })
    .subscribe();
}

function setupSend(username) {
  const form = qs('chat-input-form');
  const input = qs('chat-input');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastSentAt < 1200) return; // rate limit ~1.2s
    const text = input.value.trim();
    if (!text) return;

    lastSentAt = now;
    input.value = '';
    const { error } = await supabase.from('messages').insert({ username, content: text, room: CHAT_ROOM });
    if (error) {
      // fallback: repor input
      input.value = text;
      alert('Falha ao enviar mensagem');
    }
  });
}

function setupEditSettings() {
  const btn = qs('chat-edit-settings');
  if (!btn) return; // botão removido no layout atual
  btn.addEventListener('click', () => {
    const creds = getCreds();
    const newName = prompt('Nome a mostrar no chat', (creds && creds.name) || '');
    if (newName === null) return;
    const n = newName.trim();
    if (!n) return;
    try { localStorage.setItem('chat_display_name', n); } catch (_) {}
    try { if (presenceChannel) presenceChannel.unsubscribe(); } catch (_) {}
    try { if (messagesChannel) messagesChannel.unsubscribe(); } catch (_) {}
    try { if (typingChannel) typingChannel.unsubscribe(); } catch (_) {}
    try {
      const f = qs('chat-input-form');
      if (f) { const cl = f.cloneNode(true); f.parentNode.replaceChild(cl, f); }
      const i = qs('chat-input');
      if (i) { const cli = i.cloneNode(true); i.parentNode.replaceChild(cli, i); }
      const b = qs('chat-edit-settings');
      if (b) { const clb = b.cloneNode(true); b.parentNode.replaceChild(clb, b); }
    } catch (_) {}
    startChat({ url: creds.url, key: creds.key, name: n });
  });
}

export async function initChatSection() {
  const setupForm = qs('chat-setup-form');
  if (setupForm) {
    setupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let url = (typeof window !== 'undefined' && window.SUPABASE_URL) || (qs('chat-supabase-url') ? qs('chat-supabase-url').value : '');
      let key = (typeof window !== 'undefined' && window.SUPABASE_ANON_KEY) || (qs('chat-supabase-key') ? qs('chat-supabase-key').value : '');
      const name = qs('chat-display-name') ? (qs('chat-display-name').value || `Guest-${Math.floor(Math.random()*1000)}`) : `Guest-${Math.floor(Math.random()*1000)}`;
      if (!url || !key) {
        const cur = getCreds();
        if (cur && cur.url && cur.key) { url = cur.url; key = cur.key; }
      }
      if (!url || !key) return;
      saveCreds(url, key, name);
      startChat({ url, key, name });
    });
  }

  let creds = getCreds();
  const urlInput = qs('chat-supabase-url');
  const keyInput = qs('chat-supabase-key');
  const nameInput = qs('chat-display-name');

  const hasGlobals = !!(typeof window !== 'undefined' && window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
  let hasStored = !!(creds.url && creds.key);
  if (hasGlobals || hasStored) {
    if (urlInput && urlInput.closest('.form-group')) urlInput.closest('.form-group').style.display = 'none';
    if (keyInput && keyInput.closest('.form-group')) keyInput.closest('.form-group').style.display = 'none';
    if (urlInput) { try { urlInput.required = false; urlInput.disabled = true; } catch(_) {} }
    if (keyInput) { try { keyInput.required = false; keyInput.disabled = true; } catch(_) {} }
  }

  // Tentar buscar config do Worker se faltar URL/KEY
  if (!creds.url || !creds.key) {
    try {
      const base = (typeof window !== 'undefined' && window.R2_API_URL) || '';
      if (base) {
        const resp = await fetch(`${base}/api/chat-config`);
        if (resp.ok) {
          const cfg = await resp.json();
          const u = cfg.url || cfg.supabaseUrl;
          const k = cfg.anonKey || cfg.publicAnonKey;
          if (u && k) {
            saveCreds(u, k, creds.name || '');
            creds = { url: u, key: k, name: creds.name };
            hasStored = true;
            if (urlInput && urlInput.closest('.form-group')) urlInput.closest('.form-group').style.display = 'none';
            if (keyInput && keyInput.closest('.form-group')) keyInput.closest('.form-group').style.display = 'none';
            if (urlInput) { try { urlInput.required = false; urlInput.disabled = true; } catch(_) {} }
            if (keyInput) { try { keyInput.required = false; keyInput.disabled = true; } catch(_) {} }
          }
        }
      }
    } catch (_) {}
  }

  if (!creds.url || !creds.key) {
    showSetupUI();
    return;
  }

  // Se faltar nickname, mostrar apenas campo de nome
  if (!creds.name) {
    showSetupUI();
    if (hasGlobals || hasStored) {
      // Focar no campo de nome
      if (nameInput) nameInput.focus();
    }
    return;
  }

  startChat({ url: creds.url, key: creds.key, name: creds.name });
}

// inicialização automática ao carregar módulo
try { initChatSection(); } catch (_) {}

export function restartChatWithName(name) {
  try { localStorage.setItem('chat_display_name', name); } catch (_) {}
  try { if (presenceChannel) presenceChannel.unsubscribe(); } catch (_) {}
  try { if (messagesChannel) messagesChannel.unsubscribe(); } catch (_) {}
  try { if (typingChannel) typingChannel.unsubscribe(); } catch (_) {}
  try {
    const f = qs('chat-input-form');
    if (f) { const cl = f.cloneNode(true); f.parentNode.replaceChild(cl, f); }
    const i = qs('chat-input');
    if (i) { const cli = i.cloneNode(true); i.parentNode.replaceChild(cli, i); }
    const b = qs('chat-edit-settings');
    if (b) { const clb = b.cloneNode(true); b.parentNode.replaceChild(clb, b); }
  } catch (_) {}
  const creds = getCreds();
  startChat({ url: creds.url, key: creds.key, name });
}

// Disponibilizar para outros módulos
try { window.restartChatWithName = restartChatWithName; } catch(_) {}
