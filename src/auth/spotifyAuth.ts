import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';
import * as url from 'url';

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'playlist-read-private',
  'user-library-read',
].join(' ');

const REDIRECT_PORT = 8765;
const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}/callback`;
const AUTH_URL      = 'https://accounts.spotify.com/authorize';
const TOKEN_URL     = 'https://accounts.spotify.com/api/token';

export class SpotifyAuth {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // ── PKCE helpers ──────────────────────────────────────────────────────────

  private generateVerifier(length = 64): string {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
  }

  private async generateChallenge(verifier: string): Promise<string> {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return Buffer.from(hash).toString('base64url');
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async login(): Promise<boolean> {
    const clientId = vscode.workspace.getConfiguration('musicPlayer').get<string>('clientId', '');
    if (!clientId) {
      const entered = await vscode.window.showInputBox({
        prompt: 'Enter your Spotify Client ID (from developer.spotify.com)',
        ignoreFocusOut: true,
      });
      if (!entered) return false;
      await vscode.workspace.getConfiguration('musicPlayer').update('clientId', entered, true);
    }

    const id       = vscode.workspace.getConfiguration('musicPlayer').get<string>('clientId', '');
    const verifier = this.generateVerifier();
    const challenge = await this.generateChallenge(verifier);

    await this.context.secrets.store('spotify_verifier', verifier);

    const params = new URLSearchParams({
      client_id:             id,
      response_type:         'code',
      redirect_uri:          REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge:        challenge,
      scope:                 SCOPES,
    });

    const authUri = `${AUTH_URL}?${params.toString()}`;

    // Open browser and wait for callback on local server
    const code = await this.waitForCallback(authUri);
    if (!code) return false;

    return this.exchangeCode(id, code, verifier);
  }

  async logout(): Promise<void> {
    await this.context.secrets.delete('spotify_access_token');
    await this.context.secrets.delete('spotify_refresh_token');
    await this.context.secrets.delete('spotify_verifier');
    await this.context.globalState.update('spotify_token_expiry', undefined);
  }

  async getAccessToken(): Promise<string | null> {
    const token   = await this.context.secrets.get('spotify_access_token');
    const expiry  = this.context.globalState.get<number>('spotify_token_expiry', 0);
    const refresh = await this.context.secrets.get('spotify_refresh_token');

    if (!token) return null;

    // Refresh if within 60s of expiry
    if (Date.now() > expiry - 60_000 && refresh) {
      return this.refreshToken(refresh);
    }

    return token;
  }

  async isLoggedIn(): Promise<boolean> {
    const token = await this.context.secrets.get('spotify_access_token');
    return Boolean(token);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private waitForCallback(authUri: string): Promise<string | null> {
    return new Promise(resolve => {
      const server = http.createServer((req, res) => {
        const parsed = url.parse(req.url || '', true);
        if (parsed.pathname !== '/callback') return;

        const code = parsed.query['code'] as string | undefined;

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

      // Timeout after 2 minutes
      setTimeout(() => { server.close(); resolve(null); }, 120_000);
    });
  }

  private async exchangeCode(clientId: string, code: string, verifier: string): Promise<boolean> {
    try {
      const body = new URLSearchParams({
        client_id:     clientId,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        code_verifier: verifier,
      });

      const res  = await fetch(TOKEN_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString(),
      });
      const data = await res.json() as any;

      if (!data.access_token) return false;
      await this.storeTokens(data);
      return true;
    } catch {
      return false;
    }
  }

  private async refreshToken(refreshToken: string): Promise<string | null> {
    try {
      const clientId = vscode.workspace.getConfiguration('musicPlayer').get<string>('clientId', '');
      const body = new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     clientId,
      });

      const res  = await fetch(TOKEN_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString(),
      });
      const data = await res.json() as any;

      if (!data.access_token) return null;
      await this.storeTokens(data);
      return data.access_token;
    } catch {
      return null;
    }
  }

  private async storeTokens(data: any): Promise<void> {
    await this.context.secrets.store('spotify_access_token', data.access_token);
    if (data.refresh_token) {
      await this.context.secrets.store('spotify_refresh_token', data.refresh_token);
    }
    const expiry = Date.now() + (data.expires_in || 3600) * 1000;
    await this.context.globalState.update('spotify_token_expiry', expiry);
  }
}
