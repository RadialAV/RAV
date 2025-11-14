// js/sections/playlists.js

import { playlists, createPlaylist as dataCreatePlaylist, deletePlaylist as dataDeletePlaylist, updatePlaylist as dataUpdatePlaylist, getPlaylistById, addTrackToPlaylist, getTrackById, setPlaylistsUpdateCallback, removeTrackFromPlaylist, moveTrackInPlaylist, clearPlaylistTracks, duplicatePlaylist, savePlaylists } from '../data.js';
import { createPlaylistCard, createTrackItem } from '../ui/render.js';
import { openModal, closeModal, showToast } from '../utils.js';
import { playPlaylist } from '../player.js';

let playlistsGrid = null;
let playlistDetailsTitle = null;
let playlistDetailsTracks = null;
let addToPlaylistModal = null;
let playlistSelection = null;
let trackIdToAdd = null;
let playlistIdToEdit = null;
let currentPlaylistId = null; // Para rastrear qual playlist está sendo visualizada

/* * Inicializa a lógica da secção Playlists.
 *
 */
export function initPlaylistsSection() {
    // Obter elementos do DOM quando a secção for inicializada
    playlistsGrid = document.getElementById('playlists-grid');
    playlistDetailsTitle = document.getElementById('playlist-details-title');
    playlistDetailsTracks = document.getElementById('playlist-details-tracks');
    addToPlaylistModal = document.getElementById('addToPlaylistModal');
    playlistSelection = document.getElementById('playlist-selection');

    if (!playlistsGrid) {
        console.error('❌ ERRO: #playlists-grid não encontrado no DOM. A secção Playlists não pode ser carregada.');
        return;
    }

    loadPlaylists();
    setPlaylistsUpdateCallback(loadPlaylists);

    // Expor funções globais para o HTML
    window.loadPlaylists = loadPlaylists;
    window.openCreatePlaylistModal = openCreatePlaylistModal;
    window.closeCreatePlaylistModal = closeCreatePlaylistModal;
    window.createPlaylist = createPlaylist;
    window.showPlaylistDetails = showPlaylistDetails;
    window.deletePlaylist = deletePlaylist;
    window.editPlaylist = editPlaylist;
    window.openAddToPlaylistModal = openAddToPlaylistModal;
    window.closeAddToPlaylistModal = closeAddToPlaylistModal;
    window.addToPlaylist = addToPlaylist;
    window.openEditPlaylistModal = openEditPlaylistModal;
    window.closeEditPlaylistModal = closeEditPlaylistModal;
    window.savePlaylistEdit = savePlaylistEdit;
    window.removeTrackFromPlaylistUI = removeTrackFromPlaylistUI;
    window.moveTrackUp = moveTrackUp;
    window.moveTrackDown = moveTrackDown;
    window.clearPlaylistTracksUI = clearPlaylistTracksUI;
    window.duplicatePlaylistUI = duplicatePlaylistUI;

    // Delegar clique na grid para abrir detalhes (robusto a mudanças no HTML interno)
    try {
        if (playlistsGrid && !playlistsGrid.__delegateBound) {
            playlistsGrid.addEventListener('click', (e) => {
                const card = e.target && e.target.closest ? e.target.closest('.track-card') : null;
                if (!card) return;
                // Evitar quando clicar em botões de ação
                if (e.target && e.target.closest && e.target.closest('.action-btn')) return;
                const idAttr = card.getAttribute('data-playlist-id');
                const pid = idAttr ? Number(idAttr) : null;
                if (pid) {
                    showPlaylistDetails(pid);
                }
            });
            playlistsGrid.__delegateBound = true;
        }
    } catch (_) {}
}

/**
 * Carrega e exibe as playlists.
 */
function loadPlaylists() {
    if (playlists.length === 0) {
        playlistsGrid.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1/-1;">Nenhuma playlist criada</p>';
        return;
    }

    playlistsGrid.innerHTML = playlists.map(playlist => createPlaylistCard(playlist)).join('');
}

// --- Modais ---

export function openCreatePlaylistModal() {
    openModal('createPlaylistModal');
}

export function closeCreatePlaylistModal() {
    closeModal('createPlaylistModal');
}

export function closeAddToPlaylistModal() {
    closeModal('addToPlaylistModal');
}

// --- CRUD Playlists ---

/**
 * Cria uma nova playlist.
 * @param {Event} event - O evento de submissão do formulário.
 */
