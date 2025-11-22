// js/app.js

import { loadData, setFavoriteUpdateCallback } from './data.js';
import { setupNavigation, showSection } from './navigation.js';
import { setupPlayer } from './player.js';
import { initHomeSection } from './sections/home.js';
import { initFavoritesSection } from './sections/favorites.js';
import { initRecentSection } from './sections/recent.js';
import { initPlaylistsSection } from './sections/playlists.js';
import { initReleasesSection } from './sections/releases.js';
import { initArtistsSection } from './sections/artists.js';
import { initVideosSection } from './sections/videos.js';
import { initLabelsSection } from './sections/labels.js';
import { initAdminSection } from './sections/admin.js';
import { initLabelAdminSection } from './sections/label_admin.js';
import { initMusicSection } from './sections/music.js';
import { initEventsSection } from './sections/events.js';
import { initNewsSection } from './sections/news.js';

/**
 * Inicializa a aplicação.
 */
// --- Callbacks de Atualização de UI ---

/**
 * Atualiza o estado do botão de favorito em toda a aplicação e a secção Favoritos.
 * @param {number} trackId - O ID da música.
 * @param {boolean} isAdded - Se a música foi adicionada (true) ou removida (false).
 */
function updateFavoriteButtons(trackId, isAdded) {
    // 1. Atualizar todos os botões de favorito na página
    const buttons = document.querySelectorAll(`.fav-btn-${trackId}`);
    buttons.forEach(button => {
        button.innerHTML = isAdded ? '❤️' : '🤍';
        button.classList.toggle('favorited', isAdded);
    });

    // 2. Sempre atualizar a secção Favoritos (mesmo que não esteja visível)
    // Isso garante que quando o utilizador navegar para Favoritos, verá os dados corretos
    if (window.loadFavorites) {
        window.loadFavorites();
    }
}

function wrapSectionTitleEmojis() {
    try {
        const els = document.querySelectorAll('.section-title, .section-header h3');
        els.forEach(el => {
            if (!el || el.querySelector('.btn-emoji')) return;
            const text = (el.textContent || '').trim();
            if (!text) return;
            const firstToken = text.split(/\s+/)[0] || '';
            const cp = firstToken.codePointAt(0) || 0;
            const isEmoji = (
                (cp >= 0x2600 && cp <= 0x27BF) || // Misc symbols
                (cp >= 0x2190 && cp <= 0x2BFF) || // Arrows, misc symbols
                (cp >= 0x1F300 && cp <= 0x1FAFF)   // Emoji ranges
            );
            if (!isEmoji) return;
            const rest = text.slice(firstToken.length).trimStart();
            el.innerHTML = `<span class="btn-emoji">${firstToken}</span> ${rest}`;
        });
    } catch(_) {}
}

/**
 * Inicializa a aplicação.
 */
async function initApp() {
    console.log('Radial AV Modular - Inicialização da Aplicação');
    setupThemeToggle();
    
    // 1. Carregar dados (tracks, videos) e estado (favorites, playlists, recent)
    await loadData();
    
    // 2. Configurar Player (precisa dos dados)
    setupPlayer();
    
    // 3. Configurar Navegação (precisa dos dados para as secções)
    setupNavigation();
    
    // 4. Inicializar Lógica das Secções
    // Ligar o callback de atualização de favoritos
    setFavoriteUpdateCallback(updateFavoriteButtons);

    initHomeSection();
    initFavoritesSection();
    initRecentSection();
    initPlaylistsSection();
    initReleasesSection();
    initArtistsSection();
    initMusicSection();
    initEventsSection();
    initNewsSection();
    initVideosSection();
    initLabelsSection();
    initAdminSection();
    initLabelAdminSection();
    setupDelegatedReleaseLinks();
    
    // Router simples por hash (ex.: #label=<id>)
    function handleHashRoute() {
        try {
            const h = String(window.location.hash || '');
            const m = h.match(/^#label=(.+)$/);
            if (m && m[1]) {
                const id = decodeURIComponent(m[1]);
                if (window.showLabelDetails) window.showLabelDetails(id);
                return;
            }
            if (h === '#label-admin') { if (window.showSection) window.showSection('label-admin'); return; }
            if (h === '#admin') { if (window.showSection) window.showSection('admin'); return; }
            if (h === '#checkout') { if (window.showSection) window.showSection('checkout'); return; }
        } catch (_) {}
        // fallback
        if (window.showSection) window.showSection('home');
    }

    // Mostrar secção por hash (ou Home)
    handleHashRoute();
    window.addEventListener('hashchange', handleHashRoute);

    // Evitar pull-to-refresh em mobile (scroll dentro do content apenas)
    setupPreventPullToRefresh();

    // Normalizar títulos: envolver emoji inicial em span para poder ocultar no mobile
    wrapSectionTitleEmojis();

    // Atualizar Admin ao clicar no botão de navegação
    try {
        const adminBtn = document.getElementById('nav-admin-btn');
        if (adminBtn) adminBtn.addEventListener('click', () => { try { initAdminSection(); } catch(_) {} });
    } catch(_) {}

    // Atualizar Label Admin ao clicar no botão
    try {
        const labBtn = document.getElementById('nav-labeladmin-btn');
        if (labBtn) labBtn.addEventListener('click', () => { try { initLabelAdminSection(); } catch(_) {} });
    } catch(_) {}

    // Biblioteca: tabs Recent/Favorites/Playlists
    setupLibraryTabs();

    // Atualizar resultados da secção Música após dados inicializados
    try { if (window.refreshMusicResults) window.refreshMusicResults(); } catch (_) {}

    const splash = document.getElementById('intro-splash');
    if (splash) {
        setTimeout(() => splash.classList.add('hidden'), 800);
        setTimeout(() => { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); }, 1400);
    }
}

