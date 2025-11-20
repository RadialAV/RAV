// js/player.js

import { getTrackById, addTrackToRecent, tracks, releases } from './data.js';
import { formatTime, showToast, openExternalLink } from './utils.js';

// Estado do Player
let currentTrack = null;
let isPlaying = false;
let currentAudio = null;
// Expor para debug/teste (será atualizado na função playTrack)
window.currentAudio = currentAudio;
let currentPlaylist = null; // Array de IDs de músicas da playlist atual
let currentPlaylistIndex = 0;
let shuffleMode = false;
let shuffledPlaylist = [];
let repeatMode = 'off'; // 'off', 'all', 'one'
let playReqId = 0; // Incremental guard para evitar corridas de play()
let seeking = false;
let progressBarEl = null;
let buyBtnEl = null;
// Fila de reprodução
let upNext = [];   // elementos para tocar imediatamente a seguir
let queue = [];    // fila normal

// Visualizer (waveform no player expandido)
const ENABLE_VISUALIZER = false;
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let visualizerRAF = null;
let outputGain = null;
let audioFlowTimer = null;
let audioFlowing = false;
let monitorGain = null;
let routeTimer = null;
let routeFinalized = false;

function ensureAudioContextRunning() {
    try {
        if (audioCtx && audioCtx.state !== 'running') {
            audioCtx.resume().catch(() => {});
        }
    } catch (_) {}
}

function updateQueueBadges() {
    try {
        const up = document.getElementById('queue-upnext-badge');
        const qu = document.getElementById('queue-queue-badge');
        if (up) {
            const n = upNext.length;
            if (n > 0) { up.textContent = String(n); up.style.display = ''; } else { up.style.display = 'none'; }
        }
        if (qu) {
            const n2 = queue.length;
            if (n2 > 0) { qu.textContent = String(n2); qu.style.display = ''; } else { qu.style.display = 'none'; }
        }
    } catch (_) {}
}

function handleEnded() {
    try {
        // Prioridade: upNext -> queue -> comportamento normal
        if (upNext.length > 0) {
            const nextId = upNext.shift();
            updateQueueBadges();
            if (typeof nextId === 'number') return playTrack(nextId);
        }
        if (queue.length > 0) {
            const qId = queue.shift();
            updateQueueBadges();
            if (typeof qId === 'number') return playTrack(qId);
        }
    } catch (_) {}
    nextTrack();
}

function addToQueue(trackId) {
    if (typeof trackId !== 'number') return;
    queue.push(trackId);
    try { showToast('Adicionado à fila', 'info'); } catch (_) {}
    updateQueueBadges();
}

function playNextImmediate(trackId) {
    if (typeof trackId !== 'number') return;
    upNext.push(trackId);
    try { showToast('Vai tocar a seguir', 'success'); } catch (_) {}
    updateQueueBadges();
}

function handleSeekAt(clientX) {
    if (!currentAudio || !progressBarEl || !isFinite(currentAudio.duration)) return;
    const rect = progressBarEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const pct = rect.width ? (x / rect.width) : 0;
    const newTime = currentAudio.duration * pct;
    if (isFinite(newTime)) {
        try { currentAudio.currentTime = newTime; } catch (_) {}
        // Atualizar UI imediatamente
        progressFill.style.width = (pct * 100) + '%';
        currentTimeSpan.textContent = formatTime(currentAudio.currentTime);
    }
}

function setupProgressDrag() {
    if (!progressBarEl) return;
    // Mouse
    try {
        progressBarEl.addEventListener('mousedown', (e) => {
            seeking = true;
            handleSeekAt(e.clientX);
            const move = (ev) => { if (seeking) handleSeekAt(ev.clientX); };
            const up = () => { seeking = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up, { once: true });
        });
    } catch (_) {}
    // Touch
    try {
        progressBarEl.addEventListener('touchstart', (e) => {
            seeking = true;
            const t = e.touches[0];
            handleSeekAt(t.clientX);
        }, { passive: true });
        progressBarEl.addEventListener('touchmove', (e) => {
            if (!seeking) return;
            const t = e.touches[0];
            handleSeekAt(t.clientX);
        }, { passive: true });
        progressBarEl.addEventListener('touchend', () => { seeking = false; }, { passive: true });
        progressBarEl.addEventListener('touchcancel', () => { seeking = false; }, { passive: true });
    } catch (_) {}
}

