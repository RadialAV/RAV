// js/sections/fm.js
import { getSupabaseClient } from '../supabase.js';
import { getTrackById } from '../data.js';

const el = (id) => document.getElementById(id);

let supabase = null;
let channel = null;
let isHost = false;
let isListening = false;
let broadcastTimer = null;
let lastRemoteTs = 0;
let username = null;
let microTimer = null;
let claimTimer = null;
let lastPersistAt = 0;
let currentHostName = '—';
let pinnedText = '';

function getCreds() {
  const url = localStorage.getItem('supabase_url');
  const key = localStorage.getItem('supabase_anon_key');
  username = localStorage.getItem('chat_display_name') || `Guest-${Math.floor(Math.random()*1000)}`;
  return { url, key };
}

function fmtTrack(trackId) {
  const t = getTrackById(Number(trackId));
  return t ? `${t.title} — ${t.artist}` : '—';
}

function updateStatus(extra = {}) {
  const mode = isHost ? 'Host' : (isListening ? 'Listener' : 'Off');
  const conn = channel && channel.state === 'joined' ? 'ligado' : '—';
  const hostName = extra.hostName || '—';
  el('fm-status').textContent = `Modo: ${mode} • Host atual: ${hostName} • Ligação: ${conn}`;
}

function updateNow(trackId) {
  el('fm-now').textContent = `Agora: ${fmtTrack(trackId)}`;
}

function currentPlayerState() {
  const audio = window.currentAudio;
  const trackId = window.currentTrackId || null;
  const paused = !(window.isPlaying && audio && !audio.paused);
  const positionSec = audio && isFinite(audio.currentTime) ? audio.currentTime : 0;
  const ts = Date.now();
  return { type: 'fm_state', ts, anchorEpochMs: ts, trackId, paused, positionSec };
}

async function persistFmState(state) {
  if (!supabase) return;
  const now = Date.now();
  if (now - lastPersistAt < 4000) return; // throttle ~4s
  lastPersistAt = now;
  try {
    await supabase.from('fm_state').upsert({
      id: 'global',
      track_id: state.trackId,
      anchor_epoch_ms: state.anchorEpochMs,
      paused: state.paused,
      position_sec: state.positionSec,
      host_name: username,
      updated_at: new Date().toISOString()
    });
  } catch (_) {}
}

async function fetchFmStateAndApply() {
  if (!supabase) return;
  try {
    const { data } = await supabase.from('fm_state').select('*').eq('id', 'global').single();
    if (data) {
      if (typeof data.pinned_text === 'string') { pinnedText = data.pinned_text; updatePinnedUI(); }
      if (isListening && data.track_id != null) {
        const payload = {
          ts: Date.now(),
          anchorEpochMs: data.anchor_epoch_ms || Date.now(),
          trackId: data.track_id,
          paused: !!data.paused,
          positionSec: Number(data.position_sec) || 0
        };
        applyRemoteState(payload);
      }
    }
  } catch (_) {}
}

async function ensureTrack(trackId) {
  if (!trackId) return false;
  if (window.currentTrackId !== Number(trackId)) {
    // Vai tocar a faixa; playTrack é global
    window.playTrack(Number(trackId));
    // Esperar o audio estar pronto
    const ok = await waitFor(() => window.currentAudio && isFinite(window.currentAudio.duration), 1500);
    return ok;
  }
  return true;
}

function waitFor(pred, timeoutMs = 1000, intervalMs = 50) {
  return new Promise((resolve) => {
    const start = Date.now();
    const it = setInterval(() => {
      if (pred()) { clearInterval(it); resolve(true); }
      else if (Date.now() - start > timeoutMs) { clearInterval(it); resolve(false); }
    }, intervalMs);
  });
}

function updateHostUI() {
  const ind = el('fm-host-indicator');
  if (!ind) return;
  if (isHost) ind.textContent = '🟢 Tu és o Host';
  else if (!currentHostName || currentHostName === '—') ind.textContent = '⚪ Sem host — podes assumir';
  else ind.textContent = `🟢 Host: ${currentHostName}`;
}

function updateButtons() {
  const bListen = el('fm-listen');
  const bStop = el('fm-stop-listen');
  const bBecome = el('fm-become-host');
  const bLeave = el('fm-leave-host');
  const pinBtn = el('chat-pin-btn');
  const pinEditor = el('chat-pin-editor');

  if (bListen) bListen.style.display = (!isHost && !isListening) ? 'inline-block' : 'none';
  if (bStop) bStop.style.display = isListening ? 'inline-block' : 'none';
  if (bLeave) bLeave.style.display = isHost ? 'inline-block' : 'none';

  // 'Assumir Host' visível apenas quando não há host e não estás a hospedar
  const noHost = (!currentHostName || currentHostName === '—');
  if (bBecome) {
    bBecome.textContent = noHost ? 'Assumir Host' : 'Tornar-me Host';
    bBecome.style.display = (!isHost && noHost) ? 'inline-block' : 'none';
  }
  if (pinBtn) pinBtn.style.display = isHost ? 'inline-block' : 'none';
  if (pinEditor && !isHost) pinEditor.style.display = 'none';
}