// Iniciar a aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', initApp);

// Expor funções globais necessárias para o HTML (onclicks)
window.showSection = showSection;

// Funções de Player (serão expostas pelo player.js)
// window.playTrack = playTrack;
// window.togglePlay = togglePlay;
// window.nextTrack = nextTrack;
// window.previousTrack = previousTrack;
// window.toggleExpandedPlayer = toggleExpandedPlayer;
// window.seekTo = seekTo;
// window.setVolume = setVolume;

// --- Mobile UX helpers ---
function setupPreventPullToRefresh() {
    try {
        const el = document.querySelector('.main-content');
        if (el) {
            let startY = 0;
            let startTop = 0;
            el.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches.length === 1) {
                    startY = e.touches[0].clientY;
                    startTop = el.scrollTop || 0;
                }
            }, { passive: true });
            el.addEventListener('touchmove', (e) => {
                const t = e.touches && e.touches[0];
                if (!t) return;
                const dy = t.clientY - startY;
                // Se estamos no topo e a arrastar para baixo, impedir refresh da página
                if (startTop <= 0 && dy > 0) {
                    e.preventDefault();
                }
            }, { passive: false });
        }
        // Interceptar pull-to-refresh fora de áreas scrolláveis (ex.: header)
        let globalStartY = 0;
        document.addEventListener('touchstart', (e) => {
            const t = e.touches && e.touches[0];
            if (!t) return;
            globalStartY = t.clientY;
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            const t = e.touches && e.touches[0];
            if (!t) return;
            const dy = t.clientY - globalStartY;
            const insideMain = !!(e.target && e.target.closest && e.target.closest('.main-content'));
            // Se não estamos na área scrollável principal e há gesto para baixo no topo, impedir refresh
            if (!insideMain && dy > 0) {
                e.preventDefault();
            }
        }, { passive: false });
    } catch (_) {}
}
// window.playPlaylist = playPlaylist;
// window.playTrackFromPlaylist = playTrackFromPlaylist;
// window.toggleShuffle = toggleShuffle;
// window.toggleRepeat = toggleRepeat;
// window.playTrack = playTrack;
// window.togglePlay = togglePlay;
// window.nextTrack = nextTrack;
// window.previousTrack = previousTrack;
// window.toggleExpandedPlayer = toggleExpandedPlayer;
// window.seekTo = seekTo;
// window.setVolume = setVolume;

// Funções de UI/Dados (serão expostas pelos respetivos módulos)
import { openExternalLink, openModal, closeModal } from './utils.js';
import { toggleFavorite, addToCart } from './data.js';
import { openCreatePlaylistModal, closeCreatePlaylistModal, openAddToPlaylistModal, closeAddToPlaylistModal, addToPlaylist, showPlaylistDetails, editPlaylist, openEditPlaylistModal, closeEditPlaylistModal, savePlaylistEdit, removeTrackFromPlaylistUI, moveTrackUp, moveTrackDown, clearPlaylistTracksUI, duplicatePlaylistUI, createPlaylist as createPlaylistUI, deletePlaylist as deletePlaylistUI } from './sections/playlists.js';
import { showReleaseDetails, playAllReleaseTracks, addAllToFavorites as addAllReleaseToFavorites, openAddReleaseToPlaylistModal, shareRelease } from './sections/releases.js';
import { showArtistDetails, playAllArtistTracks, addAllArtistToFavorites } from './sections/artists.js';
import { playVideo, closeVideoPlayer } from './sections/videos.js';
import { performSearch, handleSearchKeyup } from './sections/home.js';

