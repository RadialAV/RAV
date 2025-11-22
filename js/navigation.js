// js/navigation.js

import { showToast } from './utils.js';

const navContainer = document.getElementById('nav-container');
const sections = document.querySelectorAll('.section');
let history = ['home']; // Histórico de navegação para a funcionalidade "Voltar"
const swipeSurface = document.querySelector('.main-content') || document.body;
const EDGE_SWIPE_THRESHOLD = 30;
const SWIPE_DISTANCE_THRESHOLD = 60;
const MAX_VERTICAL_DRIFT = 30;
let globalBackBtn = document.getElementById('global-back-btn');

function updateGlobalBackVisibility() {
    if (!globalBackBtn) globalBackBtn = document.getElementById('global-back-btn');
    if (!globalBackBtn) return;
    try {
        globalBackBtn.style.display = history.length > 1 ? 'inline-block' : 'none';
    } catch (_) {}
}

function bindNavDelegation() {
    if (!navContainer) return;
    navContainer.addEventListener('click', (e) => {
        const btn = e.target && (e.target.closest ? e.target.closest('.nav-btn[data-section]') : null);
        if (!btn) return;
        e.preventDefault();
        const sec = btn.getAttribute('data-section') || '';
        if (!sec) return;
        if (sec === 'artists' || sec === 'videos') {
            try { if (window.showMusicWithFilter) { window.showMusicWithFilter(sec); return; } } catch(_) {}
            showSection('music');
            return;
        }
        showSection(sec);
    });
}

/**
 * Configura os gestos de swipe e expõe a função de navegação.
 */
export function setupNavigation() {
    setupSwipeGestures();
    window.showSection = showSection;
    window.goBack = goBack; // Expor função de voltar
    updateGlobalBackVisibility();
    try { bindNavDelegation(); } catch(_) {}
}

/**
 * Garante que o botão ativo fica visível no container de navegação.
 */
function ensureNavBtnVisible(btn) {
    if (!btn || !navContainer) return;
    const btnLeft = btn.offsetLeft;
    const btnWidth = btn.offsetWidth;
    const containerScroll = navContainer.scrollLeft;
    const containerWidth = navContainer.clientWidth;

    const targetLeft = btnLeft - (containerWidth - btnWidth) / 2;
    const clamped = Math.max(0, Math.min(targetLeft, navContainer.scrollWidth - containerWidth));

    navContainer.scrollTo({ left: clamped, behavior: 'smooth' });
}

/**
 * Configura gestos de swipe para mobile.
 */
function setupSwipeGestures() {
    let startX = 0;
    let startY = 0;
    let isSwiping = false;
    let active = false;

    swipeSurface.addEventListener('touchstart', function(e) {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        isSwiping = false;
        active = startX <= EDGE_SWIPE_THRESHOLD && !e.target.closest('.nav-container') && !e.target.closest('.nav-btn');
    }, { passive: true });

    swipeSurface.addEventListener('touchmove', function(e) {
        if (!active) return;
        const t = e.touches[0];
        const diffX = startX - t.clientX;
        const diffY = startY - t.clientY;

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffY) <= MAX_VERTICAL_DRIFT) {
            isSwiping = true;
        }
    }, { passive: true });

    swipeSurface.addEventListener('touchend', function(e) {
        if (!active) return;
        const endX = e.changedTouches[0].clientX;
        const diffX = startX - endX;

        if (isSwiping && diffX < -SWIPE_DISTANCE_THRESHOLD) {
            goBack();
        }

        startX = 0;
        startY = 0;
        isSwiping = false;
        active = false;
    });
}

/**
 * Navega para uma secção específica.
 * @param {string} sectionName - O nome da secção (e.g., 'home', 'favorites').
 * @param {boolean} isBack - Se a navegação é um "voltar" (para não adicionar ao histórico).
 */
export function showSection(sectionName, isBack = false) {
    if (sectionName === 'checkout') {
        try { if (window.openCheckout) window.openCheckout(); } catch(_) {}
        return;
    }
    // 0. Mapear pseudo-seções para a Biblioteca (tabs)
    let effectiveSection = sectionName;
    let libraryTab = null;
    if (sectionName === 'recent' || sectionName === 'favorites' || sectionName === 'playlists') {
        effectiveSection = 'library';
        libraryTab = sectionName;
    }

    // 1. Atualizar botões de navegação
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Usar data-section para seleção mais robusta (permite realçar 'recent', 'favorites', 'playlists')
    const clickedBtn = document.querySelector(`.nav-btn[data-section="${sectionName}"]`);
    if (clickedBtn) {
        clickedBtn.classList.add('active');
        
        // Scroll para o botão ativo em mobile
        if (window.innerWidth <= 768) {
            // Centrar sempre o botão ativo
            ensureNavBtnVisible(clickedBtn);
        }
    }
    
    // 2. Esconder todas as secções
    sections.forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    
    // 3. Mostrar secção alvo
    const targetSection = document.getElementById(effectiveSection + '-section');
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
    } else {
        showToast(`Secção "${sectionName}" não encontrada.`, 'error');
        return;
    }

    // 4. Gerir Histórico
    if (!isBack) {
        // Se a secção atual for a mesma que a última no histórico, não adiciona
        if (history[history.length - 1] !== sectionName) {
            history.push(sectionName);
        }
    }

    // 5. Se for uma tab da Biblioteca, selecionar a tab correspondente
    if (libraryTab && typeof window.setLibraryTab === 'function') {
        try { window.setLibraryTab(libraryTab); } catch (_) {}
    }

    // 6. Mostrar/ocultar as tabs da biblioteca conforme a origem e garantir apenas Recentes visível
    if (effectiveSection === 'library') {
        const tabsRow = document.querySelector('.library-tabs');
        if (tabsRow) {
            tabsRow.style.display = (libraryTab === 'recent') ? 'none' : 'flex';
        }
        if (libraryTab === 'recent') {
            const panelRecent = document.getElementById('library-panel-recent');
            const panelFav = document.getElementById('library-panel-favorites');
            const panelPl = document.getElementById('library-panel-playlists');
            if (panelRecent) panelRecent.style.display = '';
            if (panelFav) panelFav.style.display = 'none';
            if (panelPl) panelPl.style.display = 'none';
        }
    }
    updateGlobalBackVisibility();
}

/**
 * Volta para a secção anterior no histórico.
 */
export function goBack() {
    if (history.length > 1) {
        history.pop(); // Remove a secção atual
        const previousSection = history[history.length - 1];
        showSection(previousSection, true); // Navega para a anterior sem adicionar ao histórico
    } else {
        showToast('Já está na página inicial.', 'info');
    }
    updateGlobalBackVisibility();
}

