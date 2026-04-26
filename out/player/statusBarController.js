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
exports.StatusBarController = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Manages the lightweight text items in the real VS Code status bar.
 * These sit to the LEFT of the visualizer panel and show track info + controls.
 */
class StatusBarController {
    constructor() {
        this.items = [];
        // Priority: higher = further left in the status bar
        this.btnPrev = this.makeItem('$(chevron-left)$(chevron-left)', 'musicPlayer.prev', 'Previous track', 12);
        this.btnPlay = this.makeItem('$(play)', 'musicPlayer.play', 'Play / Pause', 11);
        this.btnNext = this.makeItem('$(chevron-right)$(chevron-right)', 'musicPlayer.next', 'Next track', 10);
        this.lblTrack = this.makeItem('$(music) Not connected', 'musicPlayer.showPanel', 'Open music panel', 9);
        this.lblConn = this.makeItem('$(plug) Connect Spotify', 'musicPlayer.connect', 'Connect your Spotify account', 8);
        this.items = [this.btnPrev, this.btnPlay, this.btnNext, this.lblTrack, this.lblConn];
    }
    makeItem(text, command, tooltip, priority) {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
        item.text = text;
        item.command = command;
        item.tooltip = tooltip;
        return item;
    }
    showDisconnected() {
        this.btnPrev.hide();
        this.btnPlay.hide();
        this.btnNext.hide();
        this.lblTrack.hide();
        this.lblConn.text = '$(plug) Connect Spotify';
        this.lblConn.show();
    }
    showConnected(state) {
        this.lblConn.hide();
        this.btnPrev.show();
        this.btnNext.show();
        this.btnPlay.text = state.isPlaying ? '$(debug-pause)' : '$(play)';
        this.btnPlay.tooltip = state.isPlaying ? 'Pause' : 'Play';
        this.btnPlay.show();
        if (state.track) {
            const name = this.truncate(state.track.name, 28);
            const artist = this.truncate(state.track.artists[0] ?? '', 18);
            this.lblTrack.text = `$(music) ${name}  —  ${artist}`;
            this.lblTrack.tooltip = `${state.track.name} · ${state.track.artists.join(', ')} · Click to open panel`;
        }
        else {
            this.lblTrack.text = '$(music) Nothing playing';
            this.lblTrack.tooltip = 'Click to open music panel';
        }
        this.lblTrack.show();
    }
    dispose() {
        this.items.forEach(i => i.dispose());
    }
    truncate(str, max) {
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }
}
exports.StatusBarController = StatusBarController;
//# sourceMappingURL=statusBarController.js.map