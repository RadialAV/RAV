export function initEventsSection() {
    const grid = document.getElementById('events-grid');
    if (!grid) {
        console.error('❌ ERRO: #events-grid não encontrado no DOM.');
        return;
    }

    // Embed único com fundo transparente (venue + eventos)
    grid.innerHTML = `
        <div class="events-actions" style="display:flex; justify-content:flex-end; margin-bottom:0.5rem;">
            <button id="refresh-events-btn" class="view-all-btn" title="Atualizar">🔄 Atualizar</button>
        </div>
        <div id="shotgun-widget-container">
        </div>
    `;

    renderEventsEmbed();

    const refreshBtn = document.getElementById('refresh-events-btn');
    if (refreshBtn) {
        refreshBtn.onclick = () => {
            refreshEventsWidget();
        };
    }

    // Carregar script do widget (necessário para alguns recursos)
    if (!document.getElementById('shotgun-widget-js')) {
        const sw = document.createElement('script');
        sw.id = 'shotgun-widget-js';
        sw.src = 'https://shotgun.live/widget.js';
        sw.async = true;
        document.body.appendChild(sw);
    }
}

function renderEventsEmbed() {
    const container = document.getElementById('shotgun-widget-container');
    if (!container) return;
    container.innerHTML = `
            <iframe src="https://shotgun.live/venues/radial-av?embedded=1&ui=dark&transparentBackground=1" allow="payment" loading="lazy" style="width:100%; height:800px; max-height:calc(100vh - 200px); border:0; color-scheme:none"></iframe>
    `;
}

function refreshEventsWidget() {
    // Re-renderiza o iframe para voltar ao estado inicial
    renderEventsEmbed();
}

