"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerController = void 0;
const vscode = __importStar(require("vscode"));
const POLL_INTERVAL_MS = 3000; // poll Spotify every 3 s
const BAR_ANIMATE_MS = 80; // visualizer frame rate
class PlayerController {
    constructor(api, visualizer, statusBar) {
        this.lastState = null;
        this.barPhase = 0;
        this.lastProgressMs = 0;
        this.progressClockAt = Date.now();
        this.trackTempo = 120;
        this.trackSections = [];
        this.currentTrackId = '';
        this.api = api;
        this.visualizer = visualizer;
        this.statusBar = statusBar;
        // Handle commands sent from the webview
        this.visualizer.onCommand((cmd, data) => this.handleWebviewCommand(cmd, data));
    }
    // ── Lifecycle ──────────────────────────────────────────────────────────────
    start() {
        this.poll(); // immediate first fetch
        this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
        this.barTimer = setInterval(() => this.tickBars(), BAR_ANIMATE_MS);
    }
    stop() {
        if (this.pollTimer)
            clearInterval(this.pollTimer);
        if (this.barTimer)
            clearInterval(this.barTimer);
    }
    // ── Polling ────────────────────────────────────────────────────────────────
    async poll() {
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
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Could not fetch Spotify playback state.';
            vscode.window.showWarningMessage(msg);
        }
    }
    // ── Bar animation ─────────────────────────────────────────────────────────
    // Generates a convincing fake spectrum while real Web Audio isn't available.
    // If you later integrate the Web Playback SDK you can replace this with
    // real FFT data from an AnalyserNode.
    tickBars() {
        if (!this.lastState?.isPlaying)
            return;
        const barCount = vscode.workspace
            .getConfiguration('musicPlayer')
            .get('visualizerBars', 20);
        this.barPhase += 0.11;
        const p = this.barPhase;
        const now = Date.now();
        const estimatedProgress = this.lastProgressMs + (now - this.progressClockAt);
        const section = this.trackSections.find(s => estimatedProgress >= s.startMs && estimatedProgress < (s.startMs + s.durationMs));
        const loudness = section ? this.normalizeLoudness(section.loudness) : 0.58;
        const beatHz = Math.max(0.8, Math.min(3.4, this.trackTempo / 60));
        const beatPulse = 0.5 + 0.5 * Math.sin((estimatedProgress / 1000) * beatHz * Math.PI * 2);
        const bars = Array.from({ length: barCount }, (_, i) => {
            const norm = i / barCount;
            const lane = Math.sin((estimatedProgress / 540) + i * 0.42) * 0.5 + 0.5;
            const base = 14 + (38 * loudness) + (34 * beatPulse * lane);
            const wave = Math.sin(p * 1.35 + i * 0.35) * (10 + 10 * loudness) +
                Math.sin(p * 2.5 + i * 0.8) * (7 + 9 * beatPulse) +
                Math.sin(p * 0.6 + i * 1.5) * 5;
            const edgeBoost = 0.78 + 0.22 * Math.sin((norm * Math.PI * 2) + p * 0.3);
            return Math.max(2, Math.min(98, (base + wave) * edgeBoost));
        });
        this.visualizer.pushBars(bars);
    }
    normalizeLoudness(loudness) {
        const clamped = Math.max(-42, Math.min(0, loudness));
        return (clamped + 42) / 42;
    }
    // ── Playback commands ──────────────────────────────────────────────────────
    async play() { await this.runAction(() => this.api.play(), true); }
    async pause() { await this.runAction(() => this.api.pause(), true); }
    async togglePlay() {
        if (this.lastState?.isPlaying) {
            await this.pause();
        }
        else {
            await this.play();
        }
    }
    async next() { await this.runAction(() => this.api.next(), true); }
    async prev() { await this.runAction(() => this.api.prev(), true); }
    async setVolume(pct) { await this.runAction(() => this.api.setVolume(pct), false); }
    async seek(pct) {
        if (!this.lastState?.track)
            return;
        const ms = pct * this.lastState.track.durationMs;
        await this.runAction(() => this.api.seek(ms), true);
    }
    // ── Webview message handler ────────────────────────────────────────────────
    async handleWebviewCommand(cmd, data) {
        try {
            switch (cmd) {
                case 'play':
                    await this.play();
                    break;
                case 'pause':
                    await this.pause();
                    break;
                case 'next':
                    await this.next();
                    break;
                case 'prev':
                    await this.prev();
                    break;
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
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Spotify action failed.';
            vscode.window.showWarningMessage(msg);
        }
    }
    async runAction(action, repoll) {
        await action();
        if (repoll) {
            await this.poll();
        }
    }
}
exports.PlayerController = PlayerController;
//# sourceMappingURL=playerController.js.map