function getWaveformCanvas() {
    return document.getElementById('waveform-canvas');
}

function resizeWaveformCanvas() {
    const canvas = getWaveformCanvas();
    if (!canvas) return;
    const rect = playerElement.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width - 32));
    canvas.width = width;
    canvas.height = 100;
}

function startVisualizer() {
    const canvas = getWaveformCanvas();
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        visualizerRAF = requestAnimationFrame(draw);
        if (!canvas.isConnected) return; // skip if detached
        analyser.getByteFrequencyData(dataArray);
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, 0, width, height);

        const bars = 96;
        const step = Math.floor(bufferLength / bars);
        const barWidth = Math.max(2, Math.floor(width / (bars * 1.5)));
        const gap = (width - bars * barWidth) / (bars - 1);
        const centerY = Math.floor(height / 2);

        for (let i = 0; i < bars; i++) {
            const v = dataArray[i * step] / 255; // 0..1
            const barHeight = Math.max(2, Math.floor(v * (height * 0.9)));
            const x = Math.floor(i * (barWidth + gap));

            const grad = ctx.createLinearGradient(x, centerY - barHeight / 2, x, centerY + barHeight / 2);
            grad.addColorStop(0, 'rgba(30,144,255,0.9)');
            grad.addColorStop(1, 'rgba(255,118,95,0.9)');
            ctx.fillStyle = grad;

            ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
        }
    }

    cancelAnimationFrame(visualizerRAF);
    draw();
}

function setupVisualizerForCurrentAudio() {
    try {
        if (!currentAudio) return;
        // Equalizador desativado: garantir áudio direto via elemento
        try { currentAudio.muted = false; } catch (_) {}
        // Finalizar qualquer AudioContext existente
        try { if (visualizerRAF) cancelAnimationFrame(visualizerRAF); } catch (_) {}
        visualizerRAF = null;
        if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} }
        sourceNode = null;
        analyser = null;
        outputGain = null;
        if (audioCtx) {
            try { audioCtx.close(); } catch (_) {}
            audioCtx = null;
        }
    } catch (_) {}
}

const playerElement = document.getElementById('player');
const playBtn = document.getElementById('play-btn');
const playerCover = document.getElementById('player-cover');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const progressFill = document.getElementById('progress-fill');
const currentTimeSpan = document.getElementById('current-time');
const totalTimeSpan = document.getElementById('total-time');
const volumeSlider = document.querySelector('.volume-slider');

function setPlayerHeightVar(){
    try{
        if (!playerElement) return;
        const rect = playerElement.getBoundingClientRect();
        const h = Math.ceil(rect.height || 0);
        if (h > 0) {
            document.documentElement.style.setProperty('--player-height', h + 'px');
        }
    }catch(_){/* noop */}
}

/**
 * Configura os event listeners e o estado inicial do player.
 */
