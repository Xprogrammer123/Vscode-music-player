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
exports.VisualizerPanel = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Bottom-panel WebviewView hosting the visualizer and controls.
 */
class VisualizerPanel {
    constructor(context) {
        this.context = context;
    }
    onCommand(handler) {
        this._onCommand = handler;
    }
    show() {
        void vscode.commands.executeCommand(`workbench.view.extension.${VisualizerPanel.containerId}`);
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'music-visualizr', 'public');
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [mediaRoot],
        };
        webviewView.webview.html = this.buildHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(msg => {
            this._onCommand?.(msg.command, msg.data);
        }, undefined, this.context.subscriptions);
        webviewView.onDidDispose(() => {
            this.view = undefined;
        }, null, this.context.subscriptions);
    }
    /** Called every ~1 s by the poller with fresh playback state */
    update(payload) {
        void this.postMessage({ type: 'state', ...payload });
    }
    /** Push simulated frequency data when no Web Audio is available */
    pushBars(bars) {
        void this.postMessage({ type: 'bars', bars });
    }
    isVisible() {
        return !!this.view;
    }
    postMessage(message) {
        return this.view?.webview.postMessage(message);
    }
    // ── HTML ──────────────────────────────────────────────────────────────────
    buildHtml(webview) {
        const barCount = vscode.workspace
            .getConfiguration('musicPlayer')
            .get('visualizerBars', 80);
        const barColor = vscode.workspace
            .getConfiguration('musicPlayer')
            .get('visualizerColor', '#ffffff');
        const backgroundUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'music-visualizr', 'public', 'visualizer-bg.png'));
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bar-color: ${barColor};
    --bg: #000000;
    --panel: rgba(255, 255, 255, 0.03);
    --muted: rgba(255, 255, 255, 0.45);
    --dim: rgba(255, 255, 255, 0.12);
    --line: rgba(255, 255, 255, 0.18);
    --font: ui-monospace, 'SFMono-Regular', 'Cascadia Code', 'Consolas', monospace;
  }

  html, body {
    background: var(--bg);
    color: #fff;
    font-family: var(--font);
    height: 100%;
    overflow: hidden;
    user-select: none;
  }

  /* ── Layout ── */
  #root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 16px 22px 14px;
    gap: 12px;
    position: relative;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0) 45%),
      radial-gradient(circle at top, rgba(255,255,255,0.08), rgba(0,0,0,0) 55%),
      #000;
  }

  #root::before {
    content: '';
    position: absolute;
    inset: 0;
    background: url('${backgroundUri}') center top / cover no-repeat;
    opacity: 0.12;
    pointer-events: none;
  }

  #root > * {
    position: relative;
    z-index: 1;
  }

  #header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  #meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  #eyebrow {
    font-size: 10px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--muted);
  }

  #track-name {
    font-size: 24px;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  #artist-name {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  #header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  body.compact #root {
    padding: 8px 12px 8px;
    gap: 6px;
  }

  body.compact #eyebrow {
    font-size: 9px;
    letter-spacing: 0.14em;
  }

  body.compact #track-name {
    font-size: 14px;
  }

  body.compact #artist-name {
    font-size: 10px;
  }

  body.compact #header-actions button {
    font-size: 10px;
    padding: 4px 8px;
  }

  /* ── Visualizer canvas ── */
  #vis-wrap {
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
    min-height: 0;
    padding: 8px 0 4px;
    overflow: hidden;
  }

  .bar {
    width: clamp(3px, 0.62vw, 8px);
    background: var(--bar-color);
    border-radius: 999px;
    transition: height 48ms linear, opacity 120ms ease;
    min-height: 2px;
    opacity: 0.9;
    transform-origin: bottom center;
  }

  body.compact #vis-wrap {
    padding: 2px 0 2px;
    gap: 1px;
  }

  body.compact .bar {
    width: clamp(2px, 0.54vw, 5px);
  }

  /* ── Controls row ── */
  #controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 8px 12px;
  }

  body.compact #controls {
    gap: 8px;
    padding: 5px 8px;
  }

  button {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid transparent;
    color: var(--muted);
    font-family: var(--font);
    font-size: 12px;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 999px;
    line-height: 1;
    transition: color 80ms, border-color 80ms, background 80ms, transform 80ms;
  }
  button:hover { color: #fff; border-color: var(--line); background: rgba(255, 255, 255, 0.08); }
  button.primary {
    color: #000;
    background: #fff;
    border-color: #fff;
    min-width: 42px;
    padding: 8px 12px;
  }

  body.compact button {
    font-size: 10px;
    padding: 4px 7px;
  }

  body.compact button.primary {
    min-width: 34px;
    padding: 5px 8px;
  }

  /* ── Progress bar ── */
  #prog-wrap {
    flex: 1;
    height: 4px;
    background: var(--dim);
    border-radius: 999px;
    flex-shrink: 0;
    cursor: pointer;
    position: relative;
    min-width: 80px;
  }
  #prog-fill {
    height: 100%;
    background: var(--bar-color);
    border-radius: 999px;
    width: 0%;
    pointer-events: none;
  }

  /* ── Volume ── */
  #vol-label { font-size: 10px; color: var(--muted); min-width: 32px; text-align: right; }
  #vol-bar { flex: 1; height: 4px; background: var(--dim); border-radius: 999px; cursor: pointer; position: relative; }
  #vol-fill { height: 100%; background: var(--muted); border-radius: 999px; width: 70%; pointer-events: none; }
  #status-text {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    min-width: 86px;
    text-align: center;
  }

  body.compact #status-text {
    min-width: 74px;
    font-size: 10px;
  }

  body.compact #vol-bar {
    height: 3px;
    min-width: 60px;
  }

  body.compact #prog-wrap {
    height: 3px;
    min-width: 56px;
  }

  body.compact #vol-label {
    min-width: 26px;
    font-size: 9px;
  }

  /* ── Search overlay ── */
  #search-overlay {
    display: none;
    flex-direction: column;
    gap: 6px;
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.96);
    padding: 16px 18px;
    z-index: 10;
  }
  #search-overlay.visible { display: flex; }
  #search-input {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--line);
    color: #fff;
    font-family: var(--font);
    font-size: 12px;
    padding: 5px 8px;
    outline: none;
    border-radius: 2px;
    width: 100%;
  }
  #search-input::placeholder { color: #444; }
  #results { flex: 1; overflow-y: auto; }
  .result-item {
    padding: 6px 4px;
    border-bottom: 1px solid #111;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .result-item:hover { background: rgba(255, 255, 255, 0.05); }
  .r-num { color: #444; font-size: 10px; min-width: 14px; }
  .r-info { flex: 1; overflow: hidden; }
  .r-title { color: #ccc; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .r-artist { color: #555; font-size: 10px; }
  .r-dur { color: #444; font-size: 10px; white-space: nowrap; }
  #search-close { align-self: flex-end; background: none; border: none; color: #555; cursor: pointer; font-size: 14px; font-family: var(--font); }
  #search-close:hover { color: #fff; }
</style>
</head>
<body>

<div id="root">
  <div id="header">
    <div id="meta">
      <div id="eyebrow">Music Player</div>
      <div id="track-name">~/ not connected</div>
      <div id="artist-name">Connect Spotify to start playback</div>
    </div>
    <div id="header-actions">
      <button id="btn-search" title="Search songs (Ctrl+Shift+M)">Search</button>
      <button id="btn-shuffle" title="Toggle shuffle">Shuffle</button>
    </div>
  </div>

  <div id="vis-wrap" id="visualizer"></div>

  <div id="controls">
    <button id="btn-prev" title="Previous (Ctrl+Shift+[)">&#9664;&#9664;</button>
    <button id="btn-play" class="primary" title="Play / Pause (Ctrl+Shift+Space)">&#9654;</button>
    <button id="btn-next" title="Next (Ctrl+Shift+])">&#9654;&#9654;</button>
    <div id="prog-wrap" title="Seek">
      <div id="prog-fill"></div>
    </div>
    <div id="status-text">0:00 / 0:00</div>
    <div id="vol-bar" title="Volume">
      <div id="vol-fill"></div>
    </div>
    <span id="vol-label">70%</span>
  </div>
</div>

<!-- Search overlay -->
<div id="search-overlay">
  <button id="search-close">&#10005; close</button>
  <input id="search-input" type="text" placeholder="// search songs..." autocomplete="off" spellcheck="false" />
  <div id="results"></div>
</div>

<script>
(function () {
  const vscode = acquireVsCodeApi();
  const BAR_COUNT = ${barCount};

  const searchOverlay = document.getElementById('search-overlay');
  const searchInput = document.getElementById('search-input');
  const trackName = document.getElementById('track-name');
  const artistName = document.getElementById('artist-name');

  // ── Build visualizer bars ────────────────────────────────────────────────
  const visWrap = document.getElementById('vis-wrap');
  const bars = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const b = document.createElement('div');
    b.className = 'bar';
    b.style.height = '4px';
    visWrap.appendChild(b);
    bars.push(b);
  }

  // ── State ────────────────────────────────────────────────────────────────
  let isPlaying  = false;
  let durationMs = 0;
  let progressMs = 0;
  let localStartTime = null;   // for smooth local progress interpolation
  let animFrame  = null;
  let idlePhase  = 0;          // for idle wave animation
  let lastBarsAt = 0;
  const renderedBars = Array.from({ length: BAR_COUNT }, () => 2);

  function applyCompactMode() {
    const compact = window.innerHeight < 260;
    document.body.classList.toggle('compact', compact);
  }

  applyCompactMode();
  window.addEventListener('resize', applyCompactMode);

  // ── Visualizer animation ─────────────────────────────────────────────────
  // When no real FFT data arrives we simulate an organic spectrum.
  const baseHeights = Array.from({ length: BAR_COUNT }, (_, i) => {
    const mirrored = Math.abs((i - BAR_COUNT / 2) / (BAR_COUNT / 2));
    const envelope = 100 - mirrored * 75;
    return Math.max(14, envelope);
  });

  function animateIdle() {
    if (Date.now() - lastBarsAt < 220) {
      animFrame = requestAnimationFrame(animateIdle);
      return;
    }

    idlePhase += 0.05;
    for (let i = 0; i < BAR_COUNT; i++) {
      const t = idlePhase + i * 0.21;
      const wobble = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.9) * Math.cos(t * 0.45));
      const target = Math.max(2, baseHeights[i] * wobble);
      renderedBars[i] = renderedBars[i] * 0.75 + target * 0.25;
      bars[i].style.height = renderedBars[i] + '%';
      bars[i].style.opacity = renderedBars[i] > 8 ? '1' : '0.24';
    }

    animFrame = requestAnimationFrame(animateIdle);
  }

  function stopAnim() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    bars.forEach((bar, i) => {
      renderedBars[i] = 2;
      bar.style.height = '2px';
      bar.style.opacity = '0.14';
    });
  }

  function smoothBars(input) {
    const out = input.slice();
    for (let i = 1; i < input.length - 1; i++) {
      out[i] = (input[i - 1] + input[i] * 2 + input[i + 1]) / 4;
    }
    return out;
  }

  function applyBars(data) {
    lastBarsAt = Date.now();
    const normalized = Array.from({ length: BAR_COUNT }, (_, i) => Math.max(2, Math.min(98, data[i] ?? 2)));
    const smoothed = smoothBars(smoothBars(normalized));

    smoothed.forEach((v, i) => {
      renderedBars[i] = renderedBars[i] * 0.55 + v * 0.45;
      bars[i].style.height = renderedBars[i] + '%';
      bars[i].style.opacity = renderedBars[i] > 7 ? '1' : '0.22';
    });
  }

  // ── Progress interpolation ───────────────────────────────────────────────
  function updateProgress() {
    if (!isPlaying || !localStartTime || !durationMs) return;
    const elapsed  = Date.now() - localStartTime;
    const current  = Math.min(progressMs + elapsed, durationMs);
    const pct      = durationMs ? (current / durationMs) * 100 : 0;
    document.getElementById('prog-fill').style.width = pct + '%';
    document.getElementById('status-text').textContent =
      formatTime(current) + ' / ' + formatTime(durationMs);
  }

  setInterval(updateProgress, 500);

  // ── Messages from extension host ─────────────────────────────────────────
  window.addEventListener('message', e => {
    const msg = e.data;

    if (msg.type === 'state') {
      isPlaying  = msg.isPlaying;
      durationMs = msg.track?.durationMs ?? 0;
      progressMs = msg.progressMs ?? 0;
      localStartTime = isPlaying ? Date.now() : null;

      document.getElementById('btn-play').innerHTML = isPlaying ? '&#9646;&#9646;' : '&#9654;';

      if (msg.track) {
        const name   = msg.track.name;
        const artist = msg.track.artists?.[0] ?? '';
        trackName.textContent = '~/ ' + name;
        artistName.textContent = artist || 'Unknown artist';
      } else {
        trackName.textContent = '~/ nothing playing';
        artistName.textContent = 'Start playback on an active Spotify device';
      }

      if (msg.volume !== undefined) {
        document.getElementById('vol-fill').style.width = msg.volume + '%';
        document.getElementById('vol-label').textContent = msg.volume + '%';
      }

      if (isPlaying && !animFrame) animateIdle();
      if (!isPlaying) stopAnim();
    }

    if (msg.type === 'bars') {
      if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
      applyBars(msg.bars);
    }

    if (msg.type === 'searchResults') {
      renderResults(msg.results);
    }

    if (msg.type === 'connected') {
      trackName.textContent = '~/ connected';
      artistName.textContent = 'Nothing playing yet';
    }

    if (msg.type === 'openSearch') {
      searchOverlay.classList.add('visible');
      searchInput.focus();
    }
  });

  // ── Controls ─────────────────────────────────────────────────────────────
  document.getElementById('btn-play').addEventListener('click', () =>
    vscode.postMessage({ command: isPlaying ? 'pause' : 'play' }));

  document.getElementById('btn-next').addEventListener('click', () =>
    vscode.postMessage({ command: 'next' }));

  document.getElementById('btn-prev').addEventListener('click', () =>
    vscode.postMessage({ command: 'prev' }));

  document.getElementById('btn-shuffle').addEventListener('click', () =>
    vscode.postMessage({ command: 'shuffle' }));

  // ── Progress bar seek ────────────────────────────────────────────────────
  document.getElementById('prog-wrap').addEventListener('click', e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    vscode.postMessage({ command: 'seek', data: { pct } });
  });

  // ── Volume bar ───────────────────────────────────────────────────────────
  document.getElementById('vol-bar').addEventListener('click', e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    document.getElementById('vol-fill').style.width = pct + '%';
    document.getElementById('vol-label').textContent = pct + '%';
    vscode.postMessage({ command: 'volume', data: { pct } });
  });

  // ── Search ───────────────────────────────────────────────────────────────
  document.getElementById('btn-search').addEventListener('click', () => {
    searchOverlay.classList.add('visible');
    searchInput.focus();
  });

  document.getElementById('search-close').addEventListener('click', () => {
    searchOverlay.classList.remove('visible');
  });

  let searchTimer = null;
  searchInput.addEventListener('input', e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (!q) { document.getElementById('results').innerHTML = ''; return; }
    searchTimer = setTimeout(() => {
      vscode.postMessage({ command: 'search', data: { query: q } });
    }, 400);
  });

  function renderResults(tracks) {
    const container = document.getElementById('results');
    container.innerHTML = '';
    tracks.forEach((track, idx) => {
      const el = document.createElement('div');
      el.className = 'result-item';
      const dur = formatTime(track.durationMs);
      el.innerHTML =
        '<span class="r-num">' + (idx + 1) + '</span>' +
        '<div class="r-info">' +
          '<div class="r-title">' + esc(track.name) + '</div>' +
          '<div class="r-artist">' + esc(track.artists?.[0] ?? '') + '</div>' +
        '</div>' +
        '<span class="r-dur">' + dur + '</span>';
      el.addEventListener('click', () => {
        vscode.postMessage({ command: 'playUri', data: { uri: track.uri } });
        searchOverlay.classList.remove('visible');
        searchInput.value = '';
        document.getElementById('results').innerHTML = '';
      });
      container.appendChild(el);
    });
  }

  // ── Utils ─────────────────────────────────────────────────────────────────
  function formatTime(ms) {
    if (!ms) return '0:00';
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
</script>
</body>
</html>`;
    }
}
exports.VisualizerPanel = VisualizerPanel;
VisualizerPanel.viewType = 'musicPlayer.visualizer';
VisualizerPanel.containerId = 'musicPlayerPanel';
//# sourceMappingURL=visualizerPanel.js.map