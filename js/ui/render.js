// js/ui/render.js

import { isFavorite, getTrackById, getReleaseByTrackId } from '../data.js';

/**
 * Cria o HTML para um cartão de música (track-card).
 * @param {object} track - O objeto da música.
 * @param {boolean} showActions - Se deve mostrar os botões de ação (favorito, playlist).
 * @returns {string} - O HTML do cartão.
 */
export function createTrackCard(track, showActions = true) {
    const isFav = isFavorite(track.id);
    const artistJS = JSON.stringify(String(track.artist || ''));
    const rel = getReleaseByTrackId(track.id);
    const actionsHtml = showActions ? `
        <div class="track-actions">
            <button class="action-btn" onclick="event.stopPropagation(); addToQueue(${track.id})" title="Adicionar à fila">➕</button>
            <button class="action-btn fav-btn-${track.id} ${isFav ? 'favorited' : ''}" 
                    onclick="event.stopPropagation(); toggleFavorite(${track.id})">
                ${isFav ? '❤️' : '🤍'}
            </button>
            <button class="action-btn add-to-playlist-btn" onclick="event.stopPropagation(); openAddToPlaylistModal(${track.id})" title="Adicionar à playlist">
                📁
            </button>
        </div>
    ` : '';

    // Usar imagem se disponível, senão letra
    const coverHtml = track.coverUrl 
        ? `<img src="${track.coverUrl}" alt="${track.title}" class="track-cover-img">`
        : track.cover;

    // Removido: badge/botão de Label nos cartões de música
    const labelBtn = '';

    return `
        <div class="track-card">
            <div class="track-cover" onclick="playTrack(${track.id})" title="Tocar">${coverHtml}</div>
            <div class="track-info">
                <div class="track-title">${rel ? `<a href="#" class="link" onclick="event.preventDefault(); event.stopPropagation(); showReleaseDetails('${rel.id}'); return false;">${track.title}</a>` : track.title}</div>
                <div class="track-artist"><a href="#" class="link artist-link" onclick='event.preventDefault(); event.stopPropagation(); showArtistDetails(${artistJS}); return false;'>${track.artist}</a></div>
                
            </div>
            ${actionsHtml}
        </div>
    `;
}

/**
 * Cria o HTML para um item de lista de música (track-item).
 * Usado em Recentes, Playlists e Detalhes de Artista/Release.
 * @param {object} track - O objeto da música.
 * @param {number} index - O índice da música na lista (para numeração).
 * @param {boolean} isPlaylistTrack - Se a música pertence a uma playlist (muda o onclick).
 * @param {boolean} showActions - Se deve mostrar os botões de ação (favorito, playlist).
 * @param {object} playlistControls - Controles específicos de playlist {playlistId, totalTracks}.
 * @returns {string} - O HTML do item.
 */
export function createTrackItem(track, index, isPlaylistTrack = false, showActions = false, playlistControls = null, opts = null) {
    const onclick = isPlaylistTrack 
        ? `playTrackFromPlaylist(${track.id}, ${index})` 
        : `playTrack(${track.id})`;

    const isFav = isFavorite(track.id);
    const artistJS = JSON.stringify(String(track.artist || ''));
    
    let actionsHtml = '';
    
    if (playlistControls) {
        // Botões de gestão de playlist
        const { playlistId, totalTracks } = playlistControls;
        const useDnD = !!(opts && opts.useDnD);
        const showUpBtn = !useDnD && index > 0;
        const showDownBtn = !useDnD && index < totalTracks - 1;
        
        actionsHtml = `
            <div class="track-actions playlist-actions">
                ${showUpBtn ? `<button class="action-btn" onclick="event.stopPropagation(); moveTrackUp(${playlistId}, ${track.id})" title="Mover para cima">↑</button>` : '<span class="action-spacer"></span>'}
                ${showDownBtn ? `<button class="action-btn" onclick="event.stopPropagation(); moveTrackDown(${playlistId}, ${track.id})" title="Mover para baixo">↓</button>` : '<span class="action-spacer"></span>'}
                <button class="action-btn remove-btn" onclick="event.stopPropagation(); removeTrackFromPlaylistUI(${playlistId}, ${track.id})" title="Remover da playlist">🗑️</button>
            </div>
        `;
    } else if (showActions) {
        actionsHtml = `
            <div class="track-actions">
                ${opts && opts.showBuy ? `<button class="action-btn" onclick="event.stopPropagation(); addToCart(${track.id})" title="Adicionar ao carrinho">🛒</button>` : ''}
                <button class="action-btn" onclick="event.stopPropagation(); addToQueue(${track.id})" title="Adicionar à fila">➕</button>
                <button class="action-btn fav-btn-${track.id} ${isFav ? 'favorited' : ''}" 
                        onclick="event.stopPropagation(); toggleFavorite(${track.id})">
                    ${isFav ? '❤️' : '🤍'}
                </button>
                <button class="action-btn add-to-playlist-btn" onclick="event.stopPropagation(); openAddToPlaylistModal(${track.id})" title="Adicionar à playlist">
                    📁
                </button>
            </div>
        `;
    }

    // Usar imagem se disponível, senão letra
    const coverHtml = track.coverUrl 
        ? `<img src="${track.coverUrl}" alt="${track.title}" class="track-cover-img">`
        : track.cover;

    const rel = getReleaseByTrackId(track.id);
    const titleHtml = (opts && opts.titleLinksToRelease && rel)
        ? `<a href="#" class="link" onclick="event.preventDefault(); event.stopPropagation(); showReleaseDetails('${rel.id}'); return false;">${track.title}</a>`
        : track.title;

    return `
        <div class="track-item" data-track-id="${track.id}" ${playlistControls ? `data-playlist-id="${playlistControls.playlistId}"` : ''}>
            ${index !== undefined ? `<div class="track-number">${index + 1}</div>` : ''}
            <div class="track-cover" onclick="${onclick}" title="Tocar">${coverHtml}</div>
            <div class="track-info">
                <div class="track-title">${titleHtml}</div>
                <div class="track-artist"><a href="#" class="link artist-link" onclick='event.preventDefault(); event.stopPropagation(); showArtistDetails(${artistJS}); return false;'>${track.artist}</a></div>
            </div>
            ${actionsHtml}
        </div>
    `;
}

