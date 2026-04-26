import * as vscode from 'vscode';
import { SpotifyAuth }          from './auth/spotifyAuth';
import { SpotifyApi }           from './api/spotifyApi';
import { VisualizerPanel }      from './webview/visualizerPanel';
import { StatusBarController }  from './player/statusBarController';
import { PlayerController }     from './player/playerController';

let player:    PlayerController    | undefined;
let visualizer: VisualizerPanel    | undefined;
let statusBar:  StatusBarController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ── Core services ──────────────────────────────────────────────────────────
  const auth       = new SpotifyAuth(context);
  const api        = new SpotifyApi(auth);
  visualizer       = new VisualizerPanel(context);
  statusBar        = new StatusBarController();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      VisualizerPanel.viewType,
      visualizer,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // ── Always open the visualizer panel on activation ─────────────────────────
  // This ensures it comes back every time VS Code starts with the extension active.
  visualizer.show();
  statusBar.showDisconnected();

  // ── Auto-reconnect if already logged in ────────────────────────────────────
  if (await auth.isLoggedIn()) {
    startPlayer(api, visualizer!, statusBar!, context);
  }

  // ── Register commands ──────────────────────────────────────────────────────
  context.subscriptions.push(

    vscode.commands.registerCommand('musicPlayer.connect', async () => {
      const ok = await auth.login();
      if (ok) {
        vscode.window.showInformationMessage('♫ Spotify connected!');
        startPlayer(api, visualizer!, statusBar!, context);
      } else {
        vscode.window.showErrorMessage('Music Player: Spotify login failed. Check your Client ID.');
      }
    }),

    vscode.commands.registerCommand('musicPlayer.disconnect', async () => {
      player?.stop();
      player = undefined;
      await auth.logout();
      statusBar?.showDisconnected();
      vscode.window.showInformationMessage('Music Player: Disconnected from Spotify.');
    }),

    vscode.commands.registerCommand('musicPlayer.showPanel', () => {
      visualizer?.show();
    }),

    vscode.commands.registerCommand('musicPlayer.play', () => {
      player?.togglePlay();
    }),

    vscode.commands.registerCommand('musicPlayer.next', () => {
      player?.next();
    }),

    vscode.commands.registerCommand('musicPlayer.prev', () => {
      player?.prev();
    }),

    vscode.commands.registerCommand('musicPlayer.search', () => {
      visualizer?.show();
      // A small delay to let the panel open, then focus the search input
      setTimeout(() => {
        visualizer?.postMessage({ type: 'openSearch' });
      }, 300);
    }),
  );

  // Push disposables
  context.subscriptions.push({ dispose: () => { player?.stop(); statusBar?.dispose(); } });
}

export function deactivate(): void {
  player?.stop();
}

// ── Helper ───────────────────────────────────────────────────────────────────

function startPlayer(
  api:        SpotifyApi,
  visualizer: VisualizerPanel,
  statusBar:  StatusBarController,
  context:    vscode.ExtensionContext,
): void {
  player?.stop();   // stop any existing poller first
  player = new PlayerController(api, visualizer, statusBar);
  player.start();

  // Tell the webview it's connected
  visualizer.postMessage({ type: 'connected' });
}
