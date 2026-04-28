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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const spotifyAuth_1 = require("./auth/spotifyAuth");
const spotifyApi_1 = require("./api/spotifyApi");
const visualizerPanel_1 = require("./webview/visualizerPanel");
const statusBarController_1 = require("./player/statusBarController");
const playerController_1 = require("./player/playerController");
let player;
let visualizer;
let statusBar;
async function activate(context) {
    const auth = new spotifyAuth_1.SpotifyAuth(context);
    const api = new spotifyApi_1.SpotifyApi(auth);
    visualizer = new visualizerPanel_1.VisualizerPanel(context);
    statusBar = new statusBarController_1.StatusBarController();
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(visualizerPanel_1.VisualizerPanel.viewType, visualizer, { webviewOptions: { retainContextWhenHidden: true } }));
    visualizer.show();
    statusBar.showDisconnected();
    if (await auth.isLoggedIn()) {
        startPlayer(api, visualizer, statusBar, context);
    }
    context.subscriptions.push(vscode.commands.registerCommand('musicPlayer.connect', async () => {
        const ok = await auth.login();
        if (ok) {
            vscode.window.showInformationMessage('♫ Spotify connected!');
            startPlayer(api, visualizer, statusBar, context);
        }
        else {
            vscode.window.showErrorMessage('Music Player: Spotify login failed. Check your Client ID.');
        }
    }), vscode.commands.registerCommand('musicPlayer.disconnect', async () => {
        player?.stop();
        player = undefined;
        await auth.logout();
        statusBar?.showDisconnected();
        vscode.window.showInformationMessage('Music Player: Disconnected from Spotify.');
    }), vscode.commands.registerCommand('musicPlayer.showPanel', () => {
        visualizer?.show();
    }), vscode.commands.registerCommand('musicPlayer.play', () => {
        player?.togglePlay();
    }), vscode.commands.registerCommand('musicPlayer.next', () => {
        player?.next();
    }), vscode.commands.registerCommand('musicPlayer.prev', () => {
        player?.prev();
    }), vscode.commands.registerCommand('musicPlayer.search', () => {
        visualizer?.show();
        // A small delay to let the panel open, then focus the search input
        setTimeout(() => {
            visualizer?.postMessage({ type: 'openSearch' });
        }, 300);
    }));
    context.subscriptions.push({
        dispose: () => { player?.stop(); statusBar?.dispose(); },
    });
}
function deactivate() {
    player?.stop();
}
function startPlayer(api, visualizer, statusBar, context) {
    player?.stop();
    player = new playerController_1.PlayerController(api, visualizer, statusBar);
    player.start();
    void context;
    visualizer.postMessage({ type: 'connected' });
}
//# sourceMappingURL=extension.js.map