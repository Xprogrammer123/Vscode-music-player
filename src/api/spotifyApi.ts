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
  shuffleOn:   boolean;
  repeatMode:  string;
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
      shuffleOn:  data.shuffle_state,
      repeatMode: data.repeat_state,
      track:      this.mapTrack(data.item),
    };
  }

  async play(uri?: string): Promise<void> {
    const body = uri ? JSON.stringify({ uris: [uri] }) : undefined;
    await this.put('/me/player/play', body);
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
    return {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private async get(path: string): Promise<any> {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: await this.headers() });
      if (res.status === 204 || res.status === 202) return null;
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  }

  private async put(path: string, body?: string): Promise<void> {
    try {
      await fetch(`${BASE}${path}`, { method: 'PUT', headers: await this.headers(), body });
    } catch {}
  }

  private async post(path: string, body?: string): Promise<void> {
    try {
      await fetch(`${BASE}${path}`, { method: 'POST', headers: await this.headers(), body });
    } catch {}
  }
}
