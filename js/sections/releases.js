// js/sections/releases.js

import { releases, getTrackById, getReleaseById, addAllReleaseTracksToFavorites, getPlaylistById, playlists, savePlaylists, updatePlaylistsSection, addToCart, getTrackPrice, getReleasePrice } from '../data.js';
import { getSupabaseClient } from '../supabase.js';
import { createTrackItem } from '../ui/render.js';
import { showToast, openExternalLink, escapeHtml } from '../utils.js';
import { playPlaylist } from '../player.js';

let releasesGrid = null;
let releaseDetailsSection = null;
let currentRelease = null;
let labelsMeta = [];
let labelsMetaLoaded = false;

// Helpers locais (substituem os removidos de data.js)
function getReleaseTracksCount(release) {
    if (!release || !Array.isArray(release.trackIds)) return 0;
    return release.trackIds.length;
}

async function ensureLabelsMeta(){
  if (labelsMetaLoaded) return;
  try {
    const supa = await getSupabaseClient();
    if (supa) {
      const { data, error } = await supa.from('labels').select('id,name,logo_url').order('name');
      if (!error && Array.isArray(data)) {
        labelsMeta = data.map(x => ({ id: x.id, name: x.name || 'Label', logo_url: x.logo_url || '' }));
        labelsMetaLoaded = true;
      }
    }
  } catch(_) {}
}

function getReleaseLabelName(rel){
  try {
    if (!rel) return '';
    if (rel.labelId && labelsMeta && labelsMeta.length) {
      const l = labelsMeta.find(x => String(x.id) === String(rel.labelId));
      if (l && l.name) return l.name;
    }
    if (rel.credits) {
      const c = rel.credits;
      return c.label || c.Label || c.editora || c.publisher || '';
    }
  } catch(_) {}
  return '';
}

function getReleaseArtistsCount(release) {
    if (!release || !Array.isArray(release.trackIds)) return 0;
    const artists = new Set();
    try {
        release.trackIds.forEach(id => {
            const t = getTrackById(id);
            if (t && t.artist) artists.add(t.artist);
        });
    } catch (_) {}
    return artists.size;
}

/**
 * Inicializa a lógica da secção Releases.
 */
export function initReleasesSection() {
    // Obter elementos do DOM quando a secção for inicializada
    releasesGrid = document.getElementById('releases-grid');
    releaseDetailsSection = document.getElementById('release-details-section');

    if (!releasesGrid) {
        console.error('❌ ERRO: #releases-grid não encontrado no DOM. A secção Releases não pode ser carregada.');
        return;
    }

    (async () => { await ensureLabelsMeta(); loadReleases(); })();

    // Expor funções globais para o HTML
    window.showReleaseDetails = showReleaseDetails;
    window.playAllReleaseTracks = playAllReleaseTracks;
    window.addAllToFavorites = addAllToFavorites;
    window.openAddReleaseToPlaylistModal = openAddReleaseToPlaylistModal;
    window.shareRelease = shareRelease;
}

/**
 * Carrega e exibe os releases.
 */
function loadReleases() {
    if (releases.length === 0) {
        releasesGrid.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1/-1;">Nenhum release disponível</p>';
        return;
    }

    releasesGrid.innerHTML = releases.map(release => createReleaseCard(release)).join('');
}

/**
 * Cria o HTML para um cartão de release.
 * @param {object} release - O objeto do release.
 * @returns {string} - O HTML do cartão.
 */
function createReleaseCard(release) {
    const comingSoonBadge = release.comingSoon ? '<span class="coming-soon-badge">Em Breve</span>' : '';
    const tracksCount = getReleaseTracksCount(release);
    const opacity = release.comingSoon ? 'opacity: 0.6;' : '';
    
    // Usar imagem se disponível, senão letra
    const titleEsc = escapeHtml(release.title || '');
    const coverHtml = release.coverUrl 
        ? `<img src="${escapeHtml(release.coverUrl)}" alt="${titleEsc}" class="release-cover-img" loading="lazy">`
        : release.cover;
    // Removido: badge/botão de Label nos cartões de release
    
    const relIdAttr = escapeHtml(String(release.id || ''));
    return `
        <div class="release-card" data-rel-id="${relIdAttr}" style="${opacity}">
            ${comingSoonBadge}
            <div class="release-cover">${coverHtml}</div>
            <div class="release-info">
                <div class="release-title">${titleEsc}</div>
                <div class="release-meta">${tracksCount} faixas • ${escapeHtml(String(release.year || ''))}</div>
            </div>
        </div>
    `;
}