export function setupPlayer() {
    // Expor funções globais para o HTML
    window.playTrack = playTrack;
    window.togglePlay = togglePlay;
    window.nextTrack = nextTrack;
    window.previousTrack = previousTrack;
    window.toggleExpandedPlayer = toggleExpandedPlayer;
    window.seekTo = seekTo;
    window.setVolume = setVolume;
    window.playPlaylist = playPlaylist;
    window.playTrackFromPlaylist = playTrackFromPlaylist;
    window.toggleShuffle = toggleShuffle;
    window.toggleRepeat = toggleRepeat;
    window.addToQueue = addToQueue;
    window.playNextImmediate = playNextImmediate;
    window.openBuyForCurrent = openBuyForCurrent;

    // Inicializar volume
    if (currentAudio) {
        currentAudio.volume = volumeSlider.value / 100;
    }

/**
 * Ativa gesto de swipe-down no player expandido para fechar como bottom sheet
 */
function setupExpandedSwipe() {
    let startY = 0;
    let startX = 0;
    let active = false;
    let startedNearTop = false;

    playerElement.addEventListener('touchstart', (e) => {
        if (!playerElement.classList.contains('expanded')) return;
        const t = e.touches[0];
        const rect = playerElement.getBoundingClientRect();
        const relY = t.clientY - rect.top;
        // Só começar o gesto se o toque iniciou perto do topo (handle)
        startedNearTop = relY <= 100; 
        if (!startedNearTop) return;
        active = true;
        startY = t.clientY;
        startX = t.clientX;
        playerElement.style.transition = 'none';
    }, { passive: true });

    playerElement.addEventListener('touchmove', (e) => {
        if (!active) return;
        const t = e.touches[0];
        const dy = t.clientY - startY;
        const dx = Math.abs(t.clientX - startX);
        // Só arrastar se movimento for predominantemente vertical e para baixo
        if (dy > 0 && dy > dx) {
            playerElement.style.transform = `translateY(${dy}px)`;
        }
    }, { passive: true });

    playerElement.addEventListener('touchend', (e) => {
        if (!active) return;
        const dy = e.changedTouches[0].clientY - startY;
        playerElement.style.transition = '';
        if (dy > 120) {
            // Fechar
            toggleExpandedPlayer();
            setTimeout(() => { playerElement.style.transform = ''; }, 200);
        } else {
            // Repor posição
            playerElement.style.transform = 'translateY(0)';
            setTimeout(() => { playerElement.style.transform = ''; }, 200);
        }
        active = false;
        startedNearTop = false;
    }, { passive: true });
}

    // Atualizar barra de progresso a cada segundo
    setInterval(updateProgressBar, 1000);

    // Gestos no player expandido (puxar para fechar)
    setupExpandedSwipe();

    try {
        document.addEventListener('click', ensureAudioContextRunning, { once: true, capture: true });
        document.addEventListener('touchstart', ensureAudioContextRunning, { once: true, passive: true, capture: true });
        document.addEventListener('keydown', ensureAudioContextRunning, { once: true, capture: true });
    } catch (_) {}

    window.addEventListener('resize', resizeWaveformCanvas);
    window.addEventListener('resize', setPlayerHeightVar);

    // Bind de drag na barra de progresso
    try { progressBarEl = document.querySelector('.progress-bar'); } catch (_) { progressBarEl = null; }
    setupProgressDrag();

    // Estado inicial dos badges da fila
    try { updateQueueBadges(); } catch (_) {}

    // Esconder botão comprar/apoiar inicialmente
    try { buyBtnEl = document.getElementById('buy-btn'); if (buyBtnEl) buyBtnEl.style.display = 'none'; } catch (_) {}

    // Definir altura do player para layout não cortar conteúdo
    setPlayerHeightVar();
}

/**
 * Reproduz uma música.
 * @param {number} trackId - O ID da música a reproduzir.
 */
export function playTrack(trackId) {
    const track = getTrackById(trackId);
    if (!track) return;
    const reqId = ++playReqId;

    // 1. Adicionar aos recentes
    addTrackToRecent(trackId);

    // 2. Parar a música atual
    if (currentAudio) {
        try { currentAudio.pause(); } catch (_) {}
        // Abortar qualquer carregamento pendente
        try { currentAudio.removeAttribute('src'); currentAudio.load(); } catch (_) {}
        try { if (currentAudio.parentNode) currentAudio.parentNode.removeChild(currentAudio); } catch (_) {}
        currentAudio = null;
    }

    // 3. Iniciar nova reprodução
    currentAudio = document.createElement('audio');
    try { currentAudio.crossOrigin = 'anonymous'; } catch (_) {}
    currentAudio.preload = 'metadata';
    currentAudio.controls = false;
    currentAudio.style.display = 'none';
    try { currentAudio.setAttribute('playsinline', ''); } catch (_) {}
    try { document.body.appendChild(currentAudio); } catch (_) {}
    currentAudio.muted = false;
    currentAudio.src = track.url;
window.currentAudio = currentAudio; // Atualizar a variável global exposta
    currentAudio.volume = volumeSlider.value / 100; // Aplicar volume atual
    setupVisualizerForCurrentAudio();
    audioFlowing = false;
    try {
        currentAudio.addEventListener('loadedmetadata', () => {
            try {
                const d = currentAudio.duration;
                if (isFinite(d) && d > 0) {
                    const durStr = formatTime(d);
                    if (track && (!track.duration || track.duration === '' || track.duration === '0:00')) {
                        try { track.duration = durStr; } catch (_) {}
                    }
                    try {
                        const raw = localStorage.getItem('radial_duration_cache') || '{}';
                        const cache = JSON.parse(raw);
                        cache[track.url] = durStr;
                        localStorage.setItem('radial_duration_cache', JSON.stringify(cache));
                    } catch (_) {}
                }
            } catch (_) {}
        });
    } catch (_) {}
    try {
        currentAudio.addEventListener('playing', () => { audioFlowing = true; });
        currentAudio.addEventListener('timeupdate', () => { if (currentAudio.currentTime > 0.2) audioFlowing = true; });
    } catch (_) {}
    
    currentAudio.onerror = () => {
        try { showToast('Erro ao carregar/decodificar áudio', 'error'); } catch (_) {}
        try { nextTrack(); } catch (_) {}
    };
    ensureAudioContextRunning();
    currentAudio.play()
        .then(() => {
            if (reqId !== playReqId) return; // Ignorar se outra música já foi pedida entretanto
            currentTrack = track;
            isPlaying = true;
            window.currentTrackId = track.id;
            window.isPlaying = true;
            try { playerElement.classList.add('playing'); } catch (_) {}
            updatePlayerUI();
            setPlayerHeightVar();
        })
        .catch(e => {
            if (e && e.name === 'AbortError') return;
            console.error('Erro ao reproduzir:', e);
            showToast('Erro ao reproduzir a música.', 'error');
        });
    
    // 4. Configurar evento 'ended'
    currentAudio.addEventListener('ended', handleEnded);
}