export function createPlaylist(event) {
    event.preventDefault();
    const name = document.getElementById('playlistName').value;
    const description = document.getElementById('playlistDescription').value;
    
    dataCreatePlaylist(name, description);
    closeCreatePlaylistModal();
    
    document.getElementById('playlistName').value = '';
    document.getElementById('playlistDescription').value = '';
    
    showToast(`Playlist "${name}" criada com sucesso!`, 'success');
}

/**
 * Exibe os detalhes de uma playlist.
 * @param {number} playlistId - O ID da playlist.
 */
export function showPlaylistDetails(playlistId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return;
    
    currentPlaylistId = playlistId; // Guardar ID da playlist atual
    window.currentPlaylistId = playlistId; // Expor globalmente para uso no HTML
    
    console.log('📁 Mostrando playlist:', playlist.name, 'com', playlist.tracks.length, 'músicas');
    
    playlistDetailsTitle.textContent = `📁 ${playlist.name}`;
    
    const playlistTracks = playlist.tracks.map(id => getTrackById(id)).filter(Boolean);
    
    console.log('✅ Músicas carregadas:', playlistTracks.length);
    
    if (playlistTracks.length === 0) {
        playlistDetailsTracks.innerHTML = '<p style="text-align: center; color: #666;">Playlist vazia</p>';
    } else {
        playlistDetailsTracks.innerHTML = playlistTracks.map((track, index) => 
            createTrackItem(track, index, true, false, {
                playlistId: playlistId,
                totalTracks: playlistTracks.length
            }, { titleLinksToRelease: true })
        ).join('');
        
        // Adicionar long press handlers a cada track-item
        setupLongPressHandlers(playlistId);
    }
    
    // Configurar botões de ação
    const playBtn = document.getElementById('play-playlist-btn');
    const clearBtn = document.getElementById('clear-playlist-btn');
    
    if (playlistTracks.length > 0) {
        playBtn.onclick = () => playPlaylist(playlist.tracks);
        playBtn.disabled = false;
        playBtn.style.display = 'inline-block';
        clearBtn.style.display = 'inline-block';
    } else {
        playBtn.disabled = true;
        playBtn.style.display = 'none';
        clearBtn.style.display = 'none';
    }
    
    window.showSection('playlist-details');
}

/**
 * Elimina uma playlist.
 * @param {number} playlistId - O ID da playlist.
 */
export function deletePlaylist(playlistId) {
    if (confirm('Tem a certeza que deseja eliminar esta playlist?')) {
        const playlist = getPlaylistById(playlistId);
        dataDeletePlaylist(playlistId);
        showToast(`Playlist "${playlist.name}" eliminada.`, 'info');
    }
}

/**
 * Abre o modal para adicionar uma música a uma playlist.
 * @param {number} trackId - O ID da música a adicionar.
 */
export function openAddToPlaylistModal(trackId) {
    trackIdToAdd = trackId;
    
    if (playlists.length === 0) {
        playlistSelection.innerHTML = '<p class="text-center mb-1">Não tem playlists. Crie uma primeiro.</p>';
    } else {
        playlistSelection.innerHTML = playlists.map(playlist => `
            <div class="track-item" onclick="addToPlaylist(${playlist.id})">
                <div class="track-cover">📁</div>
                <div class="track-info">
                    <div class="track-title">${playlist.name}</div>
                    <div class="track-artist">${playlist.tracks.length} músicas</div>
                </div>
            </div>
        `).join('');
    }
    
    openModal('addToPlaylistModal');
}

/**
 * Adiciona a música selecionada a uma playlist.
 * @param {number} playlistId - O ID da playlist.
 */
export function addToPlaylist(playlistId) {
    if (trackIdToAdd === null) return;
    
    const playlist = getPlaylistById(playlistId);
    const track = getTrackById(trackIdToAdd);
    
    if (addTrackToPlaylist(playlistId, trackIdToAdd)) {
        showToast(`"${track.title}" adicionada a "${playlist.name}"`, 'success');
    } else {
        showToast(`"${track.title}" já está em "${playlist.name}"`, 'info');
    }
    
    closeAddToPlaylistModal();
    trackIdToAdd = null;
    
    // Se estiver a ver os detalhes da playlist, recarrega
    if (document.getElementById('playlist-details-section').classList.contains('active')) {
        showPlaylistDetails(playlistId);
    }
}

/**
 * Abre o modal para editar uma playlist.
 * @param {number} playlistId - O ID da playlist.
 */
export function editPlaylist(playlistId) {
    openEditPlaylistModal(playlistId);
}

/**
 * Abre o modal de edição com os dados da playlist.
 * @param {number} playlistId - O ID da playlist.
 */