function updatePinnedUI() {
  const elp = el('chat-pinned');
  if (!elp) return;
  if (pinnedText && pinnedText.length > 0) {
    elp.textContent = `📌 ${pinnedText}`;
    elp.style.display = 'block';
  } else {
    elp.textContent = '';
    elp.style.display = 'none';
  }
}

function setPinnedText(text) {
  pinnedText = text;
  updatePinnedUI();
  try {
    channel && channel.send({ type: 'broadcast', event: 'fm_pin', payload: { text } });
  } catch(_) {}
  // persist best-effort
  try {
    supabase && supabase.from('fm_state').upsert({ id: 'global', pinned_text: text, updated_at: new Date().toISOString() });
  } catch(_) {}
  // echo para o feed do chat
  try {
    if (supabase) {
      const content = (text && text.length > 0) ? `📌 ${text}` : '📌 anúncio removido';
      supabase.from('messages').insert({ username: username || 'Host', content, room: 'global' });
    }
  } catch(_) {}
}

async function applyRemoteState(payload) {
  lastRemoteTs = Math.max(lastRemoteTs, payload.ts || 0);
  const ok = await ensureTrack(payload.trackId);
  if (!ok) return;

  const audio = window.currentAudio;
  if (!audio) return;

  // Calcular posição desejada
  const elapsed = Math.max(0, (Date.now() - (payload.anchorEpochMs || payload.ts || Date.now())) / 1000);
  const desired = payload.paused ? payload.positionSec : (payload.positionSec + elapsed);

  // Corrigir drift
  const diff = desired - audio.currentTime;
  if (Math.abs(diff) > 0.5) {
    try { audio.currentTime = Math.max(0, desired); } catch (_) {}
  }
  // Micro-ajuste de drift com playbackRate quando diferença é pequena
  else if (!payload.paused) {
    const abs = Math.abs(diff);
    if (abs > 0.05) {
      const rate = Math.max(0.98, Math.min(1.02, 1 + (diff * 0.1)));
      try { audio.playbackRate = rate; } catch(_){}
      if (microTimer) clearTimeout(microTimer);
      microTimer = setTimeout(() => { try { audio.playbackRate = 1; } catch(_){}; microTimer = null; }, 2000);
    } else {
      try { audio.playbackRate = 1; } catch(_){}
    }
  }

  // Ajustar play/pause
  const localPaused = audio.paused;
  if (payload.paused && !localPaused) {
    if (window.isPlaying) window.togglePlay(); else try { audio.pause(); } catch (_) {}
    try { audio.playbackRate = 1; } catch(_){}
  } else if (!payload.paused && localPaused) {
    if (!window.isPlaying) window.togglePlay(); else try { audio.play(); } catch (_) {}
  }

  updateNow(payload.trackId);
}

function startBroadcasting() {
  if (broadcastTimer) return;
  // Enviar estado 1x/segundo
  broadcastTimer = setInterval(() => {
    if (!channel) return;
    const state = currentPlayerState();
    channel.send({ type: 'broadcast', event: 'fm_state', payload: state });
    persistFmState(state);
  }, 1000);
  // Envio imediato
  const state = currentPlayerState();
  channel.send({ type: 'broadcast', event: 'fm_state', payload: state });
  persistFmState(state);
}

function stopBroadcasting() { if (broadcastTimer) { clearInterval(broadcastTimer); broadcastTimer = null; } }

// Helpers globais para modo listener/host (usados por UI e presença)
function setListening(v) {
  isListening = v;
  document.body.classList.toggle('fm-listening', v);
  updateStatus();
}

async function setHosting(v) {
  isHost = v;
  document.body.classList.toggle('fm-hosting', v);
  updateStatus();
  if (channel) { try { await channel.track({ username, host: v }); } catch(_){} }
  updateHostUI();
  updateButtons();
}

