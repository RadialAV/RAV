import { escapeHtml } from '../utils.js';
let gridRef = null;

export function initNewsSection() {
    gridRef = document.getElementById('news-grid');
    if (!gridRef) return;
    loadNews();
}

export async function loadNews() {
    if (!gridRef) return;
    const token = window.INSTAGRAM_ACCESS_TOKEN || localStorage.getItem('instagram_access_token');
    if (!token) {
        gridRef.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#b3b3b3;">Liga a tua conta do Instagram para mostrar os últimos posts. Define o token com <code>localStorage.setItem('instagram_access_token', 'SEU_TOKEN')</code> e recarrega.</p>`;
        return;
    }
    try {
        const url = `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=10&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch_error');
        const json = await res.json();
        const items = Array.isArray(json.data) ? json.data : [];
        if (items.length === 0) {
            gridRef.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#b3b3b3;">Sem posts para mostrar.</p>`;
            return;
        }
        gridRef.innerHTML = items.map(item => renderItem(item)).join('');
    } catch (e) {
        gridRef.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#f44336;">Não foi possível carregar o feed do Instagram. Verifica o token.</p>`;
    }
}

function renderItem(item) {
    const isVideo = item.media_type === 'VIDEO';
    const thumb = String(item.thumbnail_url || item.media_url || '');
    const title = (String(item.caption || '').split('\n')[0] || '').substring(0, 80);
    const href = encodeURI(String(item.permalink || '#'));
    const thumbUrl = encodeURI(thumb);
    return `
        <a class="track-card" href="${href}" target="_blank" rel="noopener noreferrer">
            <div class="track-cover">
                <img src="${thumbUrl}" alt="post" class="track-cover-img" loading="lazy" decoding="async" />
            </div>
            <div class="track-info">
                <div class="track-title">${isVideo ? '🎥 ' : '🖼️ '}${escapeHtml(title)}</div>
                <div class="track-artist">${new Date(item.timestamp).toLocaleDateString()}</div>
            </div>
        </a>
    `;
}
