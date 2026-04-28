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
exports.SpotifyAuth = void 0;
const vscode = __importStar(require("vscode"));
const http = __importStar(require("http"));
const crypto = __importStar(require("crypto"));
const url = __importStar(require("url"));
const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
    'playlist-read-private',
    'user-library-read',
].join(' ');
const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
class SpotifyAuth {
    constructor(context) {
        this.context = context;
    }
    generateVerifier(length = 64) {
        return crypto.randomBytes(length).toString('base64url').slice(0, length);
    }
    async generateChallenge(verifier) {
        const hash = crypto.createHash('sha256').update(verifier).digest();
        return Buffer.from(hash).toString('base64url');
    }
    async login() {
        const clientId = vscode.workspace.getConfiguration('musicPlayer').get('clientId', '');
        if (!clientId) {
            const entered = await vscode.window.showInputBox({
                prompt: 'Enter your Spotify Client ID (from developer.spotify.com)',
                ignoreFocusOut: true,
            });
            if (!entered)
                return false;
            await vscode.workspace.getConfiguration('musicPlayer').update('clientId', entered, true);
        }
        const id = vscode.workspace.getConfiguration('musicPlayer').get('clientId', '');
        const verifier = this.generateVerifier();
        const challenge = await this.generateChallenge(verifier);
        await this.context.secrets.store('spotify_verifier', verifier);
        const params = new URLSearchParams({
            client_id: id,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            code_challenge_method: 'S256',
            code_challenge: challenge,
            scope: SCOPES,
        });
        const authUri = `${AUTH_URL}?${params.toString()}`;
        const code = await this.waitForCallback(authUri);
        if (!code)
            return false;
        return this.exchangeCode(id, code, verifier);
    }
    async logout() {
        await this.context.secrets.delete('spotify_access_token');
        await this.context.secrets.delete('spotify_refresh_token');
        await this.context.secrets.delete('spotify_verifier');
        await this.context.globalState.update('spotify_token_expiry', undefined);
    }
    async getAccessToken() {
        const token = await this.context.secrets.get('spotify_access_token');
        const expiry = this.context.globalState.get('spotify_token_expiry', 0);
        const refresh = await this.context.secrets.get('spotify_refresh_token');
        if (!token)
            return null;
        if (Date.now() > expiry - 60000 && refresh) {
            return this.refreshToken(refresh);
        }
        return token;
    }
    async isLoggedIn() {
        const token = await this.context.secrets.get('spotify_access_token');
        return Boolean(token);
    }
    waitForCallback(authUri) {
        return new Promise(resolve => {
            const server = http.createServer((req, res) => {
                const parsed = url.parse(req.url || '', true);
                if (parsed.pathname !== '/callback')
                    return;
                const code = parsed.query['code'];
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
          <html><body style="background:#000;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center">
              <div style="font-size:32px;margin-bottom:16px">♫</div>
              <div>Connected to Spotify. You can close this tab.</div>
            </div>
          </body></html>
        `);
                server.close();
                resolve(code || null);
            });
            server.listen(REDIRECT_PORT, () => {
                vscode.env.openExternal(vscode.Uri.parse(authUri));
            });
            setTimeout(() => { server.close(); resolve(null); }, 120000);
        });
    }
    async exchangeCode(clientId, code, verifier) {
        try {
            const body = new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
                code_verifier: verifier,
            });
            const res = await fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });
            const data = await res.json();
            if (!data.access_token)
                return false;
            await this.storeTokens(data);
            return true;
        }
        catch {
            return false;
        }
    }
    async refreshToken(refreshToken) {
        try {
            const clientId = vscode.workspace.getConfiguration('musicPlayer').get('clientId', '');
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
            });
            const res = await fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });
            const data = await res.json();
            if (!data.access_token)
                return null;
            await this.storeTokens(data);
            return data.access_token;
        }
        catch {
            return null;
        }
    }
    async storeTokens(data) {
        await this.context.secrets.store('spotify_access_token', data.access_token);
        if (data.refresh_token) {
            await this.context.secrets.store('spotify_refresh_token', data.refresh_token);
        }
        const expiry = Date.now() + (data.expires_in || 3600) * 1000;
        await this.context.globalState.update('spotify_token_expiry', expiry);
    }
}
exports.SpotifyAuth = SpotifyAuth;
//# sourceMappingURL=spotifyAuth.js.map