async function setupChannel() {
  const creds = getCreds();
  supabase = await getSupabaseClient();
  if (!supabase) {
    updateStatus();
    el('fm-help').textContent = 'Faltam credenciais do Supabase. Configura-as na secção Chat.';
    return;
  }
  channel = supabase.channel('radial_fm', { config: { presence: { key: username } } });

  channel.on('broadcast', { event: 'fm_state' }, (msg) => {
    if (!isListening) return;
    const payload = msg.payload || {};
    // Ignorar estados antigos
    if (payload.ts && payload.ts < lastRemoteTs) return;
    applyRemoteState(payload);
  });

  // Listener pede snapshot imediato; host responde com fm_state atual
  channel.on('broadcast', { event: 'request_state' }, () => {
    if (!isHost) return;
    const state = currentPlayerState();
    channel.send({ type: 'broadcast', event: 'fm_state', payload: state });
  });

  // Mensagem fixada (pinned) broadcast pelo host
  channel.on('broadcast', { event: 'fm_pin' }, (msg) => {
    const p = msg.payload || {};
    if (typeof p.text === 'string') {
      pinnedText = p.text;
      updatePinnedUI();
    }
  });

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    const users = Object.values(state).flat();
    const host = users.find(u => u.host === true);
    currentHostName = host ? (host.username || 'Host') : '—';
    updateStatus({ hostName: currentHostName });
    updateHostUI();
    updateButtons();

    // Auto-transferência de host: se não houver host, listeners podem assumir após backoff aleatório
    if (!host) {
      if (!claimTimer && isListening && !isHost) {
        const delay = 200 + Math.floor(Math.random() * 1000);
        claimTimer = setTimeout(async () => {
          claimTimer = null;
          // Revalidar estado de presença
          const st = channel.presenceState();
          const us = Object.values(st).flat();
          const h2 = us.find(u => u.host === true);
          if (!h2 && isListening && !isHost) {
            await setHosting(true);
            startBroadcasting();
          }
        }, delay);
      }
    } else if (claimTimer) {
      clearTimeout(claimTimer);
      claimTimer = null;
    }
  });

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ username, host: isHost });
      updateStatus();
      // Carregar mensagem fixada e (se for listener) estado
      fetchFmStateAndApply();
      updateButtons();
    }
  });
}

function bindUI() {
  el('fm-listen').addEventListener('click', async () => {
    if (!channel) await setupChannel();
    setListening(true);
    updateButtons();
    // Fallback imediato: ler último estado persistido
    fetchFmStateAndApply();
    // Pedir snapshot imediato ao host
    try { channel && channel.send({ type: 'broadcast', event: 'request_state', payload: { requester: username, ts: Date.now() } }); } catch(_){ }
  });

  el('fm-stop-listen').addEventListener('click', async () => {
    setListening(false);
    updateButtons();
  });

  el('fm-become-host').addEventListener('click', async () => {
    if (!channel) await setupChannel();
    // Tornar-se host cancela modo listener para evitar conflitos
    setListening(false);
    await setHosting(true);
    startBroadcasting();
  });

  el('fm-leave-host').addEventListener('click', async () => {
    await setHosting(false);
    stopBroadcasting();
    // Persistir estado final (pausado) ao sair
    try {
      const s = currentPlayerState();
      s.paused = true;
      persistFmState(s);
    } catch(_){}
  });

  // Editor inline do anúncio fixado (apenas host)
  const pinBtn = el('chat-pin-btn');
  const pinEditor = el('chat-pin-editor');
  const pinInput = el('chat-pin-input');
  const pinSave = el('chat-pin-save');
  const pinClear = el('chat-pin-clear');
  const pinCancel = el('chat-pin-cancel');

  if (pinBtn && pinEditor) {
    pinBtn.addEventListener('click', () => {
      if (!isHost) return;
      try { pinBtn.blur(); } catch(_){}
      const isHidden = (pinEditor.style.display === 'none' || pinEditor.style.display === '');
      pinEditor.style.display = isHidden ? 'flex' : 'none';
      if (pinEditor.style.display === 'flex' && pinInput) {
        pinInput.value = pinnedText || '';
        try { pinInput.focus(); if (pinInput.select) pinInput.select(); } catch(_) {}
      }
    });
  }

  if (pinSave && pinEditor) pinSave.addEventListener('click', () => {
    if (!isHost) return;
    const val = (pinInput && pinInput.value) ? pinInput.value.trim() : '';
    setPinnedText(val);
    pinEditor.style.display = 'none';
  });

  if (pinClear && pinEditor) pinClear.addEventListener('click', () => {
    if (!isHost) return;
    setPinnedText('');
    pinEditor.style.display = 'none';
  });

  if (pinCancel && pinEditor) pinCancel.addEventListener('click', () => {
    pinEditor.style.display = 'none';
  });

  if (pinInput && pinEditor) pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); pinSave && pinSave.click(); }
    else if (e.key === 'Escape') { e.preventDefault(); pinCancel && pinCancel.click(); }
  });
}

(function initFM(){
  try { bindUI(); setupChannel(); } catch (e) { console.warn('FM init error', e); }
})();
