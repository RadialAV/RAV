// js/sections/home.js

import { tracks, getTrackById, releases, getAllArtists } from '../data.js';
import { getSupabaseClient } from '../supabase.js';
import { createTrackCard } from '../ui/render.js';
import { showToast } from '../utils.js';

const searchResultsContainer = document.getElementById('search-results');
const randomTracksContainer = document.getElementById('random-tracks');
const searchTracksContainer = document.getElementById('search-tracks');
let searchTimeout = null;

/**
 * Inicializa a lógica da secção Home.
 */
export function initHomeSection() {
    loadRandomTracks();
    
    // Expor funções globais para o HTML
    window.performSearch = performSearch;
    window.handleSearchKeyup = handleSearchKeyup;
    // Ligar listeners ao input de pesquisa (sem inline handlers)
    try {
        const inputEl = document.querySelector('#home-section .search-input');
        if (inputEl) {
            inputEl.addEventListener('input', (e) => performSearch((e.target && e.target.value) || ''));
            inputEl.addEventListener('keyup', handleSearchKeyup);
        }
    } catch (_) {}
    renderHomeNextEvent();
    renderHomeFeatured();
}

/**
 * Carrega e exibe 5 músicas aleatórias.
 */
function loadRandomTracks() {
    if (tracks.length === 0) {
        randomTracksContainer.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1/-1;">Nenhuma música disponível para carregar.</p>';
        return;
    }

    // Selecionar 5 músicas aleatórias
    const shuffled = [...tracks].sort(() => 0.5 - Math.random());
    const randomFive = shuffled.slice(0, 6);

    randomTracksContainer.innerHTML = randomFive.map(track => createTrackCard(track)).join('');
}

function renderHomeNextEvent() {
    const container = document.getElementById('home-events-embed');
    if (!container) return;
    container.innerHTML = '<section id="shotgun-events-listing"></section>';

    try {
        window.__shotgun = window.__shotgun || {};
        window.__shotgun['events-listing'] = {
            organizerId: 208547,
            layout: 'shotgun',
            showEventTags: true,
            showEventState: true
        };
    } catch (_) {}

    if (!document.getElementById('shotgun-events-listing-js')) {
        const s = document.createElement('script');
        s.id = 'shotgun-events-listing-js';
        s.src = 'https://widgets.shotgun.live/events-listing.js';
        s.async = true;
        s.onerror = () => showHomeEventsFallback(container);
        document.body.appendChild(s);
    }

    // Fallback por timeout (caso o widget não renderize)
    setTimeout(() => {
        // Se ainda não houver conteúdo útil, mostrar fallback
        try {
            const hasList = container.querySelector('#shotgun-events-listing');
            // Se a secção estiver vazia (sem children inseridos pelo widget)
            if (hasList && hasList.children.length === 0) {
                showHomeEventsFallback(container);
            }
        } catch (_) {
            showHomeEventsFallback(container);
        }
    }, 6000);
}

function showHomeEventsFallback(container) {
    const section = container.closest('.events-section');
    if (!section) return;
    // Mostrar um fallback simples com link externo
    container.innerHTML = `
        <div style="padding:0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; text-align:center; color: var(--muted);">
            <div style="margin-bottom:0.4rem;">Sem eventos disponíveis no momento ou falha ao carregar.</div>
            <a href="https://shotgun.live/en/venues/radial-av" target="_blank" rel="noopener noreferrer" class="event-btn" style="display:inline-block; padding:0.4rem 0.9rem; border-radius:20px; background:#1e90ff; color:#fff; text-decoration:none;">Abrir no Shotgun</a>
        </div>
    `;
}

/**
 * Realiza a pesquisa de músicas.
 * @param {string} query - O termo de pesquisa.
 */
export function performSearch(query) {
    clearTimeout(searchTimeout);
    
    // Se a pesquisa está vazia, limpar resultados e mostrar músicas aleatórias
    if (query.trim() === '') {
        searchResultsContainer.classList.remove('active');
        searchTracksContainer.innerHTML = ''; // Limpar resultados
        randomTracksContainer.style.display = 'grid';
        return;
    }

    // Pesquisa com debounce
    searchTimeout = setTimeout(() => {
        const results = tracks.filter(track => 
            track.title.toLowerCase().includes(query.toLowerCase()) ||
            track.artist.toLowerCase().includes(query.toLowerCase())
        );

        displaySearchResults(results);
        searchResultsContainer.classList.add('active');
        randomTracksContainer.style.display = 'none';
    }, 300);
}