/**
 * Exibe os detalhes completos de um release.
 * @param {string} releaseId - O ID do release.
 */
export function showReleaseDetails(releaseId) {
    const release = getReleaseById(releaseId);
    if (!release) return;
    
    if (release.comingSoon) {
        showToast('Este release ainda está em produção', 'info');
        return;
    }
    
    currentRelease = release;
    console.log('📀 Mostrando release:', release.title);
    
    // Construir HTML do cabeçalho
    const tracksCount = getReleaseTracksCount(release);
    const artistsCount = getReleaseArtistsCount(release);
    
    // Usar imagem se disponível, senão letra
    const titleEsc = escapeHtml(release.title || '');
    const coverLargeHtml = release.coverUrl 
        ? `<img src="${escapeHtml(release.coverUrl)}" alt="${titleEsc}" class="release-cover-large-img" loading="lazy">`
        : release.cover;
    const subtitleHtml = release.subtitle ? `<p class="release-subtitle">${escapeHtml(release.subtitle)}</p>` : '';
    const descriptionHtml = release.description ? `
        <div class="release-description">
            <h3>📝 Sobre o Release</h3>
            <p>${escapeHtml(release.description)}</p>
        </div>
    ` : '';

    // CTA principal: Comprar (venda direta na app) com preço de release
    const priceRel = getReleasePrice(release);
    const eur = (n) => `${n.toFixed(2).replace('.', ',')} €`;
    const buyBtn = `<button class="btn btn-primary" data-action="buy" onclick="openPurchaseReleaseModal()"><span class="btn-emoji">🛒</span><span class="btn-text"> Buy</span><span class="btn-aux"> • ${eur(priceRel)}</span></button>`;

    releaseDetailsSection.innerHTML = `
        <button class="back-btn" onclick="(window.goBack ? goBack() : (window.showMusicWithFilter ? showMusicWithFilter('releases') : showSection('music')))">← Voltar</button>
        
        <div class="release-header">
            <div class="release-cover-large">${coverLargeHtml}</div>
            <div class="release-header-info">
                <h2 class="release-title-large">💿 ${titleEsc}</h2>
                ${subtitleHtml}
                
                <div class="release-meta-text">
                    <div class="release-meta-line">
                        <strong>${tracksCount} faixas</strong>
                        <span class="meta-separator">•</span>
                        <strong>${artistsCount} artistas</strong>
                        <span class="meta-separator">•</span>
                        <strong>${escapeHtml(String(release.totalDuration || ''))}</strong>
                        <span class="meta-separator">•</span>
                        <strong>${escapeHtml(String(release.year || ''))}</strong>
                    </div>
                    <div class="release-meta-line">
                        <span class="emoji">🎵</span>
                        ${escapeHtml((release.genres || []).join(', '))}
                    </div>
                    ${renderLinksInline(release)}
                </div>
            </div>
        </div>
        
        <div class="release-actions">
            ${buyBtn}
            <button class="btn btn-secondary" data-action="play" onclick="playAllReleaseTracks()"><span class="btn-emoji">▶️</span><span class="btn-text"> Tocar Tudo</span></button>
            <button class="btn btn-secondary" data-action="favorite" onclick="addAllToFavorites()"><span class="btn-emoji">❤️</span><span class="btn-text"> Favoritos</span></button>
            <button class="btn btn-secondary" data-action="playlist" onclick="openAddReleaseToPlaylistModal()"><span class="btn-emoji">📁</span><span class="btn-text"> Playlist</span></button>
            <button class="btn btn-secondary" data-action="share" onclick="shareRelease()"><span class="btn-emoji">🔗</span><span class="btn-text"> Partilhar</span></button>
        </div>
        
        ${descriptionHtml}
        
        ${renderReleaseCredits(release)}
        
        <div class="release-tracklist">
            <h3>🎵 Tracklist (${tracksCount} faixas)</h3>
            <div class="track-list" id="release-tracks-list">
                ${renderReleaseTracks(release)}
            </div>
        </div>
    `;
    
    window.showSection('release-details');
}

