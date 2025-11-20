// js/sections/videos.js

import { videos } from '../data.js';
import { createVideoCard } from '../ui/render.js';
import { openModal, closeModal } from '../utils.js';

// Elementos do DOM serão obtidos quando a secção for inicializada.
let videosGrid = null;
let videoPlayerModal = null;
let videoPlayerContainer = null;
let videoModalTitle = null;

/**
 * Inicializa a lógica da secção Vídeos.
 */
export function initVideosSection() {
    // Obter elementos do DOM apenas quando a secção for inicializada (DOM já carregado)
    videosGrid = document.getElementById('videos-grid');
    videoPlayerModal = document.getElementById('video-player-modal');
    videoPlayerContainer = document.getElementById('video-player-container');
    videoModalTitle = document.getElementById('video-modal-title');

    if (!videosGrid) {
        console.error('❌ ERRO: #videos-grid não encontrado no DOM. A secção Vídeos não pode ser carregada.');
        return;
    }

    // Expor funções globalmente
    window.playVideo = playVideo;
    window.closeVideoPlayer = closeVideoPlayer;

    // Carregar os vídeos agora que temos os elementos
    loadVideos();

    console.log('✅ Secção Vídeos inicializada e funções expostas.');
}

/**
 * Carrega e exibe a lista de vídeos.
 */
function loadVideos() {
    if (videos.length === 0) {
        videosGrid.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1/-1;">Nenhum vídeo disponível.</p>';
        return;
    }

    videosGrid.innerHTML = videos.map(video => createVideoCard(video)).join('');
}

/**
 * Abre o player de vídeo embutido.
 * @param {number} videoId - ID do vídeo.
 */
export function playVideo(videoId) {
    console.log('🎬 playVideo chamado com ID:', videoId);
    console.log('📦 Vídeos disponíveis:', videos);
    
    const video = videos.find(v => v.id === videoId);
    if (!video) {
        console.error('❌ Vídeo não encontrado! ID:', videoId);
        return;
    }
    
    console.log('📹 Abrindo vídeo:', video.title);
    
    // Extrair ID do YouTube do URL
    const youtubeId = extractYouTubeId(video.url);
    
    // Atualizar título (opcional, já que não usamos modal)
    if (videoModalTitle) videoModalTitle.textContent = `📹 ${video.title}`;
    
    // Renderizar no modal existente
    if (videoModalTitle) videoModalTitle.textContent = `📹 ${video.title}`;
    if (videoPlayerContainer) {
        videoPlayerContainer.innerHTML = `
            <iframe 
                width="100%" 
                height="100%" 
                src="https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                loading="lazy"
                allowfullscreen>
            </iframe>
        `;
    }
    try { openModal('video-player-modal'); } catch (_) {}
    console.log('🎬 Player de vídeo em modal aberto.');
}

/**
 * Fecha o player de vídeo.
 */
export function closeVideoPlayer() {
    // Fechar modal e limpar iframe
    if (videoPlayerContainer) {
        videoPlayerContainer.innerHTML = '';
    }
    try { closeModal('video-player-modal'); } catch (_) {}
    // Recarregar a lista para garantir estado consistente
    try { loadVideos(); } catch (_) {}
    console.log('🎬 Player de vídeo fechado.');
}

/**
 * Extrai o ID do YouTube de um URL.
 * @param {string} url - URL do YouTube.
 * @returns {string} - ID do vídeo.
 */
function extractYouTubeId(url) {
    // Suporta vários formatos:
    // https://youtu.be/clIdkvweR5A?si=...
    // https://www.youtube.com/watch?v=clIdkvweR5A
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : '';
}
