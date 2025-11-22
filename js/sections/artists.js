// js/sections/artists.js

import { getAllArtists, getTracksByArtist, getArtistStats, getArtistInitials, favorites, saveFavorites, updateFavoriteButtons } from '../data.js';
import { createArtistCard, createTrackItem } from '../ui/render.js';
import { showToast } from '../utils.js';
import { playPlaylist } from '../player.js';

const artistsGrid = document.getElementById('artists-grid');
const artistDetailsSection = document.getElementById('artist-details-section');
let currentArtist = null;
let currentArtistStats = null;

// Verificar se elementos existem
if (!artistsGrid) console.error('❌ Elemento #artists-grid não encontrado!');
if (!artistDetailsSection) console.error('❌ Elemento #artist-details-section não encontrado!');

/**
 * Inicializa a lógica da secção Artistas.
 */
export function initArtistsSection() {
    loadArtists();
    
    // Expor funções globais para o HTML
    window.showArtistDetails = showArtistDetails;
    window.playAllArtistTracks = playAllArtistTracks;
    window.addAllArtistToFavorites = addAllArtistToFavorites;
}

/**
 * Carrega e exibe a lista de artistas.
 */
function loadArtists() {
    console.log('🎨 Carregando artistas...');
    const artists = getAllArtists();
    console.log('👥 Artistas encontrados:', artists.length, artists);
    
    if (artists.length === 0) {
        artistsGrid.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1/-1;">Nenhum artista disponível.</p>';
        return;
    }

    artistsGrid.innerHTML = artists.map(artist => {
        const stats = getArtistStats(artist);
        console.log(`📊 Stats para ${artist}:`, stats);
        return createArtistCard(artist, stats);
    }).join('');
    
    console.log('✅ Artistas carregados com sucesso');
}

/**
 * Exibe os detalhes de um artista (layout minimal).
 * @param {string} artistName - O nome do artista.
 */
export function showArtistDetails(artistName) {
    currentArtist = artistName;
    currentArtistStats = getArtistStats(artistName);
    
    console.log('👥 Mostrando artista:', artistName);
    
    const initials = getArtistInitials(artistName);
    const artistTracks = getTracksByArtist(artistName);
    
    artistDetailsSection.innerHTML = `
        <button class="back-btn" onclick="(window.goBack ? goBack() : (window.showMusicWithFilter ? showMusicWithFilter('artists') : showSection('music')))">← Voltar</button>
        
        <div class="artist-header">
            <div class="artist-avatar-large">${initials}</div>
            <div class="artist-header-info">
                <h2 class="artist-title-large">👥 ${artistName}</h2>
                
                <div class="artist-meta-text">
                    <div class="artist-meta-line">
                        <strong>${currentArtistStats.trackCount} ${currentArtistStats.trackCount === 1 ? 'faixa' : 'faixas'}</strong>
                        <span class="meta-separator">•</span>
                        <strong>${currentArtistStats.totalDuration}</strong>
                        ${currentArtistStats.releases.length > 0 ? `
                            <span class="meta-separator">•</span>
                            <strong>${currentArtistStats.releases.map(r => r.title).join(', ')}</strong>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
        
        <div class="artist-actions">
            <button class="btn btn-primary" onclick="playAllArtistTracks()">▶️ Tocar Tudo</button>
            <button class="btn btn-secondary" onclick="addAllArtistToFavorites()">❤️ Favoritos</button>
        </div>
        
        <div class="artist-tracklist">
            <h3>🎵 Todas as Músicas (${currentArtistStats.trackCount})</h3>
            <div class="track-list">
                ${artistTracks.map((track, index) => createTrackItem(track, index, false, true, null, { titleLinksToRelease: true })).join('')}
            </div>
        </div>
    `;
    
    window.showSection('artist-details');
}

/**
 * Toca todas as músicas do artista.
 */
export function playAllArtistTracks() {
    if (!currentArtistStats || !currentArtistStats.trackIds) return;
    
    console.log('▶️ Tocando todas as músicas de', currentArtist);
    playPlaylist(currentArtistStats.trackIds);
    showToast(`A tocar ${currentArtist}`, 'success');
}

/**
 * Adiciona todas as músicas do artista aos favoritos.
 */
export function addAllArtistToFavorites() {
    if (!currentArtistStats || !currentArtistStats.trackIds) return;
    
    let added = 0;
    currentArtistStats.trackIds.forEach(trackId => {
        if (!favorites.includes(trackId)) {
            favorites.push(trackId);
            added++;
        }
    });
    
    if (added > 0) {
        saveFavorites();
        updateFavoriteButtons();
        showToast(`${added} músicas adicionadas aos favoritos`, 'success');
    } else {
        showToast('Todas as músicas já estão nos favoritos', 'info');
    }
}