/**
 * Cria o HTML para um cartão de vídeo.
 * @param {object} video - O objeto do vídeo.
 * @returns {string} - O HTML do cartão.
 */
export function createVideoCard(video) {
    console.log('🎬 Criando card para vídeo ID:', video.id);
    
    return `
        <div class="video-card" onclick="playVideo(${video.id}); console.log('Card clicado! ID: ${video.id}');">
            <div class="video-thumbnail" style="background-image: url('${video.thumbnail}');">
                <div class="play-overlay">
                    <div class="play-button">▶️</div>
                </div>
                <div class="video-duration">${video.duration}</div>
            </div>
            <div class="video-info">
                <div class="video-title">${video.title}</div>
                <div class="video-stats">
                    <span>👁️ ${video.views} visualizações</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Cria o HTML para um cartão de artista.
 * @param {string} artistName - O nome do artista.
 * @param {object} stats - Estatísticas do artista (opcional).
 * @returns {string} - O HTML do cartão.
 */
export function createArtistCard(artistName, stats = null) {
    // Obter iniciais do artista (primeiras letras)
    const initials = artistName
        .split(' ')
        .map(word => word[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
    
    const trackCount = stats ? stats.trackCount : '';
    const tracksText = stats ? `${trackCount} ${trackCount === 1 ? 'música' : 'músicas'}` : 'Ver músicas';
    
    return `
        <div class="artist-card" onclick='showArtistDetails(${JSON.stringify(artistName)})'>
            <div class="artist-avatar">${initials}</div>
            <div class="artist-info">
                <div class="artist-name">${artistName}</div>
                <div class="artist-meta">${tracksText}</div>
            </div>
        </div>
    `;
}

/**
 * Cria o HTML para um cartão de playlist.
 * @param {object} playlist - O objeto da playlist.
 * @returns {string} - O HTML do cartão.
 */
export function createPlaylistCard(playlist) {
    const firstTrackId = playlist.tracks && playlist.tracks.length ? playlist.tracks[0] : null;
    const firstTrack = firstTrackId ? getTrackById(firstTrackId) : null;
    const coverHtml = firstTrack && firstTrack.coverUrl
        ? `<img src="${firstTrack.coverUrl}" alt="${playlist.name}" class="track-cover-img">`
        : '📁';

    return `
        <div class="track-card" data-playlist-id="${playlist.id}" onclick="showPlaylistDetails(${playlist.id})" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showPlaylistDetails(${playlist.id});}">
            <div class="track-cover">${coverHtml}</div>
            <div class="track-info">
                <div class="track-title">${playlist.name}</div>
                <div class="track-artist">${playlist.tracks.length} músicas</div>
            </div>
            <div class="track-actions">
                <button class="action-btn" onclick="event.stopPropagation(); duplicatePlaylistUI(${playlist.id})" title="Duplicar playlist">📋</button>
                <button class="action-btn" onclick="event.stopPropagation(); editPlaylist(${playlist.id})" title="Editar playlist">✏️</button>
                <button class="action-btn" onclick="event.stopPropagation(); deletePlaylist(${playlist.id})" title="Eliminar playlist">🗑️</button>
            </div>
        </div>
    `;
}

// Exportar as funções para uso em outros módulos
export default {
    createTrackCard,
    createTrackItem,
    createVideoCard,
    createArtistCard,
    createPlaylistCard
};
