"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpotifyApi = void 0;
const BASE = 'https://api.spotify.com/v1';
class SpotifyApi {
    constructor(auth) {
        this.auth = auth;
    }
    async getPlaybackState() {
        const data = await this.get('/me/player');
        if (!data || !data.item)
            return null;
        return {
            isPlaying: data.is_playing,
            progressMs: data.progress_ms,
            volume: data.device?.volume_percent ?? 100,
            deviceName: data.device?.name ?? 'Unknown device',
            deviceType: data.device?.type ?? 'Unknown',
            shuffleOn: data.shuffle_state,
            repeatMode: data.repeat_state,
            track: this.mapTrack(data.item),
        };
    }
    async play(uri) {
        const deviceId = await this.ensurePlayableDevice();
        const body = uri ? JSON.stringify({ uris: [uri] }) : undefined;
        const suffix = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
        await this.put(`/me/player/play${suffix}`, body);
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
    async search(query, limit = 20) {
        const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) });
        const data = await this.get(`/search?${params}`);
        if (!data?.tracks?.items)
            return [];
        return data.tracks.items.map((item) => this.mapTrack(item));
    }
    async getTrackAnalysis(trackId) {
        if (!trackId)
            return null;
        const data = await this.get(`/audio-analysis/${encodeURIComponent(trackId)}`);
        if (!data)
            return null;
        const sections = Array.isArray(data.sections)
            ? data.sections.slice(0, 256).map((s) => ({
                startMs: Math.max(0, Number(s.start ?? 0) * 1000),
                durationMs: Math.max(250, Number(s.duration ?? 0) * 1000),
                loudness: Number.isFinite(Number(s.loudness ?? -20)) ? Number(s.loudness ?? -20) : -20,
            }))
            : [];
        return {
            tempo: Number(data.track?.tempo ?? 120),
            sections,
        };
    }
    async addToQueue(uri) {
        await this.post(`/me/player/queue?uri=${encodeURIComponent(uri)}`);
    }
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
        if (!token) {
            throw new Error('Spotify token missing. Reconnect your account.');
        }
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    }
    async ensurePlayableDevice() {
        const devicesPayload = await this.get('/me/player/devices');
        const devices = Array.isArray(devicesPayload?.devices) ? devicesPayload.devices : [];
        const unrestricted = devices.filter(d => !d.is_restricted);
        const activeComputer = unrestricted.find(d => d.is_active && d.type === 'Computer');
        if (activeComputer?.id)
            return activeComputer.id;
        const anyComputer = unrestricted.find(d => d.type === 'Computer');
        if (anyComputer?.id) {
            await this.put('/me/player', JSON.stringify({ device_ids: [anyComputer.id], play: false }));
            return anyComputer.id;
        }
        const active = unrestricted.find(d => d.is_active);
        if (active?.id)
            return active.id;
        const fallback = unrestricted[0];
        if (!fallback?.id) {
            throw new Error('No Spotify device available. Open Spotify desktop or Web Player on this laptop first.');
        }
        await this.put('/me/player', JSON.stringify({ device_ids: [fallback.id], play: false }));
        return fallback.id;
    }
    async get(path) {
        const res = await fetch(`${BASE}${path}`, { headers: await this.headers() });
        if (res.status === 204 || res.status === 202)
            return null;
        if (!res.ok) {
            const text = await res.text();
            throw new Error(this.extractError(text, res.status));
        }
        return res.json();
    }
    async put(path, body) {
        const res = await fetch(`${BASE}${path}`, { method: 'PUT', headers: await this.headers(), body });
        if (res.status === 204 || res.status === 202)
            return;
        if (!res.ok) {
            const text = await res.text();
            throw new Error(this.extractError(text, res.status));
        }
    }
    async post(path, body) {
        const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: await this.headers(), body });
        if (res.status === 204 || res.status === 202)
            return;
        if (!res.ok) {
            const text = await res.text();
            throw new Error(this.extractError(text, res.status));
        }
    }
    extractError(responseText, status) {
        try {
            const parsed = JSON.parse(responseText);
            const msg = parsed?.error?.message || parsed?.error_description;
            if (msg)
                return `${msg} (HTTP ${status})`;
        }
        catch { }
        return `Spotify API request failed (HTTP ${status}).`;
    }
}
exports.SpotifyApi = SpotifyApi;
//# sourceMappingURL=spotifyApi.js.map