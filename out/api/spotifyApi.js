"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpotifyApi = void 0;
const BASE = 'https://api.spotify.com/v1';
class SpotifyApi {
    constructor(auth) {
        this.auth = auth;
    }
    // ── Playback ──────────────────────────────────────────────────────────────
    async getPlaybackState() {
        const data = await this.get('/me/player');
        if (!data || !data.item)
            return null;
        return {
            isPlaying: data.is_playing,
            progressMs: data.progress_ms,
            volume: data.device?.volume_percent ?? 100,
            shuffleOn: data.shuffle_state,
            repeatMode: data.repeat_state,
            track: this.mapTrack(data.item),
        };
    }
    async play(uri) {
        const body = uri ? JSON.stringify({ uris: [uri] }) : undefined;
        await this.put('/me/player/play', body);
    }
    async pause() {
        await this.put('/me/player/pause');
    }
    async next() {
        await this.post('/me/player/next');
    }
    async prev() {
        await this.post('/me/player/previous');
    }
    async setVolume(percent) {
        await this.put(`/me/player/volume?volume_percent=${Math.round(percent)}`);
    }
    async setShuffle(state) {
        await this.put(`/me/player/shuffle?state=${state}`);
    }
    async seek(positionMs) {
        await this.put(`/me/player/seek?position_ms=${Math.round(positionMs)}`);
    }
    // ── Search ────────────────────────────────────────────────────────────────
    async search(query, limit = 20) {
        const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) });
        const data = await this.get(`/search?${params}`);
        if (!data?.tracks?.items)
            return [];
        return data.tracks.items.map((item) => this.mapTrack(item));
    }
    // ── Queue ─────────────────────────────────────────────────────────────────
    async addToQueue(uri) {
        await this.post(`/me/player/queue?uri=${encodeURIComponent(uri)}`);
    }
    // ── User Library ──────────────────────────────────────────────────────────
    async getLikedSongs(limit = 20) {
        const data = await this.get(`/me/tracks?limit=${limit}`);
        if (!data?.items)
            return [];
        return data.items.map((item) => this.mapTrack(item.track));
    }
    async getRecentlyPlayed(limit = 20) {
        const data = await this.get(`/me/player/recently-played?limit=${limit}`);
        if (!data?.items)
            return [];
        return data.items.map((item) => this.mapTrack(item.track));
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    mapTrack(item) {
        return {
            id: item.id,
            name: item.name,
            artists: item.artists?.map((a) => a.name) ?? [],
            album: item.album?.name ?? '',
            albumArt: item.album?.images?.[1]?.url ?? item.album?.images?.[0]?.url ?? '',
            durationMs: item.duration_ms,
            uri: item.uri,
        };
    }
    async headers() {
        const token = await this.auth.getAccessToken();
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    }
    async get(path) {
        try {
            const res = await fetch(`${BASE}${path}`, { headers: await this.headers() });
            if (res.status === 204 || res.status === 202)
                return null;
            if (!res.ok)
                return null;
            return res.json();
        }
        catch {
            return null;
        }
    }
    async put(path, body) {
        try {
            await fetch(`${BASE}${path}`, { method: 'PUT', headers: await this.headers(), body });
        }
        catch { }
    }
    async post(path, body) {
        try {
            await fetch(`${BASE}${path}`, { method: 'POST', headers: await this.headers(), body });
        }
        catch { }
    }
}
exports.SpotifyApi = SpotifyApi;
//# sourceMappingURL=spotifyApi.js.map