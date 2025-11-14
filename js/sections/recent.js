// js/sections/recent.js

import { getRecentTracks, setRecentUpdateCallback } from '../data.js';
import { createTrackItem } from '../ui/render.js';

let recentTracksContainer = null;

/**
 * Inicializa a lógica da secção Recentes.
 */
export function initRecentSection() {
    recentTracksContainer = document.getElementById('recent-tracks');

    if (!recentTracksContainer) {
        console.error('❌ ERRO: #recent-tracks não encontrado no DOM. A secção Recentes não pode ser carregada.');
        return;
    }

    loadRecentTracks();

    // Expor a função globalmente para que possa ser chamada após alterações
    window.initRecentSection = loadRecentTracks;
    setRecentUpdateCallback(loadRecentTracks);
}

/**
 * Carrega e exibe as músicas reproduzidas recentemente.
 */
function loadRecentTracks() {
    const recentTracksData = getRecentTracks();
    
    if (recentTracksData.length === 0) {
        recentTracksContainer.innerHTML = '<p style="text-align: center; color: #666;">Nenhuma música reproduzida recentemente</p>';
        return;
    }

    recentTracksContainer.innerHTML = recentTracksData.map((track, index) => 
        createTrackItem(track, index, false, true, null, { titleLinksToRelease: true })
    ).join('');
}