export function openEditPlaylistModal(playlistId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return;
    
    playlistIdToEdit = playlistId;
    document.getElementById('editPlaylistName').value = playlist.name;
    document.getElementById('editPlaylistDescription').value = playlist.description || '';
    
    openModal('editPlaylistModal');
}

/**
 * Fecha o modal de edição.
 */
export function closeEditPlaylistModal() {
    closeModal('editPlaylistModal');
    playlistIdToEdit = null;
}

/**
 * Guarda as alterações da playlist.
 * @param {Event} event - O evento de submissão do formulário.
 */
export function savePlaylistEdit(event) {
    event.preventDefault();
    
    if (playlistIdToEdit === null) return;
    
    const name = document.getElementById('editPlaylistName').value;
    const description = document.getElementById('editPlaylistDescription').value;
    
    if (dataUpdatePlaylist(playlistIdToEdit, name, description)) {
        closeEditPlaylistModal();
        showToast(`Playlist "${name}" atualizada com sucesso!`, 'success');
    } else {
        showToast('Erro ao atualizar playlist', 'error');
    }
}

// --- Gestão de Músicas na Playlist ---

/**
 * Remove uma música da playlist.
 * @param {number} playlistId - O ID da playlist.
 * @param {number} trackId - O ID da música.
 */
export function removeTrackFromPlaylistUI(playlistId, trackId) {
    console.log('🗑️ Tentando remover música:', trackId, 'da playlist:', playlistId);
    const track = getTrackById(trackId);
    if (!track) {
        console.error('❌ Música não encontrada:', trackId);
        return;
    }
    
    if (confirm(`Remover "${track.title}" desta playlist?`)) {
        if (removeTrackFromPlaylist(playlistId, trackId)) {
            console.log('✅ Música removida com sucesso');
            showToast(`"${track.title}" removida da playlist`, 'success');
            showPlaylistDetails(playlistId); // Recarregar detalhes
        } else {
            console.error('❌ Erro ao remover música');
            showToast('Erro ao remover música', 'error');
        }
    }
}

/**
 * Move uma música para cima na playlist.
 * @param {number} playlistId - O ID da playlist.
 * @param {number} trackId - O ID da música.
 */
export function moveTrackUp(playlistId, trackId) {
    console.log('↑ Movendo música', trackId, 'para cima na playlist', playlistId);
    if (moveTrackInPlaylist(playlistId, trackId, 'up')) {
        console.log('✅ Música movida com sucesso');
        showPlaylistDetails(playlistId); // Recarregar detalhes
    } else {
        console.log('❌ Não foi possível mover (já está no topo?)');
    }
}

/**
 * Move uma música para baixo na playlist.
 * @param {number} playlistId - O ID da playlist.
 * @param {number} trackId - O ID da música.
 */
export function moveTrackDown(playlistId, trackId) {
    console.log('↓ Movendo música', trackId, 'para baixo na playlist', playlistId);
    if (moveTrackInPlaylist(playlistId, trackId, 'down')) {
        console.log('✅ Música movida com sucesso');
        showPlaylistDetails(playlistId); // Recarregar detalhes
    } else {
        console.log('❌ Não foi possível mover (já está no fim?)');
    }
}

/**
 * Limpa todas as músicas da playlist.
 * @param {number} playlistId - O ID da playlist.
 */
export function clearPlaylistTracksUI(playlistId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return;
    
    if (confirm(`Remover todas as ${playlist.tracks.length} músicas de "${playlist.name}"?`)) {
        if (clearPlaylistTracks(playlistId)) {
            showToast('Playlist limpa com sucesso', 'success');
            showPlaylistDetails(playlistId); // Recarregar detalhes
        } else {
            showToast('Erro ao limpar playlist', 'error');
        }
    }
}

/**
 * Duplica uma playlist.
 * @param {number} playlistId - O ID da playlist.
 */
export function duplicatePlaylistUI(playlistId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return;
    
    const newId = duplicatePlaylist(playlistId);
    if (newId) {
        showToast(`Playlist "${playlist.name}" duplicada com sucesso!`, 'success');
        // Opcional: abrir a nova playlist
        // showPlaylistDetails(newId);
    } else {
        showToast('Erro ao duplicar playlist', 'error');
    }
}

// --- Long Press para Movimentação Rápida ---

let longPressTimer = null;
let longPressMenu = null;

/**
 * Configura handlers de long press em todos os track-items.
 * @param {number} playlistId - O ID da playlist atual.
 */