/**
 * Alterna entre reproduzir e pausar.
 */
export function togglePlay() {
    if (!currentAudio) return;

    if (isPlaying) {
        currentAudio.pause();
        playBtn.textContent = '▶️';
        isPlaying = false;
        window.isPlaying = false;
        try { playerElement.classList.remove('playing'); } catch (_) {}
    } else {
        ensureAudioContextRunning();
        try { currentAudio.play().catch(e => { if (!e || e.name !== 'AbortError') { try { console.error('Erro ao reproduzir:', e); } catch (_) {} } }); } catch (_) {}
        playBtn.textContent = '⏸️';
        isPlaying = true;
        window.isPlaying = true;
        try { playerElement.classList.add('playing'); } catch (_) {}
    }
}

/**
 * Avança para a próxima música.
 */
export function nextTrack() {
    // Repeat One - repetir a mesma música
    if (repeatMode === 'one' && currentTrack) {
        playTrack(currentTrack.id);
        return;
    }
    
    if (currentPlaylist && currentPlaylist.length > 0) {
        // Usar playlist shuffled se shuffle estiver ativo
        const playlist = shuffleMode ? shuffledPlaylist : currentPlaylist;
        
        // Próxima música da playlist
        currentPlaylistIndex = (currentPlaylistIndex + 1) % playlist.length;
        
        // Se chegou ao fim e repeat all está desativado, parar
        if (currentPlaylistIndex === 0 && repeatMode === 'off') {
            // Última música da playlist sem repeat
            return;
        }
        
        playTrack(playlist[currentPlaylistIndex]);
    } else {
        // Próxima música geral (sequencial ou shuffle)
        if (!currentTrack) return;
        
        const allTracks = tracks;
        const currentIndex = allTracks.findIndex(t => t.id === currentTrack.id);
        
        if (shuffleMode) {
            // Escolher música aleatória diferente da atual
            let randomIndex;
            do {
                randomIndex = Math.floor(Math.random() * allTracks.length);
            } while (randomIndex === currentIndex && allTracks.length > 1);
            
            playTrack(allTracks[randomIndex].id);
        } else {
            const nextIndex = (currentIndex + 1) % allTracks.length;
            
            // Se chegou ao fim e repeat all está desativado, parar
            if (nextIndex === 0 && repeatMode === 'off') {
                return;
            }
            
            playTrack(allTracks[nextIndex].id);
        }
    }
}

/**
 * Volta para a música anterior.
 */
