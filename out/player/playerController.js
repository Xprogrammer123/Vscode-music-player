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
    tickBars() {
        if (!this.lastState?.isPlaying)
            return;
        const barCount = vscode.workspace
            .getConfiguration('musicPlayer')
            .get('visualizerBars', 20);
        this.barPhase += 0.08;
        const p = this.barPhase;
        const bars = Array.from({ length: barCount }, (_, i) => {
            const norm = i / barCount;
            // Simulate a bell-shaped frequency response with organic movement
            const base = 80 * Math.exp(-5 * Math.pow(norm - 0.15, 2)) +
                60 * Math.exp(-6 * Math.pow(norm - 0.45, 2)) +
                40 * Math.exp(-8 * Math.pow(norm - 0.75, 2));
            const wave = Math.sin(p * 1.3 + i * 0.5) * 20 +
                Math.sin(p * 2.1 + i * 0.9) * 12 +
                Math.sin(p * 0.7 + i * 1.4) * 8;
            return Math.max(2, Math.min(98, base + wave));
        });
        this.visualizer.pushBars(bars);
    }
    // ── Playback commands ──────────────────────────────────────────────────────
    async play() { await this.api.play(); await this.poll(); }
    async pause() { await this.api.pause(); await this.poll(); }
    async togglePlay() {
        if (this.lastState?.isPlaying) {
            await this.pause();
        }
        else {
            await this.play();
        }
    }
    async next() { await this.api.next(); await this.poll(); }
    async prev() { await this.api.prev(); await this.poll(); }
    async setVolume(pct) { await this.api.setVolume(pct); }
    async seek(pct) {
        if (!this.lastState?.track)
            return;
        const ms = pct * this.lastState.track.durationMs;
        await this.api.seek(ms);
        await this.poll();
    }
    // ── Webview message handler ────────────────────────────────────────────────
    async handleWebviewCommand(cmd, data) {
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
exports.PlayerController = PlayerController;
//# sourceMappingURL=playerController.js.map