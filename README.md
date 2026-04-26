# ♫ VS Code Music Player

A Spotify music player with a **monochrome bar visualizer** that lives permanently at the bottom of VS Code.

---

## Features

- 🎵 **Spotify Connect** — control any Spotify device via OAuth (no Premium required for device control)
- 📊 **Bar Spectrum Visualizer** — animated in the bottom panel, always visible
- 🔍 **In-panel Search** — search and play songs without leaving VS Code
- 🎛 **Status Bar Controls** — play/pause, skip, track name always in the bottom bar
- ⌨️ **Keyboard Shortcuts** — full keyboard control
- 🔄 **Auto-reconnects** — panel and session restore on every VS Code launch

---

## Setup

### 1. Create a Spotify App

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Fill in any name/description
4. Set **Redirect URI** → `http://localhost:8765/callback`
5. Copy your **Client ID**

### 2. Install the Extension

```bash
cd vscode-music-player
npm install
npm run compile
# Press F5 in VS Code to launch in development
```

Or package it:

```bash
npm install -g vsce
vsce package
# Install the .vsix file via VS Code → Extensions → "Install from VSIX..."
```

### 3. Connect Spotify

1. Open Command Palette → `Music Player: Connect Spotify`
2. Paste your **Client ID** when prompted
3. Your browser opens → log in → done ✓

---

## Keyboard Shortcuts

| Action        | Windows/Linux       | Mac               |
|---------------|---------------------|-------------------|
| Play / Pause  | `Ctrl+Shift+Space`  | `Cmd+Shift+Space` |
| Next Track    | `Ctrl+Shift+]`      | `Cmd+Shift+]`     |
| Prev Track    | `Ctrl+Shift+[`      | `Cmd+Shift+[`     |
| Search Songs  | `Ctrl+Shift+M`      | `Cmd+Shift+M`     |

---

## Pinning the Visualizer to the Bottom

The visualizer opens as a panel. To pin it permanently to the bottom:

1. Click and drag the **♫ Music** tab into the Terminal/Output panel area at the bottom
2. VS Code remembers this position — it will reopen there every time

The panel **cannot be closed** by the extension (VS Code security policy prevents this), but it will always reopen automatically when VS Code starts.

---

## Configuration

Open Settings → search `musicPlayer`:

| Setting                    | Default    | Description                        |
|----------------------------|------------|------------------------------------|
| `musicPlayer.clientId`     | `""`       | Your Spotify Client ID             |
| `musicPlayer.visualizerBars` | `20`     | Number of bars (8–40)              |
| `musicPlayer.visualizerColor`| `#ffffff` | Bar color (any hex color)         |

---

## Requirements

- VS Code 1.85+
- A Spotify account (Free works for device control; Premium needed for in-app streaming)
- Node.js 18+ (for development)

---

## Architecture

```
extension.ts          ← activates on startup, wires everything
├── auth/
│   └── spotifyAuth.ts      ← PKCE OAuth2 + token refresh
├── api/
│   └── spotifyApi.ts       ← Spotify Web API (playback, search)
├── player/
│   ├── playerController.ts ← polling, bar animation, command dispatch
│   └── statusBarController.ts ← VS Code status bar items
└── webview/
    └── visualizerPanel.ts  ← the bottom panel HTML/CSS/JS
```
# Vscode-music-player