export function previousTrack() {
    if (currentPlaylist && currentPlaylist.length > 0) {
        // Música anterior da playlist
        currentPlaylistIndex = currentPlaylistIndex === 0 ? currentPlaylist.length - 1 : currentPlaylistIndex - 1;
        playTrack(currentPlaylist[currentPlaylistIndex]);
    } else {
        // Música anterior geral (sequencial)
        if (!currentTrack) return;
        
        const allTracks = tracks;
        const currentIndex = allTracks.findIndex(t => t.id === currentTrack.id);
        const prevIndex = currentIndex === 0 ? allTracks.length - 1 : currentIndex - 1;
        playTrack(allTracks[prevIndex].id);
    }
}

/**
 * Alterna o estado expandido do player.
 */
export function toggleExpandedPlayer() {
    playerElement.classList.toggle('expanded');
    if (playerElement.classList.contains('expanded')) {
        resizeWaveformCanvas();
    }
    // Atualizar var de altura após aplicar classe
    try { requestAnimationFrame(setPlayerHeightVar); } catch(_) { setTimeout(setPlayerHeightVar, 0); }
}

/**
 * Define o volume do áudio.
 * @param {string} value - O valor do volume (0-100).
 */
export function setVolume(value) {
    const v = value / 100;
    if (outputGain) {
        try { outputGain.gain.value = v; } catch (_) {}
    }
    if (currentAudio) { currentAudio.volume = v; }
}

/**
 * Atualiza a barra de progresso e os tempos.
 */
function updateProgressBar() {
    if (!currentAudio || !currentAudio.duration) return;

    const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
    progressFill.style.width = progress + '%';
    
    currentTimeSpan.textContent = formatTime(currentAudio.currentTime);
    
    // A duração só é conhecida após o carregamento dos metadados
    if (isFinite(currentAudio.duration)) {
        totalTimeSpan.textContent = formatTime(currentAudio.duration);
    } else {
        totalTimeSpan.textContent = currentTrack ? currentTrack.duration : '0:00';
    }
}

/**
 * Procura uma posição na música ao clicar na barra de progresso.
 * @param {Event} event - O evento de clique.
 */
export function seekTo(event) {
    if (!currentAudio || !isFinite(currentAudio.duration)) return;
    try { event.preventDefault(); } catch (_) {}
    try { event.stopPropagation(); } catch (_) {}

    let el = event.currentTarget;
    if (!el || !el.getBoundingClientRect) {
        try {
            const t = event.target;
            if (t && t.closest) el = t.closest('.progress-bar');
        } catch (_) {}
    }
    if (!el || !el.getBoundingClientRect) return;

    const rect = el.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, (event.clientX - rect.left)));
    const percentage = rect.width ? (clickX / rect.width) : 0;

    const wasPlaying = !currentAudio.paused;
    const newTime = percentage * currentAudio.duration;
    if (isFinite(newTime)) {
        try { currentAudio.currentTime = newTime; } catch (_) {}
        if (wasPlaying && currentAudio.paused) {
            ensureAudioContextRunning();
            try { currentAudio.play().catch(() => {}); } catch (_) {}
        }
    }
}

/**
 * Atualiza a interface do player com os detalhes da música atual.
 */
function updatePlayerUI() {
    if (currentTrack) {
        const coverHtml = currentTrack.coverUrl
            ? `<img src="${currentTrack.coverUrl}" alt="${currentTrack.title}" class="track-cover-img">`
            : (currentTrack.cover || '🎵');
        playerCover.innerHTML = coverHtml;
        playerTitle.textContent = currentTrack.title;
        playerArtist.textContent = currentTrack.artist;
        playBtn.textContent = '⏸️';

        // Atualizar fundo dinâmico do player com a capa atual (se existir)
        if (currentTrack.coverUrl) {
            playerElement.style.setProperty('--player-bg', `url('${currentTrack.coverUrl}')`);
        } else {
            playerElement.style.removeProperty('--player-bg');
        }

        // Atualizar visibilidade do botão de compra/apoio
        updateBuyButtonVisibility();
    }
}

function findReleaseByTrackId(trackId) {
    try {
        if (!Array.isArray(releases) || !currentTrack || typeof trackId !== 'number') return null;
        for (const rel of releases) {
            if (rel && Array.isArray(rel.trackIds) && rel.trackIds.includes(trackId)) return rel;
        }
    } catch (_) {}
    return null;
}

