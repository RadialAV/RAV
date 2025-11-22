// js/utils.js

/**
 * Formata o tempo em segundos para o formato MM:SS.
 * @param {number} seconds - O tempo em segundos.
 * @returns {string} - O tempo formatado.
 */
export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Abre um link externo numa nova janela.
 * @param {string} url - O URL a abrir.
 */
export function openExternalLink(url) {
    try {
        const w = window.open(url, '_blank', 'noopener,noreferrer');
        if (w) w.opener = null;
    } catch (_) {
        window.open(url, '_blank');
    }
}

/**
 * Escapa texto para uso seguro em HTML (previne XSS via innerHTML).
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
    try {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    } catch (_) { return ''; }
}

/**
 * Exibe uma notificação toast.
 * @param {string} message - A mensagem a exibir.
 * @param {'info' | 'success' | 'error'} type - O tipo de notificação.
 */
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.error('Toast container not found');
        return;
    }

    // Remover toasts existentes para não acumular
    try {
        while (toastContainer.firstChild) toastContainer.removeChild(toastContainer.firstChild);
    } catch (_) {}

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Mostrar toast
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Esconder e remover toast
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { try { if (toast && toast.parentNode === toastContainer) toastContainer.removeChild(toast); } catch(_) {} }, 300);
    }, 3000);
}

/**
 * Abre um modal.
 * @param {string} modalId - O ID do modal.
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        // Adicionar listener para fechar ao clicar fora
        setTimeout(() => {
            modal.onclick = (event) => {
                if (event.target === modal) {
                    closeModal(modalId);
                }
            };
        }, 100);
    }
}

/**
 * Fecha um modal.
 * @param {string} modalId - O ID do modal.
 */
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.onclick = null; // Remover listener
    }
}

// Exportar as funções para uso em outros módulos
export default {
    formatTime,
    openExternalLink,
    escapeHtml,
    showToast,
    openModal,
    closeModal
};
