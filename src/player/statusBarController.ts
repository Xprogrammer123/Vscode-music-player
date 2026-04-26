import * as vscode from 'vscode';
import { Track } from '../api/spotifyApi';

/**
 * Manages the lightweight text items in the real VS Code status bar.
 * These sit to the LEFT of the visualizer panel and show track info + controls.
 */
export class StatusBarController {
  private items: vscode.StatusBarItem[] = [];

  private btnPrev:  vscode.StatusBarItem;
  private btnPlay:  vscode.StatusBarItem;
  private btnNext:  vscode.StatusBarItem;
  private lblTrack: vscode.StatusBarItem;
  private lblConn:  vscode.StatusBarItem;

  constructor() {
    // Priority: higher = further left in the status bar
    this.btnPrev  = this.makeItem('$(chevron-left)$(chevron-left)', 'musicPlayer.prev',  'Previous track', 12);
    this.btnPlay  = this.makeItem('$(play)',                        'musicPlayer.play',  'Play / Pause',   11);
    this.btnNext  = this.makeItem('$(chevron-right)$(chevron-right)','musicPlayer.next', 'Next track',     10);
    this.lblTrack = this.makeItem('$(music) Not connected',         'musicPlayer.showPanel', 'Open music panel', 9);
    this.lblConn  = this.makeItem('$(plug) Connect Spotify',        'musicPlayer.connect', 'Connect your Spotify account', 8);

    this.items = [this.btnPrev, this.btnPlay, this.btnNext, this.lblTrack, this.lblConn];
  }

  private makeItem(
    text: string,
    command: string,
    tooltip: string,
    priority: number,
  ): vscode.StatusBarItem {
    const item     = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
    item.text      = text;
    item.command   = command;
    item.tooltip   = tooltip;
    return item;
  }

  showDisconnected(): void {
    this.btnPrev.hide();
    this.btnPlay.hide();
    this.btnNext.hide();
    this.lblTrack.hide();
    this.lblConn.text = '$(plug) Connect Spotify';
    this.lblConn.show();
  }

  showConnected(state: { isPlaying: boolean; track: Track | null }): void {
    this.lblConn.hide();

    this.btnPrev.show();
    this.btnNext.show();

    this.btnPlay.text    = state.isPlaying ? '$(debug-pause)' : '$(play)';
    this.btnPlay.tooltip = state.isPlaying ? 'Pause' : 'Play';
    this.btnPlay.show();

    if (state.track) {
      const name   = this.truncate(state.track.name, 28);
      const artist = this.truncate(state.track.artists[0] ?? '', 18);
      this.lblTrack.text    = `$(music) ${name}  —  ${artist}`;
      this.lblTrack.tooltip = `${state.track.name} · ${state.track.artists.join(', ')} · Click to open panel`;
    } else {
      this.lblTrack.text    = '$(music) Nothing playing';
      this.lblTrack.tooltip = 'Click to open music panel';
    }
    this.lblTrack.show();
  }

  dispose(): void {
    this.items.forEach(i => i.dispose());
  }

  private truncate(str: string, max: number): string {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }
}
