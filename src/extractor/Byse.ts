import * as crypto from 'crypto';
import winston from 'winston';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Fetcher } from '../utils';
import { Extractor } from './Extractor';

export class Byse extends Extractor {
  public readonly id = 'byse';

  public readonly label = 'Byse';

  private readonly UA = 'Mozilla/5.0 (Linux; Android 10; TX6s) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

  public constructor(fetcher: Fetcher, logger: winston.Logger) {
    super(fetcher, logger);
  }

  public supports(_ctx: Context, url: URL): boolean {
    const supportedDomain = null !== url.host.match(/(?:filemoon|cinegrab|moonmov|kerapoxy|furher|1azayf9w|81u6xl9d|f16px|sb1254w9megshle|smdfs40r|bf0skv|z1ekv717|l1afav|222i8x|8mhlloqo|96ar|xcoic|f51rm|c1z39|boosteradx|vepoin|streamlyplayero?|(?:embedplay)?byse(?:sayeveum|tayico|zejataos|koze|sukior|jikuar|fujedu|dikamoum|buho|wihe|lapuix)?)/);

    return supportedDomain !== null;
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const urlMatch = url.href.match(/\/(?:e|d|download)\/([0-9a-zA-Z]+)/);
    if (!urlMatch) {
      throw new NotFoundError();
    }

    const mediaId = urlMatch[1] as string;
    const host = url.hostname || url.host || '';
    if (!host) {
      throw new NotFoundError();
    }

    const webUrl = this.getUrl(host, mediaId);
    const ref = new URL('/', webUrl).href;

    const jsonHeaders: Record<string, string> = {
      'User-Agent': this.UA,
      'Referer': ref,
      'Origin': ref.slice(0, -1),
      'Content-Type': 'application/json',
    };

    let details: any;
    let embed = '';

    try {
      details = await this.fetcher.json(ctx, new URL(`${ref}api/videos/${mediaId}/details`), { headers: jsonHeaders });
    } catch (error: any) {
      if (error.response?.status === 404) {
        embed = 'embed/';
        try {
          details = await this.fetcher.json(ctx, new URL(`${ref}api/videos/${mediaId}/${embed}details`), { headers: jsonHeaders });
        } catch {
          throw new NotFoundError();
        }
      } else {
        throw new NotFoundError();
      }
    }

    const headers: Record<string, string> = {
      'User-Agent': this.UA,
      'Referer': ref,
      'Origin': ref.slice(0, -1),
    };

    const embedUrl = details?.embed_frame_url;
    if (embedUrl) {
      const embedRef = new URL('/', embedUrl).href;
      headers['X-Embed-Parent'] = webUrl;
      headers['Referer'] = embedRef;
      headers['Origin'] = embedRef.slice(0, -1);
    }

    const baseRef = new URL('/', embedUrl || ref).href;
    const settings = await this.fetcher.json(ctx, new URL(`${baseRef}api/videos/${mediaId}/${embed}settings`), { headers: jsonHeaders });

    let data: any;
    if (settings?.captcha_required) {
      const challenge = await this.fetcher.json(ctx, new URL(`${baseRef}api/videos/access/challenge`), {
        method: 'POST',
        headers: jsonHeaders,
        data: {},
      });

      const attest = await this.fetcher.json(ctx, new URL(`${baseRef}api/videos/access/attest`), {
        method: 'POST',
        headers: jsonHeaders,
        data: this.wn(challenge),
      });

      const fingerprint = {
        token: attest.token,
        viewer_id: attest.viewer_id,
        device_id: attest.device_id,
        confidence: attest.confidence,
      };

      const captcha = await this.fetcher.json(ctx, new URL(`${baseRef}api/videos/${mediaId}/${embed}captcha`), {
        method: 'POST',
        headers: jsonHeaders,
        data: { fingerprint },
      });

      const solution = this.er(captcha.pow_nonce, captcha.pow_difficulty);
      if (solution === null) {
        throw new NotFoundError();
      }

      const verify = await this.fetcher.json(ctx, new URL(`${baseRef}api/videos/${mediaId}/${embed}captcha/verify`), {
        method: 'POST',
        headers: jsonHeaders,
        data: {
          pow_token: captcha.pow_token,
          solution,
          fingerprint,
        },
      });

      headers['X-Captcha-Token'] = verify.token;
      data = await this.fetcher.json(ctx, new URL(`${baseRef}api/videos/${mediaId}/${embed}playback`), {
        method: 'POST',
        headers: jsonHeaders,
        data: { fingerprint },
      });
    } else {
      data = await this.fetcher.json(ctx, new URL(`${baseRef}api/videos/${mediaId}/${embed}playback`), {
        method: 'POST',
        headers: jsonHeaders,
        data: this.fp(16, 0.83, 0.94),
      });
    }

    const sources = Array.isArray(data?.sources) ? data.sources : null;
    if (sources && sources.length > 0) {
      const availableSources = sources.filter((source: any): source is { url: string; label?: string } => !!source?.url);
      const selectedSource = availableSources
        .sort((a: { url: string; label?: string }, b: { url: string; label?: string }) => (parseInt(a.label ?? '', 10) || 0) - (parseInt(b.label ?? '', 10) || 0)).pop();

      if (selectedSource) {
        let sourceUrl = selectedSource.url;
        if (sourceUrl.startsWith('/')) {
          sourceUrl = new URL(sourceUrl, baseRef).href;
        }

        return [
          {
            url: new URL(sourceUrl),
            format: Format.hls,
            label: selectedSource.label || 'Byse',
            requestHeaders: headers,
            meta,
          },
        ];
      }
    }

    const pd = data?.playback;
    if (pd) {
      const decrypted = this.decryptPlaybackData(pd);
      const playbackData = JSON.parse(decrypted);
      const decryptedSources = Array.isArray(playbackData?.sources) ? playbackData.sources : null;

      if (decryptedSources && decryptedSources.length > 0) {
        const availableSources = decryptedSources.filter((source: any): source is { url: string; label?: string } => !!source?.url);
        const selectedSource = availableSources
          .sort((a: { url: string; label?: string }, b: { url: string; label?: string }) => (parseInt(a.label ?? '', 10) || 0) - (parseInt(b.label ?? '', 10) || 0)).pop();

        if (selectedSource) {
          let sourceUrl = selectedSource.url;
          if (sourceUrl.startsWith('/')) {
            sourceUrl = new URL(sourceUrl, baseRef).href;
          }

          delete headers['X-Embed-Parent'];
          delete headers['X-Captcha-Token'];

          return [
            {
              url: new URL(sourceUrl),
              format: Format.hls,
              label: selectedSource.label || 'Byse',
              requestHeaders: headers,
              meta,
            },
          ];
        }
      }
    }

    throw new NotFoundError();
  }

