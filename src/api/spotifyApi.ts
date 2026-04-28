import { SpotifyAuth } from '../auth/spotifyAuth';

const BASE = 'https://api.spotify.com/v1';

export interface Track {
  id:         string;
  name:       string;
  artists:    string[];
  album:      string;
  albumArt:   string;
  durationMs: number;
  uri:        string;
}

export interface PlaybackState {
  isPlaying:   boolean;
  track:       Track | null;
  progressMs:  number;
  volume:      number;
  deviceName:  string;
  deviceType:  string;
  shuffleOn:   boolean;
  repeatMode:  string;
}

interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
}

interface TrackAnalysis {
  tempo: number;
  sections: Array<{
    startMs: number;
    durationMs: number;
    loudness: number;
  }>;
}

export class SpotifyApi {
  constructor(private auth: SpotifyAuth) {}

  async getPlaybackState(): Promise<PlaybackState | null> {
    const data = await this.get('/me/player');
    if (!data || !data.item) return null;

    return {
      isPlaying:  data.is_playing,
      progressMs: data.progress_ms,
      volume:     data.device?.volume_percent ?? 100,
      deviceName: data.device?.name ?? 'Unknown device',
      deviceType: data.device?.type ?? 'Unknown',
      shuffleOn:  data.shuffle_state,
      repeatMode: data.repeat_state,
      track:      this.mapTrack(data.item),
    };
  }

  async play(uri?: string): Promise<void> {
    const deviceId = await this.ensurePlayableDevice();
    const body = uri ? JSON.stringify({ uris: [uri] }) : undefined;
    const suffix = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    await this.put(`/me/player/play${suffix}`, body);
  }

  async pause(): Promise<void> {
    await this.put('/me/player/pause');
  }

  async next(): Promise<void> {
    await this.post('/me/player/next');
  }

  async prev(): Promise<void> {
    await this.post('/me/player/previous');
  }

  async setVolume(percent: number): Promise<void> {
    await this.put(`/me/player/volume?volume_percent=${Math.round(percent)}`);
  }

  async setShuffle(state: boolean): Promise<void> {
    await this.put(`/me/player/shuffle?state=${state}`);
  }

  async seek(positionMs: number): Promise<void> {
    await this.put(`/me/player/seek?position_ms=${Math.round(positionMs)}`);
  }

  async search(query: string, limit = 20): Promise<Track[]> {
    const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) });
    const data   = await this.get(`/search?${params}`);
    if (!data?.tracks?.items) return [];
    return data.tracks.items.map((item: any) => this.mapTrack(item));
  }

  async getTrackAnalysis(trackId: string): Promise<TrackAnalysis | null> {
    if (!trackId) return null;

    const data = await this.get(`/audio-analysis/${encodeURIComponent(trackId)}`);
    if (!data) return null;

    const sections = Array.isArray(data.sections)
      ? data.sections.slice(0, 256).map((s: any) => ({
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

  async addToQueue(uri: string): Promise<void> {
    await this.post(`/me/player/queue?uri=${encodeURIComponent(uri)}`);
  }

  async getLikedSongs(limit = 20): Promise<Track[]> {
    const data = await this.get(`/me/tracks?limit=${limit}`);
    if (!data?.items) return [];
    return data.items.map((item: any) => this.mapTrack(item.track));
  }

  async getRecentlyPlayed(limit = 20): Promise<Track[]> {
    const data = await this.get(`/me/player/recently-played?limit=${limit}`);
    if (!data?.items) return [];
    return data.items.map((item: any) => this.mapTrack(item.track));
  }

  private mapTrack(item: any): Track {
    return {
      id:         item.id,
      name:       item.name,
      artists:    item.artists?.map((a: any) => a.name) ?? [],
      album:      item.album?.name ?? '',
      albumArt:   item.album?.images?.[1]?.url ?? item.album?.images?.[0]?.url ?? '',
      durationMs: item.duration_ms,
      uri:        item.uri,
    };
  }

  private async headers(): Promise<Record<string, string>> {
    const token = await this.auth.getAccessToken();
    if (!token) {
      throw new Error('Spotify token missing. Reconnect your account.');
    }
    return {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private async ensurePlayableDevice(): Promise<string | null> {
    const devicesPayload = await this.get('/me/player/devices');
    const devices: SpotifyDevice[] = Array.isArray(devicesPayload?.devices) ? devicesPayload.devices : [];
    const unrestricted = devices.filter(d => !d.is_restricted);
    const activeComputer = unrestricted.find(d => d.is_active && d.type === 'Computer');
    if (activeComputer?.id) return activeComputer.id;

    const anyComputer = unrestricted.find(d => d.type === 'Computer');
    if (anyComputer?.id) {
      await this.put('/me/player', JSON.stringify({ device_ids: [anyComputer.id], play: false }));
      return anyComputer.id;
    }

    const active = unrestricted.find(d => d.is_active);
    if (active?.id) return active.id;

    const fallback = unrestricted[0];
    if (!fallback?.id) {
      throw new Error('No Spotify device available. Open Spotify desktop or Web Player on this laptop first.');
    }

    await this.put('/me/player', JSON.stringify({ device_ids: [fallback.id], play: false }));
    return fallback.id;
  }

  private async get(path: string): Promise<any> {
    const res = await fetch(`${BASE}${path}`, { headers: await this.headers() });
    if (res.status === 204 || res.status === 202) return null;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(this.extractError(text, res.status));
    }
    return res.json();
  }

  private async put(path: string, body?: string): Promise<void> {
    const res = await fetch(`${BASE}${path}`, { method: 'PUT', headers: await this.headers(), body });
    if (res.status === 204 || res.status === 202) return;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(this.extractError(text, res.status));
    }
  }

  private async post(path: string, body?: string): Promise<void> {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: await this.headers(), body });
    if (res.status === 204 || res.status === 202) return;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(this.extractError(text, res.status));
    }
  }

  private extractError(responseText: string, status: number): string {
    try {
      const parsed = JSON.parse(responseText);
      const msg = parsed?.error?.message || parsed?.error_description;
      if (msg) return `${msg} (HTTP ${status})`;
    } catch {}
    return `Spotify API request failed (HTTP ${status}).`;
  }
}