function setupLongPressHandlers(playlistId) {
    const trackItems = document.querySelectorAll('#playlist-details-tracks .track-item');
    
    trackItems.forEach((item, index) => {
        // Obter IDs a partir dos data-attributes (definidos em createTrackItem)
        const trackIdAttr = item.getAttribute('data-track-id');
        const trackId = trackIdAttr ? parseInt(trackIdAttr, 10) : NaN;
        if (!Number.isFinite(trackId)) return;
        const playlist = getPlaylistById(playlistId);
        const totalTracks = playlist ? playlist.tracks.length : 0;
        
        // Touch events
        item.addEventListener('touchstart', (e) => {
            // Ignorar se clicou num botão
            if (e.target.closest('.action-btn')) return;
            
            longPressTimer = setTimeout(() => {
                showLongPressMenu(e, playlistId, trackId, index, totalTracks);
            }, 500); // 500ms para ativar
        });
        
        item.addEventListener('touchend', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        
        item.addEventListener('touchmove', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        
        // Mouse events (para desktop)
        item.addEventListener('mousedown', (e) => {
            if (e.target.closest('.action-btn')) return;
            
            longPressTimer = setTimeout(() => {
                showLongPressMenu(e, playlistId, trackId, index, totalTracks);
            }, 500);
        });
        
        item.addEventListener('mouseup', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        
        item.addEventListener('mouseleave', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
    });
}

/**
 * Mostra menu de contexto com opções de movimento rápido.
 */
function showLongPressMenu(event, playlistId, trackId, currentIndex, totalTracks) {
    console.log('⏰ Long press ativado na música', trackId);
    
    // Vibração (se disponível)
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
    
    // Remover menu anterior se existir
    closeLongPressMenu();
    
    const track = getTrackById(trackId);
    if (!track) return;
    
    // Criar menu
    longPressMenu = document.createElement('div');
    longPressMenu.className = 'long-press-menu';
    longPressMenu.innerHTML = `
        <div class="long-press-header">
            <strong>${track.title}</strong>
            <button class="close-menu" onclick="window.closeLongPressMenu()">×</button>
        </div>
        <div class="long-press-actions">
            ${currentIndex > 0 ? `<button onclick="window.moveTrackToTop(${playlistId}, ${trackId})">⬆️ Mover para Topo</button>` : ''}
            ${currentIndex < totalTracks - 1 ? `<button onclick="window.moveTrackToBottom(${playlistId}, ${trackId})">⬇️ Mover para Fim</button>` : ''}
            <button onclick="window.removeTrackFromPlaylistUI(${playlistId}, ${trackId})" class="danger">🗑️ Remover</button>
        </div>
    `;
    
    document.body.appendChild(longPressMenu);
    
    // Animação de entrada
    setTimeout(() => longPressMenu.classList.add('show'), 10);
    
    // Fechar ao clicar fora
    setTimeout(() => {
        document.addEventListener('click', closeLongPressMenu, { once: true });
    }, 100);
}

/**
 * Fecha o menu de long press.
 */
function closeLongPressMenu() {
    if (longPressMenu) {
        longPressMenu.classList.remove('show');
        setTimeout(() => {
            if (longPressMenu && longPressMenu.parentNode) {
                longPressMenu.parentNode.removeChild(longPressMenu);
            }
            longPressMenu = null;
        }, 300);
    }
}

window.closeLongPressMenu = closeLongPressMenu;

/**
 * Move música para o topo da playlist.
 */
export function moveTrackToTop(playlistId, trackId) {
    console.log('⬆️ Movendo música para o TOPO');
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return;
    
    const currentIndex = playlist.tracks.indexOf(trackId);
    if (currentIndex <= 0) return; // Já está no topo
    
    // Remover da posição atual
    playlist.tracks.splice(currentIndex, 1);
    // Adicionar no início
    playlist.tracks.unshift(trackId);
    
    savePlaylists();
    showToast('Movida para o topo', 'success');
    closeLongPressMenu();
    showPlaylistDetails(playlistId);
}

window.moveTrackToTop = moveTrackToTop;

/**
 * Move música para o fim da playlist.
 */
export function moveTrackToBottom(playlistId, trackId) {
    console.log('⬇️ Movendo música para o FIM');
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return;
    
    const currentIndex = playlist.tracks.indexOf(trackId);
    if (currentIndex === -1 || currentIndex === playlist.tracks.length - 1) return; // Já está no fim
    
    // Remover da posição atual
    playlist.tracks.splice(currentIndex, 1);
    // Adicionar no fim
    playlist.tracks.push(trackId);
    
    savePlaylists();
    showToast('Movida para o fim', 'success');
    closeLongPressMenu();
    showPlaylistDetails(playlistId);
}

window.moveTrackToBottom = moveTrackToBottom;