/**
 * Lida com o evento de tecla levantada na pesquisa (para o Enter).
 * @param {Event} event - O evento de teclado.
 */
export function handleSearchKeyup(event) {
    if (event.key === 'Enter') {
        const query = event.target.value.trim();
        if (query) {
            performSearch(query);
        }
    }
}

/**
 * Exibe os resultados da pesquisa.
 * @param {Array<object>} results - O array de músicas encontradas.
 */
function displaySearchResults(results) {
    if (results.length === 0) {
        searchTracksContainer.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1/-1;">Nenhuma música encontrada</p>';
        return;
    }

    searchTracksContainer.innerHTML = results.map(track => createTrackCard(track)).join('');
}

// toggleFavorite é exposto globalmente por app.js a partir de data.js
// Não precisa ser redefinido aqui - a função correta com callbacks já está disponível

// --- Featured (Home) ---
function getFeaturedReleases() {
  try {
    if (!Array.isArray(releases) || releases.length === 0) return [];
    const base = releases.filter(r => !!r.featured && !r.comingSoon);
    const sorted = [...base].sort((a, b) => {
      const ay = Number(a.year || 0);
      const by = Number(b.year || 0);
      if (ay !== by) return by - ay;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    return sorted.slice(0, 3);
  } catch (_) { return []; }
}

async function renderHomeFeatured() {
    const el = document.getElementById('home-featured');
    if (!el) return;
    const items = getFeaturedReleases();
    // Tentar buscar artistas em destaque do Supabase
    let featuredArtists = [];
    try {
      const supabase = await getSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase.from('artists').select('name').eq('featured', true).order('name').limit(3);
        if (!error && Array.isArray(data)) featuredArtists = data.map(a => a.name).filter(Boolean);
      }
    } catch(_) {}
    // Fallback: heurística local
    if (!featuredArtists.length) {
      const artists = (typeof getAllArtists === 'function') ? getAllArtists() : [];
      let bestArtist = '';
      if (artists && artists.length) {
          const count = new Map();
          (tracks || []).forEach(t => {
              const a = t && t.artist ? t.artist : '';
              if (!a) return;
              count.set(a, (count.get(a) || 0) + 1);
          });
          bestArtist = [...count.entries()].sort((a,b) => b[1]-a[1]).map(e=>e[0])[0] || artists[0];
      }
      if (bestArtist) featuredArtists = [bestArtist];
    }

    if (!items.length) { el.innerHTML = ''; return; }
    const relTile = items.map(rel => {
      const bgStyle = rel.coverUrl ? `background-image:url('${rel.coverUrl}')` : '';
      const year = rel.year ? ` • ${rel.year}` : '';
      const subtitle = rel.subtitle ? `<div class="feat-sub">${rel.subtitle}</div>` : '';
      const ids = JSON.stringify(rel.trackIds || []);
      return `
        <div class="featured-card" style="${bgStyle}">
          <div class="featured-overlay"></div>
          <div class="featured-content">
            <div class="feat-eyebrow">Release</div>
            <div class="feat-title">${rel.title || 'Release'}</div>
            ${subtitle}
            <div class="feat-meta">${(rel.genres && rel.genres.length) ? rel.genres.join(', ') : 'Electronic'}${year}</div>
            <div class="feat-actions">
              <button class="btn btn-primary btn-sm" onclick="(window.playPlaylist ? playPlaylist(${ids}) : 0)">▶️ Tocar</button>
              <button class="btn btn-ghost btn-sm" onclick="(window.showReleaseDetails ? showReleaseDetails('${rel.id}') : 0)">Ver Release</button>
            </div>
          </div>
        </div>`;
    }).join('');

    const artistTile = (featuredArtists && featuredArtists.length) ? `
      <div class="featured-card">
        <div class="featured-overlay"></div>
        <div class="featured-content">
          <div class="feat-eyebrow">Artista</div>
          <div class="feat-title">${featuredArtists[0]}</div>
          <div class="feat-meta">Explorar músicas</div>
          <div class="feat-actions">
            <button class="btn btn-primary btn-sm" onclick='(window.showArtistDetails ? showArtistDetails(${JSON.stringify(''+(featuredArtists[0]||''))}) : 0)'>Abrir</button>
          </div>
        </div>
      </div>` : '';

    el.innerHTML = `${relTile}${artistTile}`;
}