  private getUrl(host: string, mediaId: string): string {
    const redirectDomains = ['boosteradx.online', 'byse.sx', 'streamlyplayer.online'];
    const finalHost = redirectDomains.includes(host) ? 'streamlyplayero.online' : host;
    return `https://${finalHost}/e/${mediaId}`;
  }

  private base64UrlDecode(value: string): Buffer {
    let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad > 0) {
      base64 += '='.repeat(4 - pad);
    }
    return Buffer.from(base64, 'base64');
  }

  private base64UrlEncode(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private fh(value: number): string {
    return this.base64UrlEncode(crypto.createHash('sha256').update(value.toString(), 'ascii').digest());
  }

  private decryptPlaybackData(pd: any): string {
    if (!pd?.iv || !pd?.payload || !pd?.key_parts) {
      throw new Error('Invalid playback encryption payload');
    }

    const iv = this.base64UrlDecode(pd.iv);
    const key = this.getKeyFromParts(pd.key_parts, pd.version);
    const payload = this.base64UrlDecode(pd.payload);

    const authTag = payload.slice(payload.length - 16);
    const cipherText = payload.slice(0, payload.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);

    return decrypted.toString('latin1');
  }

  private getKeyFromParts(keyParts: string[], version?: string): Buffer {
    const parts: Buffer[] = [];
    if (typeof version === 'string' && version.length > 0) {
      const v = parseInt(version, 10);
      if (Number.isInteger(v) && v > 0 && v <= keyParts.length) {
        const selectedParts = [keyParts[v - 1], keyParts[keyParts.length - v]];
        selectedParts.forEach(part => {
          if (typeof part === 'string') {
            parts.push(this.base64UrlDecode(part));
          }
        });
      }
    }

    if (parts.length === 0) {
      keyParts.forEach(part => {
        if (typeof part === 'string') {
          parts.push(this.base64UrlDecode(part));
        }
      });
    }

    return Buffer.concat(parts);
  }

  private fp(x: number, y: number, z: number): any {
    const viewerId = crypto.randomBytes(x).toString('hex');
    const deviceId = crypto.randomBytes(x).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const tData = {
      viewer_id: viewerId,
      device_id: deviceId,
      confidence: Number((Math.random() * (z - y) + y).toFixed(2)),
      iat: now,
      exp: now + 600,
    };
    const tBdata = this.base64UrlEncode(Buffer.from(JSON.stringify(tData), 'utf8'));
    const tSig = this.base64UrlEncode(crypto.createHash('sha256').update(tBdata).digest());
    const token = `${tBdata}.${tSig}`;

    return { fingerprint: { token, viewer_id: viewerId, device_id: deviceId, confidence: tData.confidence } };
  }

  private wn(ch: any): any {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' }) as any;
    const signature = crypto.sign(null, Buffer.from(ch.nonce, 'ascii'), privateKey);

    return {
      viewer_id: '',
      device_id: '',
      challenge_id: ch.challenge_id,
      nonce: ch.nonce,
      signature: this.base64UrlEncode(signature),
      public_key: {
        crv: 'P-256',
        ext: true,
        key_ops: ['verify'],
        kty: 'EC',
        x: jwk.x,
        y: jwk.y,
      },
      client: {
        user_agent: this.UA,
        architecture: 'arm',
        bitness: '32',
        platform: 'Android',
        platform_version: '10.0.0',
        model: 'TX6s',
        ua_full_version: '137.0.7337.0',
        brand_full_versions: [{ brand: 'Chromium', version: '137.0.7337.0' }],
        pixel_ratio: 1,
        screen_width: 1280,
        screen_height: 720,
        color_depth: 24,
        languages: ['en-US'],
        timezone: 'America/New_York',
        hardware_concurrency: 4,
        device_memory: 2,
        touch_points: 1,
        webgl_vendor: 'Google Inc. (ARM)',
        webgl_renderer: 'ANGLE (ARM, Mali-G31 MP2, OpenGL ES 3.2)',
        canvas_hash: this.fh(Math.random()),
        audio_hash: this.fh(Math.random() + 1),
        webgl_params_hash: this.fh(Math.random() + 2),
        fonts_hash: this.fh(Math.random() + 3),
        codecs_hash: this.fh(Math.random() + 4),
        media_devices: 'ai1ao1vi4',
        pointer_type: 'coarse',
        extra: {
          vendor: 'Google Inc.',
          appVersion: this.UA.replace(/^Mozilla\//, ''),
        },
      },
      storage: {},
      attributes: { entropy: 'high' },
    };
  }

  private re(t: number, e: number): number {
    return ((t << e) | (t >>> (32 - e))) & 0xffffffff;
  }

  private ye(t: [number, number, number, number]): void {
    const m = 0xffffffff;
    t[0] = (t[0] + t[1]) & m;
    t[3] = this.re(t[3] ^ t[0], 16);
    t[2] = (t[2] + t[3]) & m;
    t[1] = this.re(t[1] ^ t[2], 12);
    t[0] = (t[0] + t[1]) & m;
    t[3] = this.re(t[3] ^ t[0], 8);
    t[2] = (t[2] + t[3]) & m;
    t[1] = this.re(t[1] ^ t[2], 7);
  }

  private gr(t: Buffer): number[] {
    const m = 0xffffffff;
    const e: [number, number, number, number] = [1779033703, 3144134277, 1013904242, 2773480762];
    const be = 512;
    const lt = 511;
    const dr = 2;
    const lr = 2654435761;
    const hr = 2246822519;

    for (const i of t) {
      e[0] = (e[0] + i) & m;
      e[0] = this.re(e[0], 7);
      this.ye(e);
    }

    for (let i = 0; i < 8; i += 1) {
      this.ye(e);
    }

    const r: number[] = new Array<number>(be).fill(0);
    for (let i = 0; i < be; i += 1) {
      this.ye(e);
      r[i] = (e[0] ^ e[2]) & m;
    }

    for (let i = 0; i < dr; i += 1) {
      for (let s = 0; s < be; s += 1) {
        const a = (r[s] ?? 0) & lt;
        let c = ((r[s] ?? 0) + (r[a] ?? 0)) & m;
        c = this.re(c, 13);
        c = (c ^ (((r[(s + 1) & lt] ?? 0) * lr) & m)) & m;
        r[s] = c;
        e[0] = (e[0] ^ c) & m;
        this.ye(e);
      }
    }

    const n = new Array<number>(8).fill(0);
    const o = be / 8;
    for (let i = 0; i < 8; i += 1) {
      this.ye(e);
      let s = e[0];
      const a = i * o;
      for (let c = 0; c < o; c += 1) {
        const d = r[a + c] ?? 0;
        s = (s + d) & m;
        s = this.re(s, 5);
        s = (s ^ ((d * hr) & m)) & m;
      }
      n[i] = (s ^ e[2]) & m;
    }

    return n;
  }

  private wr(t: number[]): number {
    let e = 0;
    for (const n of t) {
      if (n === 0) {
        e += 32;
        continue;
      }
      return e + (32 - n.toString(2).length);
    }
    return e;
  }

  private er(nonce: string, difficulty: number, timeoutSeconds = 20): string | null {
    if (difficulty <= 0) {
      return '0';
    }

    const start = Date.now();
    let s = 0;
    const prefix = `${nonce}:`;

    while (true) {
      for (let i = 0; i < 1024; i += 1) {
        const digest = this.gr(Buffer.from(prefix + s.toString(), 'ascii'));
        if (this.wr(digest) >= difficulty) {
          return s.toString();
        }
        s += 1;
      }

      if ((Date.now() - start) / 1000 > timeoutSeconds) {
        return null;
      }
    }
  }
}
