import { fetchCatalogFromSupabase } from './services/data.js';
import { isLoggedIn, loadUserFavorites, setFavoriteRemote, loadUserPlaylists, createPlaylistRemote, updatePlaylistRemote, deletePlaylistRemote, syncPlaylistTracksRemote } from './user_state.js';
import { showToast } from './utils.js';

export let tracks = [];
export let videos = [];
export let releases = [];
export let favorites = [];
export let playlists = JSON.parse(localStorage.getItem('radial_playlists') || '[]');
export let recentTracks = JSON.parse(localStorage.getItem('radial_recent') || '[]');
export let cart = JSON.parse(localStorage.getItem('radial_cart') || '[]');

export async function loadData() {
    try {
        const secsToStr = (v) => {
            if (v === null || v === undefined) return '';
            const n = Number(v);
            if (!isFinite(n)) return String(v || '');
            const s = Math.max(0, Math.floor(n));
            const m = Math.floor(s / 60);
            const ss = String(s % 60).padStart(2, '0');
            return `${m}:${ss}`;
        };
        let loadedViaSupabase = false;
        try {
            const catalog = await fetchCatalogFromSupabase();
            if (catalog && Array.isArray(catalog.tracks)) {
                tracks = catalog.tracks;
                releases = catalog.releases || [];
                videos = catalog.videos || [];
                loadedViaSupabase = true;
            }
        } catch (_) {}
        if (!loadedViaSupabase) {
            tracks = [];
            releases = [];
            videos = [];
        }

        // Aplicar cache de duração (preenchimento) se existir
        try {
            const dcacheRaw = localStorage.getItem('radial_duration_cache') || '{}';
            const dcache = JSON.parse(dcacheRaw);
            if (dcache && typeof dcache === 'object') {
                tracks = tracks.map(t => {
                    const cached = dcache[t.url];
                    const dur = t && t.duration ? String(t.duration) : '';
                    const finalDur = cached && (!dur || dur === '0:00' || dur === '') ? String(cached) : dur;
                    if (finalDur && finalDur !== dur) {
                        return { ...t, duration: finalDur };
                    }
                    return t;
                });
            }
        } catch (_) {}

        // Normalizar preços (default: track 1€, release 5€)
        try {
            tracks = tracks.map(t => ({ ...t, price: (typeof t.price === 'number' ? t.price : 1.00) }));
            releases = (releases || []).map(r => ({ ...r, releasePrice: (typeof r.releasePrice === 'number' ? r.releasePrice : 5.00) }));
        } catch(_) {}

        // Sincronizar favoritos do utilizador (Supabase -> local) se autenticado e catálogo com dbId
        try {
            const hasDbIds = Array.isArray(tracks) && tracks.some(t => typeof t.dbId === 'string' && t.dbId);
            if (hasDbIds && (await isLoggedIn())) {
                const mapDbToLocal = new Map();
                tracks.forEach(t => { if (typeof t.dbId === 'string' && t.dbId) mapDbToLocal.set(t.dbId, t.id); });
                const remote = await loadUserFavorites();
                if (Array.isArray(remote)) {
                    const mapped = remote.map(dbId => mapDbToLocal.get(dbId)).filter(Boolean);
                    favorites = mapped;
                    saveFavorites();
                }
            }
        } catch(_) {}

        // Sincronizar playlists do utilizador (Supabase -> local)
        try {
            const hasDbIds = Array.isArray(tracks) && tracks.some(t => typeof t.dbId === 'string' && t.dbId);
            if (hasDbIds && (await isLoggedIn())) {
                const mapDbToLocal = new Map();
                tracks.forEach(t => { if (typeof t.dbId === 'string' && t.dbId) mapDbToLocal.set(t.dbId, t.id); });
                const remotePls = await loadUserPlaylists();
                if (Array.isArray(remotePls)) {
                    let nextLocalId = 1;
                    playlists = remotePls.map(rp => {
                        const localTrackIds = (rp.tracks || []).map(dbId => mapDbToLocal.get(dbId)).filter(Boolean);
                        const p = {
                            id: nextLocalId++,
                            name: rp.name || 'Playlist',
                            description: rp.description || '',
                            tracks: localTrackIds,
                            remoteId: rp.id
                        };
                        return p;
                    });
                    savePlaylists();
                }
            }
        } catch(_) {}
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
    }
}

export function saveFavorites() {}