/**
 * Renderiza as músicas do release.
 */
function renderReleaseTracks(release) {
    const releaseTracks = release.trackIds.map(id => getTrackById(id)).filter(Boolean);
    return releaseTracks.map((track, index) => 
        createTrackItem(track, index, false, true, null, { showBuy: true })
    ).join('');
}

// --- Modal de Compra do Release ---
export function openPurchaseReleaseModal() {
    if (!currentRelease) return;
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'purchase-release-modal';

    const tracks = currentRelease.trackIds.map(id => getTrackById(id)).filter(Boolean);
    const eur = (n) => `${n.toFixed(2).replace('.', ',')} €`;
    const relPrice = getReleasePrice(currentRelease);

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">🛒 Comprar "${escapeHtml(currentRelease.title)}"</h3>
                <button class="modal-close" onclick="closePurchaseReleaseModal()">×</button>
            </div>
            <div class="modal-body" style="display:flex; flex-direction:column; gap:0.75rem;">
                <button class="btn btn-primary" data-action="buy" onclick="window.__buyFullRelease()">🛒 Adicionar Release inteiro ao carrinho • ${eur(relPrice)}</button>
                <div class="divider" style="height:1px; background: var(--border);"></div>
                <div>
                    <h4 style="margin:0 0 0.5rem;">Comprar Faixas</h4>
                    <div class="track-list">
                        ${tracks.map((t, i) => `
                            <div class="track-item" style="align-items:center;">
                                <div class="track-number">${i+1}</div>
                                <div class="track-info">
                                    <div class="track-title">${escapeHtml(t.title)}</div>
                                    <div class="track-artist">${escapeHtml(t.artist)}</div>
                                </div>
                                <div class="track-actions">
                                    <span style="margin-right:0.5rem; color: var(--muted);">${eur(getTrackPrice(t))}</span>
                                    <button class="action-btn" data-action="buy" onclick="event.stopPropagation(); addToCart(${t.id}); try{ if(window.updateCartBadge) window.updateCartBadge(); }catch(_){}" title="Adicionar ao carrinho">🛒</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    window.closePurchaseReleaseModal = () => { try { modal.remove(); } catch(_) {} };
    window.__buyFullRelease = () => {
        try { currentRelease.trackIds.forEach(id => addToCart(id)); } catch(_) {}
        try { if (window.updateCartBadge) window.updateCartBadge(); } catch(_) {}
        try { showToast('Release adicionado ao carrinho', 'success'); } catch(_) {}
    };
}

window.openPurchaseReleaseModal = openPurchaseReleaseModal;

/**
 * Renderiza os links inline (minimal).
 * TODO: Tornar links clicáveis quando URLs reais estiverem disponíveis
 * Atualmente apenas decorativo (texto simples)
 */
function renderLinksInline(release) {
    if (!release.links || Object.keys(release.links).length === 0) return '';
    
    // TODO: Converter para links clicáveis
    // Exemplo: linkTexts.map(link => `<a href="${link.url}" target="_blank">${link.name}</a>`)
    const linkTexts = [];
    if (release.links.bandcamp) linkTexts.push('Bandcamp');
    if (release.links.spotify) linkTexts.push('Spotify');
    if (release.links.instagram) linkTexts.push('Instagram');
    if (release.links.soundcloud) linkTexts.push('SoundCloud');
    
    return `
        <div class="release-meta-line">
            <span class="emoji">🔗</span>
            ${linkTexts.join(' • ')}
        </div>
    `;
}

/**
 * Renderiza os créditos do release.
 */
function renderReleaseCredits(release) {
    if (!release.credits) return '';
    const credits = release.credits;
    const getField = (key) => {
        try {
            if (!credits) return '';
            if (Array.isArray(credits)) {
                const found = credits.find(e => (String(e.role || '').toLowerCase() === key));
                return found ? (found.name || found.value || '') : '';
            }
            return credits[key] || '';
        } catch (_) { return ''; }
    };
    const m = getField('mastering');
    const a = getField('artwork');
    const c = getField('compilation');
    if (!m && !a && !c) return '';

    return `
        <div class="release-credits">
            <h4>👥 Créditos</h4>
            <ul class="credits-list">
                ${m ? `<li><strong>Mastering:</strong> ${m}</li>` : ''}
                ${a ? `<li><strong>Artwork:</strong> ${a}</li>` : ''}
                ${c ? `<li><strong>Compilation:</strong> ${c}</li>` : ''}
            </ul>
        </div>
    `;
}

/**
 * Toca todas as músicas do release.
 */
export function playAllReleaseTracks() {
    if (!currentRelease || !currentRelease.trackIds) return;
    
    console.log('▶️ Tocando todas as músicas do release');
    playPlaylist(currentRelease.trackIds);
    showToast(`A tocar ${currentRelease.title}`, 'success');
}

/**
 * Adiciona todas as músicas do release aos favoritos.
 */
export function addAllToFavorites() {
    if (!currentRelease) return;
    
    const added = addAllReleaseTracksToFavorites(currentRelease.id);
    
    if (added > 0) {
        showToast(`${added} músicas adicionadas aos favoritos`, 'success');
    } else {
        showToast('Todas as músicas já estão nos favoritos', 'info');
    }
}

/**
 * Abre modal para adicionar release a uma playlist.
 */
export function openAddReleaseToPlaylistModal() {
    if (!currentRelease || !currentRelease.trackIds || playlists.length === 0) {
        showToast('Cria uma playlist primeiro', 'info');
        return;
    }
    
    // Criar modal simples
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'add-release-to-playlist-modal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">📁 Adicionar Release a Playlist</h3>
                <button class="modal-close" onclick="closeAddReleaseToPlaylistModal()">×</button>
            </div>
            <div class="playlist-selection">
                ${playlists.map(pl => `
                    <button class="playlist-select-btn" onclick="addReleaseToPlaylist(${pl.id})">
                        📁 ${pl.name} (${pl.tracks.length} músicas)
                    </button>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    window.closeAddReleaseToPlaylistModal = () => {
        modal.remove();
    };
    
    window.addReleaseToPlaylist = (playlistId) => {
        const playlist = getPlaylistById(playlistId);
        if (!playlist || !currentRelease) return;
        
        let added = 0;
        currentRelease.trackIds.forEach(trackId => {
            if (!playlist.tracks.includes(trackId)) {
                playlist.tracks.push(trackId);
                added++;
            }
        });
        
        if (added > 0) {
            // Persistir e atualizar UI
            try { savePlaylists(); } catch (_) {}
            try { updatePlaylistsSection && updatePlaylistsSection(); } catch (_) {}
            showToast(`${added} músicas adicionadas a "${escapeHtml(playlist.name)}"`, 'success');
        } else {
            showToast('Todas as músicas já estão na playlist', 'info');
        }
        
        modal.remove();
    };
}

/**
 * Partilha o release.
 */
export function shareRelease() {
    if (!currentRelease) return;
    
    const shareText = `${currentRelease.title} - ${currentRelease.subtitle}\n${getReleaseTracksCount(currentRelease)} faixas de música eletrónica`;
    
    if (navigator.share) {
        navigator.share({
            title: currentRelease.title,
            text: shareText,
            url: window.location.href
        }).then(() => {
            showToast('Partilhado com sucesso', 'success');
        }).catch(() => {
            fallbackShare(shareText);
        });
    } else {
        fallbackShare(shareText);
    }
}

function fallbackShare(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Link copiado para a área de transferência', 'success');
    }).catch(() => {
        showToast('Não foi possível partilhar', 'error');
    });
}