window.openExternalLink = openExternalLink;
window.toggleFavorite = toggleFavorite;
window.addToCart = addToCart;
window.openCreatePlaylistModal = openCreatePlaylistModal;
window.closeCreatePlaylistModal = closeCreatePlaylistModal;
window.createPlaylist = createPlaylistUI;
window.openAddToPlaylistModal = openAddToPlaylistModal;
window.closeAddToPlaylistModal = closeAddToPlaylistModal;
window.addToPlaylist = addToPlaylist;
window.showPlaylistDetails = showPlaylistDetails;
window.editPlaylist = editPlaylist;
window.openEditPlaylistModal = openEditPlaylistModal;
window.closeEditPlaylistModal = closeEditPlaylistModal;
window.savePlaylistEdit = savePlaylistEdit;
window.deletePlaylist = deletePlaylistUI;
window.removeTrackFromPlaylistUI = removeTrackFromPlaylistUI;
window.moveTrackUp = moveTrackUp;
window.moveTrackDown = moveTrackDown;
window.clearPlaylistTracksUI = clearPlaylistTracksUI;
window.duplicatePlaylistUI = duplicatePlaylistUI;
window.showReleaseDetails = showReleaseDetails;
window.playAllReleaseTracks = playAllReleaseTracks;
window.addAllToFavorites = addAllReleaseToFavorites;
window.openAddReleaseToPlaylistModal = openAddReleaseToPlaylistModal;
window.shareRelease = shareRelease;
window.showArtistDetails = showArtistDetails;
window.playAllArtistTracks = playAllArtistTracks;
window.addAllArtistToFavorites = addAllArtistToFavorites;
window.playVideo = playVideo;
window.closeVideoPlayer = closeVideoPlayer;
window.performSearch = performSearch;
window.handleSearchKeyup = handleSearchKeyup;
window.openModal = openModal;
window.closeModal = closeModal;

let __relLinksBound = false;
function setupDelegatedReleaseLinks() {
    if (__relLinksBound) return;
    __relLinksBound = true;
    document.addEventListener('click', (e) => {
        const relEl = e.target && (e.target.closest ? e.target.closest('[data-rel-id]') : null);
        if (relEl) {
            e.preventDefault();
            e.stopPropagation();
            const rid = relEl.getAttribute('data-rel-id') || '';
            if (rid && typeof window.showReleaseDetails === 'function') {
                try { window.showReleaseDetails(String(rid)); } catch (_) {}
            }
            return;
        }
        const extEl = e.target && (e.target.closest ? e.target.closest('[data-external-link]') : null);
        if (extEl) {
            e.preventDefault();
            e.stopPropagation();
            const url = extEl.getAttribute('data-external-link') || '';
            if (url && typeof window.openExternalLink === 'function') {
                try { window.openExternalLink(String(url)); } catch (_) {}
            }
            return;
        }
        const artistEl = e.target && (e.target.closest ? e.target.closest('a.artist-link[data-artist]') : null);
        if (artistEl) {
            e.preventDefault();
            e.stopPropagation();
            const name = artistEl.getAttribute('data-artist') || '';
            if (name && typeof window.showArtistDetails === 'function') {
                try { window.showArtistDetails(String(name)); } catch (_) {}
            }
        }
    }, true);
}

// ---- Biblioteca (tabs) ----
function setupLibraryTabs() {
    const btns = document.querySelectorAll('.library-tab-btn');
    if (btns && btns.length) {
        btns.forEach(btn => {
            btn.addEventListener('click', () => setLibraryTab(btn.dataset.tab));
        });
    }
}

export function setLibraryTab(tab) {
    const panels = {
        recent: document.getElementById('library-panel-recent'),
        favorites: document.getElementById('library-panel-favorites'),
        playlists: document.getElementById('library-panel-playlists')
    };
    Object.values(panels).forEach(p => { if (p) p.style.display = 'none'; });
    if (panels[tab]) panels[tab].style.display = '';

    const btns = document.querySelectorAll('.library-tab-btn');
    btns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    // Refresh conteúdo da tab ativa
    try {
        if (tab === 'recent' && window.initRecentSection) window.initRecentSection();
        if (tab === 'favorites' && window.loadFavorites) window.loadFavorites();
        if (tab === 'playlists' && window.loadPlaylists) window.loadPlaylists();
    } catch (_) {}
}

window.setLibraryTab = setLibraryTab;

// --- Tema (Light/Dark) ---
function applyTheme(theme) {
    const root = document.documentElement;
    const btn = document.getElementById('theme-toggle');
    if (theme === 'light') {
        root.setAttribute('data-theme', 'light');
        if (btn) btn.textContent = '🌙';
    } else {
        root.removeAttribute('data-theme');
        if (btn) btn.textContent = '☀️';
    }
}

function setupThemeToggle() {
    // Determinar tema inicial
    const saved = localStorage.getItem('theme');
    let theme = saved === 'light' || saved === 'dark' ? saved : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    applyTheme(theme);

    // Lidar com click no botão
    const btn = document.getElementById('theme-toggle');
    if (btn) {
        btn.addEventListener('click', () => {
            theme = (document.documentElement.getAttribute('data-theme') === 'light') ? 'dark' : 'light';
            applyTheme(theme);
            localStorage.setItem('theme', theme);
        });
    }
}
