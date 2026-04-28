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
  private lastProgressMs = 0;
  private progressClockAt = Date.now();
  private trackTempo = 120;
  private trackSections: Array<{ startMs: number; durationMs: number; loudness: number }> = [];
  private currentTrackId = '';

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
    try {
      const state = await this.api.getPlaybackState();
      this.lastState = state;
      this.lastProgressMs = state?.progressMs ?? 0;
      this.progressClockAt = Date.now();

      const trackId = state?.track?.id ?? '';
      if (trackId && trackId !== this.currentTrackId) {
        this.currentTrackId = trackId;
        const analysis = await this.api.getTrackAnalysis(trackId);
        this.trackTempo = analysis?.tempo && Number.isFinite(analysis.tempo) ? analysis.tempo : 120;
        this.trackSections = analysis?.sections ?? [];
      }

      this.visualizer.update({
        isPlaying: state?.isPlaying ?? false,
        track: state?.track ?? null,
        progressMs: state?.progressMs ?? 0,
        volume: state?.volume ?? 100,
        deviceName: state?.deviceName ?? '',
        deviceType: state?.deviceType ?? '',
      });

      this.statusBar.showConnected({
        isPlaying: state?.isPlaying ?? false,
        track: state?.track ?? null,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not fetch Spotify playback state.';
      vscode.window.showWarningMessage(msg);
    }
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

    this.barPhase += 0.11;
    const p = this.barPhase;
    const now = Date.now();
    const estimatedProgress = this.lastProgressMs + (now - this.progressClockAt);
    const section = this.trackSections.find(s =>
      estimatedProgress >= s.startMs && estimatedProgress < (s.startMs + s.durationMs));
    const loudness = section ? this.normalizeLoudness(section.loudness) : 0.58;
    const beatHz = Math.max(0.8, Math.min(3.4, this.trackTempo / 60));
    const beatPulse = 0.5 + 0.5 * Math.sin((estimatedProgress / 1000) * beatHz * Math.PI * 2);

    const bars = Array.from({ length: barCount }, (_, i) => {
      const norm = i / barCount;
      const lane = Math.sin((estimatedProgress / 540) + i * 0.42) * 0.5 + 0.5;
      const base = 14 + (38 * loudness) + (34 * beatPulse * lane);

      const wave =
        Math.sin(p * 1.35 + i * 0.35) * (10 + 10 * loudness) +
        Math.sin(p * 2.5 + i * 0.8) * (7 + 9 * beatPulse) +
        Math.sin(p * 0.6 + i * 1.5) * 5;

      const edgeBoost = 0.78 + 0.22 * Math.sin((norm * Math.PI * 2) + p * 0.3);
      return Math.max(2, Math.min(98, (base + wave) * edgeBoost));
    });

    this.visualizer.pushBars(bars);
  }

  private normalizeLoudness(loudness: number): number {
    const clamped = Math.max(-42, Math.min(0, loudness));
    return (clamped + 42) / 42;
  }

  // ── Playback commands ──────────────────────────────────────────────────────

  async play(): Promise<void> { await this.runAction(() => this.api.play(), true); }
  async pause(): Promise<void> { await this.runAction(() => this.api.pause(), true); }
  async togglePlay(): Promise<void> {
    if (this.lastState?.isPlaying) { await this.pause(); } else { await this.play(); }
  }
  async next(): Promise<void> { await this.runAction(() => this.api.next(), true); }
  async prev(): Promise<void> { await this.runAction(() => this.api.prev(), true); }
  async setVolume(pct: number): Promise<void> { await this.runAction(() => this.api.setVolume(pct), false); }
  async seek(pct: number): Promise<void> {
    if (!this.lastState?.track) return;
    const ms = pct * this.lastState.track.durationMs;
    await this.runAction(() => this.api.seek(ms), true);
  }

  // ── Webview message handler ────────────────────────────────────────────────

  private async handleWebviewCommand(cmd: string, data?: any): Promise<void> {
    try {
      switch (cmd) {
        case 'play': await this.play(); break;
        case 'pause': await this.pause(); break;
        case 'next': await this.next(); break;
        case 'prev': await this.prev(); break;
        case 'shuffle':
          await this.runAction(() => this.api.setShuffle(!(this.lastState?.shuffleOn)), false);
          break;
        case 'seek':
          await this.seek(data?.pct ?? 0);
          break;
        case 'volume':
          await this.setVolume(data?.pct ?? 50);
          break;
        case 'playUri':
          await this.runAction(() => this.api.play(data?.uri), true);
          break;
        case 'search': {
          const results = await this.api.search(data?.query ?? '');
          this.visualizer.postMessage({ type: 'searchResults', results });
          break;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Spotify action failed.';
      vscode.window.showWarningMessage(msg);
    }
  }

  private async runAction(action: () => Promise<void>, repoll: boolean): Promise<void> {
    await action();
    if (repoll) {
      await this.poll();
    }
  }
}