export function savePlaylists() {
    localStorage.setItem('radial_playlists', JSON.stringify(playlists));
}

function saveRecentTracks() {
    localStorage.setItem('radial_recent', JSON.stringify(recentTracks));
}

export function saveCart() {
    localStorage.setItem('radial_cart', JSON.stringify(cart));
}

export function addToCart(trackId) {
    if (!cart.includes(trackId)) {
        cart.push(trackId);
        saveCart();
        try { showToast('Adicionado ao carrinho', 'success'); } catch (_) {}
        try { if (window.updateCartBadge) window.updateCartBadge(); } catch(_) {}
        return true;
    } else {
        try { showToast('Já está no carrinho', 'info'); } catch (_) {}
        return false;
    }
}

export function removeFromCart(trackId) {
    const i = cart.indexOf(trackId);
    if (i !== -1) {
        cart.splice(i, 1);
        saveCart();
        try { showToast('Removido do carrinho', 'success'); } catch (_) {}
        try { if (window.updateCartBadge) window.updateCartBadge(); } catch(_) {}
        return true;
    }
    return false;
}

export function getCart() { return cart.map(id => getTrackById(id)).filter(Boolean); }

export function clearCart() {
    try {
        cart.splice(0, cart.length);
        saveCart();
        try { if (window.updateCartBadge) window.updateCartBadge(); } catch(_) {}
        try { showToast('Carrinho limpo', 'info'); } catch (_) {}
    } catch(_) {}
}

export let updateFavoriteButtons = () => {};
export let updateRecentSection = () => {};
export let updatePlaylistsSection = () => {};

export function setFavoriteUpdateCallback(callback) {
    updateFavoriteButtons = callback;
}

export function setRecentUpdateCallback(callback) {
    updateRecentSection = callback;
}

export function setPlaylistsUpdateCallback(callback) {
    updatePlaylistsSection = callback;
}

// --- Helpers de mapeamento (local <-> remoto) ---
function getTrackDbId(localTrackId) {
    try {
        const t = getTrackById(localTrackId);
        return t && t.dbId ? String(t.dbId) : null;
    } catch (_) { return null; }
}

async function ensureRemotePlaylist(playlist) {
    try {
        if (!playlist || !(await isLoggedIn())) return null;
        if (playlist.remoteId) return playlist.remoteId;
        const { id } = await createPlaylistRemote(playlist.name, playlist.description);
        if (id) {
            playlist.remoteId = id;
            try { await syncPlaylistTracksRemote(id, []); } catch(_) {}
            return id;
        }
    } catch(_) {}
    return null;
}

async function syncPlaylistTracksIfPossible(playlist) {
    try {
        if (!playlist || !(await isLoggedIn())) return;
        const remoteId = await ensureRemotePlaylist(playlist);
        if (!remoteId) return;
        const orderedDbIds = (playlist.tracks || []).map(getTrackDbId).filter(Boolean);
        await syncPlaylistTracksRemote(remoteId, orderedDbIds);
    } catch (_) {}
}

export function toggleFavorite(trackId) {
    const index = favorites.indexOf(trackId);
    let isAdded;
    if (index > -1) {
        favorites.splice(index, 1);
        isAdded = false;
    } else {
        favorites.push(trackId);
        isAdded = true;
    }
    saveFavorites();
    updateFavoriteButtons(trackId, isAdded);

    // Write-through para Supabase (assíncrono) quando possível
    try {
        const t = getTrackById(trackId);
        const remoteId = t && typeof t.dbId === 'string' && t.dbId ? t.dbId : null;
        if (remoteId) {
            (async () => {
                try { await setFavoriteRemote(remoteId, isAdded); } catch(_) {}
            })();
        }
    } catch(_) {}
    return isAdded;
}

export function addTrackToRecent(trackId) {
    const index = recentTracks.indexOf(trackId);
    if (index > -1) {
        recentTracks.splice(index, 1);
    }
    recentTracks.unshift(trackId);
    if (recentTracks.length > 10) {
        recentTracks = recentTracks.slice(0, 10);
    }
    saveRecentTracks();
    updateRecentSection();
}

