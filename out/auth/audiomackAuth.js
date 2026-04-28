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
exports.AudiomackAuth = void 0;
const vscode = __importStar(require("vscode"));
const http = __importStar(require("http"));
const crypto = __importStar(require("crypto"));
const url = __importStar(require("url"));
/**
 * Audiomack uses OAuth 1.0a (3-legged).
 * Flow:
 *   1. Get a request token from Audiomack
 *   2. Send user to Audiomack login page with that token
 *   3. Catch the callback → exchange for access token + secret
 *   4. Store both in VS Code secret storage
 */
const BASE = 'https://api.audiomack.com/v1';
const REQUEST_URL = `${BASE}/oauth/request_token`;
const AUTHORIZE_URL = 'https://audiomack.com/oauth/authenticate';
const ACCESS_URL = `${BASE}/oauth/access_token`;
const REDIRECT_PORT = 8766;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
class AudiomackAuth {
    constructor(context) {
        this.context = context;
    }
    // ── Public API ────────────────────────────────────────────────────────────
    async login() {
        const { key, secret } = await this.getAppCredentials();
        if (!key || !secret)
            return false;
        // Step 1 — get request token
        const reqToken = await this.getRequestToken(key, secret);
        if (!reqToken) {
            vscode.window.showErrorMessage('Music Player: Could not get Audiomack request token.');
            return false;
        }
        // Step 2 — send user to Audiomack
        const authUrl = `${AUTHORIZE_URL}?oauth_token=${reqToken.token}`;
        const { verifier } = await this.waitForCallback(authUrl);
        if (!verifier)
            return false;
        // Step 3 — exchange for access token
        return this.getAccessToken(key, secret, reqToken.token, reqToken.secret, verifier);
    }
    async logout() {
        await this.context.secrets.delete('am_access_token');
        await this.context.secrets.delete('am_access_secret');
    }
    async isLoggedIn() {
        const t = await this.context.secrets.get('am_access_token');
        return !!t;
    }
    /** Returns headers needed for any signed API request */
    async signedHeaders(method, apiUrl, params = {}) {
        const { key, secret } = await this.getAppCredentials();
        const accessToken = await this.context.secrets.get('am_access_token') ?? '';
        const accessSecret = await this.context.secrets.get('am_access_secret') ?? '';
        const oauthParams = {
            oauth_consumer_key: key,
            oauth_nonce: crypto.randomBytes(16).toString('hex'),
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: String(Math.floor(Date.now() / 1000)),
            oauth_token: accessToken,
            oauth_version: '1.0',
        };
        const allParams = { ...params, ...oauthParams };
        const signature = this.buildSignature(method, apiUrl, allParams, secret, accessSecret);
        oauthParams['oauth_signature'] = signature;
        const header = 'OAuth ' + Object.entries(oauthParams)
            .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
            .join(', ');
        return { Authorization: header, 'Content-Type': 'application/json' };
    }
    // ── Private helpers ───────────────────────────────────────────────────────
    async getAppCredentials() {
        let key = vscode.workspace.getConfiguration('musicPlayer').get('audiomackKey', '');
        let secret = vscode.workspace.getConfiguration('musicPlayer').get('audiomackSecret', '');
        if (!key) {
            key = await vscode.window.showInputBox({
                prompt: 'Enter your Audiomack Consumer Key (from audiomack.com/data-api/docs)',
                ignoreFocusOut: true,
            }) ?? '';
            if (key)
                await vscode.workspace.getConfiguration('musicPlayer').update('audiomackKey', key, true);
        }
        if (!secret) {
            secret = await vscode.window.showInputBox({
                prompt: 'Enter your Audiomack Consumer Secret',
                password: true,
                ignoreFocusOut: true,
            }) ?? '';
            if (secret)
                await this.context.secrets.store('am_consumer_secret', secret);
        }
        // Secret may have been stored in secrets storage on a previous run
        if (!secret) {
            secret = await this.context.secrets.get('am_consumer_secret') ?? '';
        }
        return { key, secret };
    }
    async getRequestToken(consumerKey, consumerSecret) {
        try {
            const method = 'POST';
            const reqUrl = REQUEST_URL;
            const oauthParams = {
                oauth_callback: encodeURIComponent(REDIRECT_URI),
                oauth_consumer_key: consumerKey,
                oauth_nonce: crypto.randomBytes(16).toString('hex'),
                oauth_signature_method: 'HMAC-SHA1',
                oauth_timestamp: String(Math.floor(Date.now() / 1000)),
                oauth_version: '1.0',
            };
            const sig = this.buildSignature(method, reqUrl, oauthParams, consumerSecret, '');
            oauthParams['oauth_signature'] = sig;
            const header = 'OAuth ' + Object.entries(oauthParams)
                .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
                .join(', ');
            const res = await fetch(reqUrl, { method, headers: { Authorization: header } });
            const text = await res.text();
            const parsed = Object.fromEntries(new URLSearchParams(text));
            return parsed.oauth_token
                ? { token: parsed.oauth_token, secret: parsed.oauth_token_secret }
                : null;
        }
        catch {
            return null;
        }
    }
    waitForCallback(authUri) {
        return new Promise(resolve => {
            const server = http.createServer((req, res) => {
                const parsed = url.parse(req.url ?? '', true);
                if (parsed.pathname !== '/callback')
                    return;
                const verifier = parsed.query['oauth_verifier'] ?? '';
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<html><body style="background:#000;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center"><div style="font-size:32px;margin-bottom:16px">♫</div>
          <div>Connected to Audiomack. You can close this tab.</div></div></body></html>`);
                server.close();
                resolve({ verifier });
            });
            server.listen(REDIRECT_PORT, () => vscode.env.openExternal(vscode.Uri.parse(authUri)));
            setTimeout(() => { server.close(); resolve({ verifier: '' }); }, 120000);
        });
    }
    async getAccessToken(consumerKey, consumerSecret, requestToken, requestSecret, verifier) {
        try {
            const method = 'POST';
            const oauthParams = {
                oauth_consumer_key: consumerKey,
                oauth_nonce: crypto.randomBytes(16).toString('hex'),
                oauth_signature_method: 'HMAC-SHA1',
                oauth_timestamp: String(Math.floor(Date.now() / 1000)),
                oauth_token: requestToken,
                oauth_verifier: verifier,
                oauth_version: '1.0',
            };
            const sig = this.buildSignature(method, ACCESS_URL, oauthParams, consumerSecret, requestSecret);
            oauthParams['oauth_signature'] = sig;
            const header = 'OAuth ' + Object.entries(oauthParams)
                .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
                .join(', ');
            const res = await fetch(ACCESS_URL, { method, headers: { Authorization: header } });
            const text = await res.text();
            const parsed = Object.fromEntries(new URLSearchParams(text));
            if (!parsed.oauth_token)
                return false;
            await this.context.secrets.store('am_access_token', parsed.oauth_token);
            await this.context.secrets.store('am_access_secret', parsed.oauth_token_secret);
            return true;
        }
        catch {
            return false;
        }
    }
    // ── OAuth 1.0a signature ──────────────────────────────────────────────────
    buildSignature(method, uri, params, consumerSecret, tokenSecret) {
        const sorted = Object.entries(params)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        const base = [
            method.toUpperCase(),
            encodeURIComponent(uri),
            encodeURIComponent(sorted),
        ].join('&');
        const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
        return crypto.createHmac('sha1', signingKey).update(base).digest('base64');
    }
}
exports.AudiomackAuth = AudiomackAuth;
//# sourceMappingURL=audiomackAuth.js.map