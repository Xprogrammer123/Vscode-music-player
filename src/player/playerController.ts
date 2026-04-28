import * as vscode from 'vscode';
import { SpotifyApi, PlaybackState } from '../api/spotifyApi';
import { VisualizerPanel } from '../webview/visualizerPanel';
import { StatusBarController } from './statusBarController';

const POLL_INTERVAL_MS = 3_000;   // poll Spotify every 3 s
const BAR_ANIMATE_MS = 80;      // visualizer frame rate

export class PlayerController {
  private api: SpotifyApi;
  private visualizer: VisualizerPanel;
  private statusBar: StatusBarController;

  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private barTimer: ReturnType<typeof setInterval> | undefined;
  private lastState: PlaybackState | null = null;
  private barPhase = 0;

  constructor(
    api: SpotifyApi,
    visualizer: VisualizerPanel,
    statusBar: StatusBarController,
  ) {
    this.api = api;
    this.visualizer = visualizer;
    this.statusBar = statusBar;

    // Handle commands sent from the webview
    this.visualizer.onCommand((cmd, data) => this.handleWebviewCommand(cmd, data));
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start(): void {
    this.poll();  // immediate first fetch
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.barTimer = setInterval(() => this.tickBars(), BAR_ANIMATE_MS);
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.barTimer) clearInterval(this.barTimer);
  }

  // ── Polling ────────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    const state = await this.api.getPlaybackState();
    this.lastState = state;

    this.visualizer.update({
      isPlaying: state?.isPlaying ?? false,
      track: state?.track ?? null,
      progressMs: state?.progressMs ?? 0,
      volume: state?.volume ?? 100,
    });

    this.statusBar.showConnected({
      isPlaying: state?.isPlaying ?? false,
      track: state?.track ?? null,
    });
  }

  // ── Bar animation ─────────────────────────────────────────────────────────
  // Generates a convincing fake spectrum while real Web Audio isn't available.
  // If you later integrate the Web Playback SDK you can replace this with
  // real FFT data from an AnalyserNode.

  private tickBars(): void {
    if (!this.lastState?.isPlaying) return;

    const barCount = vscode.workspace
      .getConfiguration('musicPlayer')
      .get<number>('visualizerBars', 20);

    this.barPhase += 0.08;
    const p = this.barPhase;

    const bars = Array.from({ length: barCount }, (_, i) => {
      const norm = i / barCount;
      // Simulate a bell-shaped frequency response with organic movement
      const base =
        80 * Math.exp(-5 * Math.pow(norm - 0.15, 2)) +
        60 * Math.exp(-6 * Math.pow(norm - 0.45, 2)) +
        40 * Math.exp(-8 * Math.pow(norm - 0.75, 2));

      const wave =
        Math.sin(p * 1.3 + i * 0.5) * 20 +
        Math.sin(p * 2.1 + i * 0.9) * 12 +
        Math.sin(p * 0.7 + i * 1.4) * 8;

      return Math.max(2, Math.min(98, base + wave));
    });

    this.visualizer.pushBars(bars);
  }

  // ── Playback commands ──────────────────────────────────────────────────────

  async play(): Promise<void> { await this.api.play(); await this.poll(); }
  async pause(): Promise<void> { await this.api.pause(); await this.poll(); }
  async togglePlay(): Promise<void> {
    if (this.lastState?.isPlaying) { await this.pause(); } else { await this.play(); }
  }
  async next(): Promise<void> { await this.api.next(); await this.poll(); }
  async prev(): Promise<void> { await this.api.prev(); await this.poll(); }
  async setVolume(pct: number): Promise<void> { await this.api.setVolume(pct); }
  async seek(pct: number): Promise<void> {
    if (!this.lastState?.track) return;
    const ms = pct * this.lastState.track.durationMs;
    await this.api.seek(ms);
    await this.poll();
  }

  // ── Webview message handler ────────────────────────────────────────────────

  private async handleWebviewCommand(cmd: string, data?: any): Promise<void> {
    switch (cmd) {
      case 'play': await this.play(); break;
      case 'pause': await this.pause(); break;
      case 'next': await this.next(); break;
      case 'prev': await this.prev(); break;
      case 'shuffle':
        await this.api.setShuffle(!(this.lastState?.shuffleOn));
        break;
      case 'seek':
        await this.seek(data?.pct ?? 0);
        break;
      case 'volume':
        await this.setVolume(data?.pct ?? 50);
        break;
      case 'playUri':
        await this.api.play(data?.uri);
        await this.poll();
        break;
      case 'search': {
        const results = await this.api.search(data?.query ?? '');
        this.visualizer.postMessage({ type: 'searchResults', results });
        break;
      }
    }
  }
}
