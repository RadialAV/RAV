import { getSupabaseClient, getUser } from './supabase.js';

export async function isLoggedIn() {
  try { return !!(await getUser()); } catch (_) { return false; }
}

// --- Playlists (Supabase, UUID) ---
export async function loadUserPlaylists() {
  try {
    const supabase = await getSupabaseClient();
    const user = await getUser();
    if (!supabase || !user) return null;
    const { data: pls, error: e1 } = await supabase
      .from('playlists')
      .select('id,name,description')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (e1) return null;
    const ids = (pls || []).map(p => p.id);
    if (ids.length === 0) return [];
    const { data: pts, error: e2 } = await supabase
      .from('playlist_tracks')
      .select('playlist_id,track_id,position')
      .in('playlist_id', ids)
      .order('position', { ascending: true });
    if (e2) return null;
    const byPl = new Map();
    (pls || []).forEach(p => byPl.set(p.id, { id: p.id, name: p.name || '', description: p.description || '', tracks: [], positions: [] }));
    (pts || []).forEach(r => {
      const b = byPl.get(r.playlist_id);
      if (b) { b.tracks.push(String(r.track_id)); b.positions.push(typeof r.position === 'number' ? r.position : b.tracks.length - 1); }
    });
    return Array.from(byPl.values());
  } catch (_) { return null; }
}

export async function createPlaylistRemote(name, description) {
  const supabase = await getSupabaseClient();
  const user = await getUser();
  if (!supabase || !user) return { id: null, error: 'noauth' };
  const { data, error } = await supabase
    .from('playlists')
    .insert({ user_id: user.id, name, description })
    .select('id')
    .single();
  return { id: data && data.id ? data.id : null, error };
}

export async function updatePlaylistRemote(playlistId, name, description) {
  const supabase = await getSupabaseClient();
  const user = await getUser();
  if (!supabase || !user) return { error: 'noauth' };
  const { error } = await supabase
    .from('playlists')
    .update({ name, description })
    .eq('id', playlistId)
    .eq('user_id', user.id);
  return { error };
}

export async function deletePlaylistRemote(playlistId) {
  const supabase = await getSupabaseClient();
  const user = await getUser();
  if (!supabase || !user) return { error: 'noauth' };
  const { error } = await supabase
    .from('playlists')
    .delete()
    .eq('id', playlistId)
    .eq('user_id', user.id);
  return { error };
}

export async function syncPlaylistTracksRemote(playlistId, orderedTrackDbIds) {
  try {
    const supabase = await getSupabaseClient();
    const user = await getUser();
    if (!supabase || !user) return { error: 'noauth' };
    // Limpar todos e reinserir na ordem
    await supabase.from('playlist_tracks').delete().eq('playlist_id', playlistId);
    const rows = (orderedTrackDbIds || []).map((tid, i) => ({ playlist_id: playlistId, track_id: tid, position: i }));
    if (rows.length > 0) {
      const { error } = await supabase.from('playlist_tracks').insert(rows);
      return { error };
    }
    return { error: null };
  } catch (e) { return { error: e }; }
}

export async function loadUserFavorites() {
  try {
    const supabase = await getSupabaseClient();
    const user = await getUser();
    if (!supabase || !user) return null;
    const { data, error } = await supabase
      .from('favorites')
      .select('track_id')
      .eq('user_id', user.id)
      .order('track_id', { ascending: true });
    if (error) return null;
    const ids = Array.isArray(data) ? data.map(r => String(r.track_id)).filter(Boolean) : [];
    return ids;
  } catch (_) { return null; }
}

export async function setFavoriteRemote(trackId, isAdded) {
  try {
    const supabase = await getSupabaseClient();
    const user = await getUser();
    if (!supabase || !user) return { error: 'noauth' };
    if (isAdded) {
      const { error } = await supabase
        .from('favorites')
        .upsert({ user_id: user.id, track_id: trackId }, { onConflict: 'user_id,track_id' });
      return { error };
    } else {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('track_id', trackId);
      return { error };
    }
  } catch (e) { return { error: e }; }
}
