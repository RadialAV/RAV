// js/sections/favorites.js

import { getFavoriteTracks } from '../data.js';
import { createTrackItem } from '../ui/render.js';

const favoritesTracksContainer = document.getElementById('favorites-tracks');

/**
 * Inicializa a lógica da secção Favoritos.
 */
export function initFavoritesSection() {
    loadFavorites();
    
    // Expor a função globalmente para que possa ser chamada após alterações
    window.loadFavorites = loadFavorites;
}

/**
 * Carrega e exibe as músicas favoritas.
 */
function loadFavorites() {
    const favoriteTracksData = getFavoriteTracks();
    
    if (favoriteTracksData.length === 0) {
        favoritesTracksContainer.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1/-1;">Nenhuma música nos favoritos</p>';
        return;
    }

    favoritesTracksContainer.innerHTML = favoriteTracksData.map(track => {
        return createTrackItem(track, undefined, false, true, null, { titleLinksToRelease: true });
    }).join('');
}