export function createPlaylist(name, description) {
    const newId = playlists.length > 0 ? Math.max(...playlists.map(p => p.id)) + 1 : 1;
    const newPlaylist = {
        id: newId,
        name: name,
        description: description,
        tracks: []
    };
    playlists.push(newPlaylist);
    savePlaylists();
    updatePlaylistsSection();
    // Write-through Supabase
    (async () => {
        try {
            if (await isLoggedIn()) {
                const { id } = await createPlaylistRemote(name, description);
                if (id) {
                    newPlaylist.remoteId = id;
                    await syncPlaylistTracksRemote(id, []);
                }
            }
        } catch(_) {}
    })();
    return newId;
}

export function addTrackToPlaylist(playlistId, trackId) {
    const playlist = getPlaylistById(playlistId);
    if (playlist && !playlist.tracks.includes(trackId)) {
        playlist.tracks.push(trackId);
        savePlaylists();
        // Atualizar UI (contadores nos cartões de playlist)
        if (typeof updatePlaylistsSection === 'function') {
            try { updatePlaylistsSection(); } catch (_) {}
        }
        // Write-through Supabase
        (async () => { try { await syncPlaylistTracksIfPossible(playlist); } catch(_) {} })();
        return true;
    }
    return false;
}

export function deletePlaylist(playlistId) {
    const idStr = String(playlistId);
    const pl = getPlaylistById(playlistId);
    const remoteId = pl && pl.remoteId ? pl.remoteId : null;
    playlists = playlists.filter(p => String(p.id) !== idStr);
    savePlaylists();
    updatePlaylistsSection();
    // Write-through Supabase
    (async () => {
        try { if (remoteId && (await isLoggedIn())) await deletePlaylistRemote(remoteId); } catch(_) {}
    })();
}

export function updatePlaylist(playlistId, name, description) {
    const playlist = getPlaylistById(playlistId);
    if (playlist) {
        playlist.name = name;
        playlist.description = description;
        savePlaylists();
        updatePlaylistsSection();
        // Write-through Supabase
        (async () => {
            try { if (playlist.remoteId && (await isLoggedIn())) await updatePlaylistRemote(playlist.remoteId, name, description); } catch(_) {}
        })();
        return true;
    }
    return false;
}

export function removeTrackFromPlaylist(playlistId, trackId) {
    const playlist = getPlaylistById(playlistId);
    if (playlist) {
        playlist.tracks = playlist.tracks.filter(id => id !== trackId);
        savePlaylists();
        // Atualizar UI (contadores nos cartões de playlist)
        if (typeof updatePlaylistsSection === 'function') {
            try { updatePlaylistsSection(); } catch (_) {}
        }
        // Write-through Supabase
        (async () => { try { await syncPlaylistTracksIfPossible(playlist); } catch(_) {} })();
        return true;
    }
    return false;
}

export function moveTrackInPlaylist(playlistId, trackId, direction) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return false;
    
    const currentIndex = playlist.tracks.indexOf(trackId);
    if (currentIndex === -1) return false;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    // Verificar limites
    if (newIndex < 0 || newIndex >= playlist.tracks.length) return false;
    
    // Trocar posições
    [playlist.tracks[currentIndex], playlist.tracks[newIndex]] = 
    [playlist.tracks[newIndex], playlist.tracks[currentIndex]];
    
    savePlaylists();
    // Atualizar UI (ordem pode refletir em detalhes; cartões mantêm contagem)
    if (typeof updatePlaylistsSection === 'function') {
        try { updatePlaylistsSection(); } catch (_) {}
    }
    // Write-through Supabase
    (async () => { try { await syncPlaylistTracksIfPossible(playlist); } catch(_) {} })();
    return true;
}

export function clearPlaylistTracks(playlistId) {
    const playlist = getPlaylistById(playlistId);
    if (playlist) {
        playlist.tracks = [];
        savePlaylists();
        updatePlaylistsSection();
        // Write-through Supabase
        (async () => { try { await syncPlaylistTracksIfPossible(playlist); } catch(_) {} })();
        return true;
    }
    return false;
}

export function duplicatePlaylist(playlistId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return null;
    
    const newId = playlists.length > 0 ? Math.max(...playlists.map(p => p.id)) + 1 : 1;
    const newPlaylist = {
        id: newId,
        name: `${playlist.name} (Cópia)`,
        description: playlist.description,
        tracks: [...playlist.tracks] // Cópia do array de tracks
    };
    
    playlists.push(newPlaylist);
    savePlaylists();
    updatePlaylistsSection();
    return newId;
}

export function getTrackById(trackId) {
    return tracks.find(t => t.id === trackId);
}