function updateBuyButtonVisibility() {
    if (!buyBtnEl) {
        try { buyBtnEl = document.getElementById('buy-btn'); } catch (_) { buyBtnEl = null; }
    }
    if (!buyBtnEl || !currentTrack) return;
    const rel = findReleaseByTrackId(currentTrack.id);
    if (rel) {
        buyBtnEl.style.display = '';
        buyBtnEl.disabled = false;
    } else {
        buyBtnEl.style.display = 'none';
    }
}

function openBuyForCurrent() {
    if (!currentTrack) return;
    const rel = findReleaseByTrackId(currentTrack.id);
    if (!rel) {
        try { showToast('Sem release associado', 'info'); } catch (_) {}
        return;
    }
    // Direcionar sempre para a página do release para compra in-app
    if (typeof window.showReleaseDetails === 'function' && rel.id) {
        try { window.showReleaseDetails(rel.id); } catch (_) {}
    }
}

// --- Funções de Playlist ---

/**
 * Inicia a reprodução de uma playlist.
 * @param {Array<number>} playlistTracks - Array de IDs das músicas da playlist.
 */
export function playPlaylist(playlistTracks) {
    if (!playlistTracks || playlistTracks.length === 0) {
        showToast('Playlist vazia', 'info');
        return;
    }
    
    currentPlaylist = playlistTracks;
    currentPlaylistIndex = 0;
    playTrack(currentPlaylist[0]);
    showToast('A tocar playlist', 'success');
}

/**
 * Reproduz uma música específica de uma playlist.
 * @param {number} trackId - O ID da música.
 * @param {number} index - O índice da música na playlist.
 */
export function playTrackFromPlaylist(trackId, index) {
    // Assumimos que a playlist já está definida em showPlaylistDetails
    currentPlaylistIndex = index;
    playTrack(trackId);
}

// --- Funções de Shuffle e Repeat ---

/**
 * Alterna o modo shuffle.
 */
export function toggleShuffle() {
    shuffleMode = !shuffleMode;
    
    // Se ativar shuffle e houver uma playlist, embaralhar
    if (shuffleMode && currentPlaylist && currentPlaylist.length > 0) {
        // Criar cópia embaralhada da playlist atual
        shuffledPlaylist = [...currentPlaylist].sort(() => 0.5 - Math.random());
        
        // Garantir que a música atual fica na posição atual
        if (currentTrack) {
            const currentTrackId = currentTrack.id;
            const currentIndexInShuffled = shuffledPlaylist.indexOf(currentTrackId);
            
            if (currentIndexInShuffled !== -1) {
                // Trocar a música atual para a posição do índice atual
                [shuffledPlaylist[currentPlaylistIndex], shuffledPlaylist[currentIndexInShuffled]] = 
                [shuffledPlaylist[currentIndexInShuffled], shuffledPlaylist[currentPlaylistIndex]];
            }
        }
    }
    
    // Atualizar botão
    const shuffleBtn = document.querySelector('.control-btn.shuffle');
    if (shuffleBtn) {
        shuffleBtn.style.opacity = shuffleMode ? '1' : '0.5';
        shuffleBtn.style.color = shuffleMode ? '#1e90ff' : 'inherit';
    }
    
    showToast(shuffleMode ? '🔀 Shuffle ativado' : '🔀 Shuffle desativado', 'success');
}

/**
 * Alterna entre os modos de repeat (off -> all -> one -> off).
 */
export function toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(repeatMode);
    repeatMode = modes[(currentIndex + 1) % modes.length];
    
    const messages = {
        'off': '🔁 Repeat desativado',
        'all': '🔁 Repeat: Todas as músicas',
        'one': '🔂 Repeat: Uma música'
    };
    
    const emojis = {
        'off': '🔁',
        'all': '🔁',
        'one': '🔂'
    };
    
    // Atualizar botão
    const repeatBtn = document.querySelector('.control-btn.repeat');
    if (repeatBtn) {
        repeatBtn.textContent = emojis[repeatMode];
        repeatBtn.style.opacity = repeatMode === 'off' ? '0.5' : '1';
        repeatBtn.style.color = repeatMode !== 'off' ? '#1e90ff' : 'inherit';
    }
    
    showToast(messages[repeatMode], 'success');
}