export function getPlaylistById(playlistId) {
    const idStr = String(playlistId);
    return playlists.find(p => String(p.id) === idStr);
}

export function getTracksByArtist(artistName) {
    return tracks.filter(t => t.artist === artistName);
}

export function getReleaseById(releaseId) {
    const idStr = String(releaseId);
    return releases.find(r => String(r.id) === idStr);
}

// Encontra o release ao qual uma faixa pertence
export function getReleaseByTrackId(trackId) {
    try {
        const idNum = typeof trackId === 'number' ? trackId : Number(trackId);
        for (const r of releases) {
            if (r && Array.isArray(r.trackIds) && r.trackIds.includes(idNum)) return r;
        }
    } catch (_) {}
    return null;
}

// --- Pricing helpers ---
export function getTrackPrice(trackOrId) {
    try {
        const t = (typeof trackOrId === 'object' && trackOrId) ? trackOrId : getTrackById(trackOrId);
        const p = t && typeof t.price === 'number' ? t.price : 1.00;
        return Math.max(0, Number(p) || 0);
    } catch(_) { return 1.00; }
}

export function getReleasePrice(releaseOrId) {
    try {
        const r = (typeof releaseOrId === 'object' && releaseOrId) ? releaseOrId : getReleaseById(releaseOrId);
        const p = r && typeof r.releasePrice === 'number' ? r.releasePrice : 5.00;
        return Math.max(0, Number(p) || 0);
    } catch(_) { return 5.00; }
}

export function computeCartTotal() {
    try {
        const byRelease = new Map(); // releaseId -> { tracks: [], sum }
        for (const id of cart) {
            const t = getTrackById(id);
            if (!t) continue;
            const rel = getReleaseByTrackId(id);
            const relId = rel ? rel.id : null;
            if (!byRelease.has(relId)) byRelease.set(relId, { tracks: [], sum: 0, rel });
            const g = byRelease.get(relId);
            g.tracks.push(id);
            g.sum += getTrackPrice(t);
        }
        let total = 0;
        for (const [rid, g] of byRelease.entries()) {
            if (g.rel && Array.isArray(g.rel.trackIds) && g.tracks.length === g.rel.trackIds.length) {
                total += Math.min(g.sum, getReleasePrice(g.rel));
            } else {
                total += g.sum;
            }
        }
        return Math.max(0, Number(total) || 0);
    } catch(_) { return 0; }
}


export function addAllReleaseTracksToFavorites(releaseId) {
    const release = getReleaseById(releaseId);
    if (!release || !release.trackIds) return 0;
    
    let added = 0;
    release.trackIds.forEach(trackId => {
        if (!favorites.includes(trackId)) {
            favorites.push(trackId);
            added++;
        }
    });
    
    if (added > 0) {
        saveFavorites();
        updateFavoriteButtons();
    }
    
    return added;
}

export function getAllArtists() {
    const artistNames = tracks.map(t => t.artist);
    return [...new Set(artistNames)].sort();
}

export function getArtistStats(artistName) {
    const artistTracks = getTracksByArtist(artistName);
    
    if (!artistTracks || artistTracks.length === 0) {
        return {
            trackCount: 0,
            totalDuration: '0:00',
            releases: [],
            trackIds: []
        };
    }
    
    // Calcular duração total
    let totalSeconds = 0;
    artistTracks.forEach(track => {
        if (track && track.duration) {
            const [min, sec] = track.duration.split(':').map(Number);
            totalSeconds += (min * 60) + (sec || 0);
        }
    });
    
    const totalMinutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    const totalDuration = `${totalMinutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    
    // Verificar em que releases aparece (só se releases estiver carregado)
    const artistReleases = (releases && releases.length > 0) ? releases.filter(r => 
        r.trackIds && r.trackIds.some(id => {
            const track = getTrackById(id);
            return track && track.artist === artistName;
        })
    ) : [];
    
    return {
        trackCount: artistTracks.length,
        totalDuration,
        releases: artistReleases,
        trackIds: artistTracks.map(t => t.id)
    };
}

export function getArtistInitials(artistName) {
    return artistName
        .split(' ')
        .map(word => word[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
}

export function getFavoriteTracks() {
    return favorites.map(id => getTrackById(id)).filter(Boolean);
}

export function getRecentTracks() {
    return recentTracks.map(id => getTrackById(id)).filter(Boolean);
}

export function isFavorite(trackId) {
    return favorites.includes(trackId);
}
