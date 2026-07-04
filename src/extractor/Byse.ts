import winston from 'winston';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Fetcher } from '../utils';
import { Extractor } from './Extractor';
import crypto from 'crypto';

interface DetailsRoot {
  embed_frame_url?: string;
}

interface SettingsRoot {
  captcha_required?: boolean;
}

interface Source {
  label?: string;
  url?: string;
}

interface Playback {
  algorithm?: string;
  iv?: string;
  payload?: string;
  key_parts?: string[];
  version?: string | number;
  expires_at?: string;
  decrypt_keys?: { edge_1?: string; edge_2?: string; legacy_fallback?: string };
  iv2?: string;
  payload2?: string;
}

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function getBaseUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function getCodeFromUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? '';
}

function base64UrlDecode(input: string): Buffer {
  return decodeBase64Url(input);
}

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function extractUrlFromText(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>]+/);
  return m?.[0] ?? null;
}

function extractEmbedFrameUrlFromText(text: string): string | null {
  const jsonMatch = text.match(/['"]embed_frame_url['"]\s*[:=]\s*['"]([^'"]+)['"]/i);
  if (jsonMatch?.[1]) {
    return jsonMatch[1];
  }
  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+\/embed\/[^\s"'<>]+/i);
  return urlMatch?.[0] ?? null;
}

function xn(parts: string[] | undefined, ver?: string | number | null): Buffer {
  const arr = parts ?? [];
  if (ver !== null && ver !== undefined) {
    const v = typeof ver === 'string' ? parseInt(ver, 10) : ver;
    if (!Number.isNaN(v) && v > 0 && v <= arr.length) {
      const first = arr[v - 1];
      const second = arr[arr.length - v];
      if (first !== undefined && second !== undefined) {
        return Buffer.concat([base64UrlDecode(first), base64UrlDecode(second)]);
      }
    }
  }
  return Buffer.concat(arr.map(base64UrlDecode));
}

function fh(value: number): string {
  const hash = crypto.createHash('sha256');
  hash.update(String(value));
  return base64UrlEncode(hash.digest());
}

function fp(x: number, y: number, z: number) {
  const viewer_id = crypto.randomBytes(x).toString('hex');
  const device_id = crypto.randomBytes(x).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    viewer_id,
    device_id,
    confidence: Math.round((Math.random() * (z - y) + y) * 100) / 100,
    iat: now,
    exp: now + 600,
  };
  const data = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = base64UrlEncode(crypto.createHash('sha256').update(data).digest());
  const token = `${data}.${signature}`;
  payload['token'] = token;
  delete payload['iat'];
  delete payload['exp'];
  return { fingerprint: payload };
}

function wn(ch: Record<string, unknown>) {
  // ECDSA P-256 signing using elliptic
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const EC = require('elliptic').ec;
  const ec = new EC('p256');
  const key = ec.genKeyPair();
  const pub = key.getPublic();
  const x = Buffer.from(pub.getX().toArray('be', 32));
  const y = Buffer.from(pub.getY().toArray('be', 32));
  const nonce = String(ch['nonce'] ?? '');
  const signature = Buffer.from(key.sign(nonce).toDER());
  return {
    viewer_id: '',
    device_id: '',
    challenge_id: ch['challenge_id'],
    nonce,
    signature: base64UrlEncode(signature),
    public_key: {
      crv: 'P-256',
      ext: true,
      key_ops: ['verify'],
      kty: 'EC',
      x: base64UrlEncode(x),
      y: base64UrlEncode(y),
    },
    client: {
      user_agent: 'Mozilla/5.0 (Linux; Android 10; TX6s)',
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
      canvas_hash: fh(Math.random()),
      audio_hash: fh(Math.random() + 1),
      webgl_params_hash: fh(Math.random() + 2),
      fonts_hash: fh(Math.random() + 3),
      codecs_hash: fh(Math.random() + 4),
      media_devices: 'ai1ao1vi4',
      pointer_type: 'coarse',
      extra: { vendor: 'Google Inc.', appVersion: '137.0.7337.0' },
    },
    storage: {},
    attributes: { entropy: 'high' },
  };
}

function re(t: number, e: number): number {
  return ((t << e) | (t >>> (32 - e))) >>> 0;
}

function ye(t: [number, number, number, number]): void {
  const mask = 0xffffffff >>> 0;
  t[0] = (t[0] + t[1]) & mask;
  t[3] = re((t[3] ^ t[0]) >>> 0, 16);
  t[2] = (t[2] + t[3]) & mask;
  t[1] = re((t[1] ^ t[2]) >>> 0, 12);
  t[0] = (t[0] + t[1]) & mask;
  t[3] = re((t[3] ^ t[0]) >>> 0, 8);
  t[2] = (t[2] + t[3]) & mask;
  t[1] = re((t[1] ^ t[2]) >>> 0, 7);
}

function gr(input: Buffer): number[] {
  const mask = 0xffffffff >>> 0;
  const e: [number, number, number, number] = [1779033703, 3144134277, 1013904242, 2773480762].map(x => x >>> 0) as [number, number, number, number];
  const width = 512;
  const maskIndex = 511;
  const rounds = 2;
  const multiplier = 2654435761 >>> 0;
  const xorMultiplier = 2246822519 >>> 0;

  for (const byte of input) {
    e[0] = (e[0] + byte) & mask;
    e[0] = re(e[0], 7);
    ye(e);
  }

  for (let i = 0; i < 8; i++) {
    ye(e);
  }

  const r = new Array<number>(width).fill(0);
  for (let i = 0; i < width; i++) {
    ye(e);
    r[i] = (e[0] ^ e[2]) & mask;
  }

  for (let i = 0; i < rounds; i++) {
    for (let s = 0; s < width; s++) {
      const current = r[s] ?? 0;
      const a = current & maskIndex;
      const next = r[a] ?? 0;
      const c = ((current + next) & mask) >>> 0;
      let value = re(c, 13);
      const nextIndexValue = r[(s + 1) & maskIndex] ?? 0;
      value = (value ^ ((nextIndexValue * multiplier) & mask)) & mask;
      r[s] = value;
      e[0] = (e[0] ^ value) & mask;
      ye(e);
    }
  }

  const result = new Array<number>(8).fill(0);
  const chunk = Math.floor(width / 8);
  for (let i = 0; i < 8; i++) {
    ye(e);
    let s = e[0];
    const offset = i * chunk;
    for (let c = 0; c < chunk; c++) {
      const d = r[offset + c] ?? 0;
      s = (s + d) & mask;
      s = re(s, 5);
      s = (s ^ ((d * xorMultiplier) & mask)) & mask;
    }
    result[i] = (s ^ e[2]) & mask;
  }
  return result;
}

function wr(t: number[]): number {
  let count = 0;
  for (const value of t) {
    if (value === 0) {
      count += 32;
      continue;
    }
    return count + (32 - Math.floor(Math.log2(value)) - 1 + 1);
  }
  return count;
}

function er(token: string, difficulty: number, timeoutSeconds = 20.0): string | null {
  if (difficulty <= 0) {
    return '0';
  }

  const start = Date.now();
  let seed = 0;
  const base = `${token}:`;

  while (true) {
    for (let i = 0; i < 1024; i++) {
      const hash = gr(Buffer.from(base + String(seed)));
      if (wr(hash) >= difficulty) {
        return String(seed);
      }
      seed += 1;
    }

    if ((Date.now() - start) / 1000 > timeoutSeconds) {
      return null;
    }
  }
}

function sourceQuality(label?: string): number {
  if (!label) {
    return 0;
  }
  const normalized = label.toLowerCase();
  const match = normalized.match(/(\d+)p/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  if (normalized.includes('1080')) return 1080;
  if (normalized.includes('720')) return 720;
  if (normalized.includes('480')) return 480;
  if (normalized.includes('360')) return 360;
  if (normalized.includes('240')) return 240;
  return 0;
}

function sortSourcesList(sources: Source[]): Source[] {
  return [...sources].sort((a, b) => {
    const qa = sourceQuality(a.label);
    const qb = sourceQuality(b.label);
    if (qa !== qb) {
      return qb - qa;
    }
    const au = a.url ?? '';
    const bu = b.url ?? '';
    return au.localeCompare(bu);
  });
}

function pickSource(sources: Source[]): string | undefined {
  return sources.find(source => typeof source.url === 'string' && source.url.trim() !== '')?.url;
}

export class Byse extends Extractor {
  public static readonly UA = 'Mozilla/5.0 (Linux; Android 10; TX6s) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

  public readonly id = 'byse';

  public readonly label = 'Byse';

  public constructor(fetcher: Fetcher, logger: winston.Logger) {
    super(fetcher, logger);
  }

  public supports(_ctx: Context, url: URL): boolean {
    return [
      'f16px.com', 'bysesayeveum.com', 'bysetayico.com', 'bysevepoin.com', 'bysezejataos.com',
      'bysekoze.com', 'bysesukior.com', 'bysejikuar.com', 'bysefujedu.com', 'bysedikamoum.com',
      'bysebuho.com', 'byse.sx', 'filemoon.sx', 'filemoon.to', 'filemoon.in', 'filemoon.link',
      'filemoon.wf', 'cinegrab.com', 'filemoon.eu', 'filemoon.art', 'moonmov.pro', '96ar.com',
      'kerapoxy.cc', 'furher.in', '1azayf9w.xyz', '81u6xl9d.xyz', 'smdfs40r.skin', 'c1z39.com',
      'bf0skv.org', 'z1ekv717.fun', 'l1afav.net', '222i8x.lol', '8mhlloqo.fun', 'f51rm.com',
      'xcoic.com', 'filemoon.nl', 'boosteradx.online', 'streamlyplayer.online', 'bysewihe.com',
      'byselapuix.com', 'embedplaybyse.top', 'sb1254w9megshle.org', 'streamlyplayero.online',
      'moflix-stream.link',
    ].includes(url.host);
  }

  public override normalize(url: URL): URL {
    return url;
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const normalizedUrl = this.normalize(url);
    const mediaId = getCodeFromUrl(normalizedUrl.href);
    const webUrl = normalizedUrl.href;
    const ref = `${getBaseUrl(webUrl)}/`;
    const headers: Record<string, string> = {
      'User-Agent': Byse.UA,
      Referer: ref,
      Origin: ref.slice(0, -1),
    };

    let embed = '';
    let detailsUrl = `${ref}api/videos/${mediaId}/details`;
    let details: DetailsRoot | undefined;

    try {
      details = await this.fetcher.json(ctx, new URL(detailsUrl), { headers }) as DetailsRoot;
      if (!details.embed_frame_url) {
        embed = 'embed/';
        detailsUrl = `${ref}api/videos/${mediaId}/${embed}details`;
        details = await this.fetcher.json(ctx, new URL(detailsUrl), { headers }) as DetailsRoot;
      }
    } catch (error) {
      const detailsText = await this.fetcher.text(ctx, new URL(detailsUrl), { headers }).catch(() => undefined);
      const embedFrameUrl = detailsText ? extractEmbedFrameUrlFromText(detailsText) : null;
      if (embedFrameUrl) {
        details = { embed_frame_url: embedFrameUrl };
      } else {
        embed = 'embed/';
        detailsUrl = `${ref}api/videos/${mediaId}/${embed}details`;
        try {
          details = await this.fetcher.json(ctx, new URL(detailsUrl), { headers }) as DetailsRoot;
        } catch (errorEmbed) {
          const detailsEmbedText = await this.fetcher.text(ctx, new URL(detailsUrl), { headers }).catch(() => undefined);
          const embedFrameUrlFromEmbedDetails = detailsEmbedText ? extractEmbedFrameUrlFromText(detailsEmbedText) : null;
          if (embedFrameUrlFromEmbedDetails) {
            details = { embed_frame_url: embedFrameUrlFromEmbedDetails };
          } else {
            throw new NotFoundError();
          }
        }
      }
    }

    const embedUrl = details.embed_frame_url;
    const embedRef = embedUrl ? `${getBaseUrl(embedUrl)}/` : ref;
    if (embedUrl) {
      headers['X-Embed-Parent'] = webUrl;
      headers['Referer'] = embedRef;
      headers['Origin'] = embedRef.slice(0, -1);
    }

    const playbackId = embedUrl ? getCodeFromUrl(embedUrl) : mediaId;
    const embedPath = embedUrl ? 'embed/' : '';
    const settingsUrl = `${embedRef}api/videos/${playbackId}/${embedPath}settings`;
    let settings: SettingsRoot = { captcha_required: false };
    try {
      settings = await this.fetcher.json(ctx, new URL(settingsUrl), { headers }) as SettingsRoot;
    } catch {
      settings = { captcha_required: false };
    }

    const playbackUrl = `${embedRef}api/videos/${playbackId}/${embedPath}playback`;
    let data: Record<string, unknown> | undefined;
    let playbackBody: Record<string, unknown>;

    if (settings.captcha_required) {
      const challengeUrl = `${ref}api/videos/access/challenge`;
      const challenge = await this.fetcher.json(ctx, new URL(challengeUrl), {
        headers: { ...headers, 'Content-Type': 'application/json' },
        method: 'POST',
        data: JSON.stringify({}),
      }) as Record<string, unknown>;

      const attestUrl = `${ref}api/videos/access/attest`;
      const attest = await this.fetcher.json(ctx, new URL(attestUrl), {
        headers: { ...headers, 'Content-Type': 'application/json' },
        method: 'POST',
        data: JSON.stringify(wn(challenge)),
      }) as Record<string, unknown>;

      const fingerprint = {
        token: attest['token'],
        viewer_id: attest['viewer_id'],
        device_id: attest['device_id'],
        confidence: attest['confidence'],
      };

      const captchaUrl = `${ref}api/videos/${mediaId}/${embed}captcha`;
      const captcha = await this.fetcher.json(ctx, new URL(captchaUrl), {
        headers: { ...headers, 'Content-Type': 'application/json' },
        method: 'POST',
        data: JSON.stringify({ fingerprint }),
      }) as Record<string, unknown>;

      const solution = er(String(captcha['pow_nonce'] ?? ''), Number(captcha['pow_difficulty'] ?? 0));
      if (solution === null) {
        throw new NotFoundError();
      }

      const verifyUrl = `${ref}api/videos/${mediaId}/${embed}captcha/verify`;
      const verify = await this.fetcher.json(ctx, new URL(verifyUrl), {
        headers: { ...headers, 'Content-Type': 'application/json' },
        method: 'POST',
        data: JSON.stringify({ pow_token: captcha['pow_token'], solution, fingerprint }),
      }) as Record<string, unknown>;

      if (verify['token']) {
        headers['X-Captcha-Token'] = String(verify['token']);
      }

      playbackBody = { fingerprint };
    } else {
      playbackBody = fp(16, 0.83, 0.94);
    }

    const resolveUrl = async (uri: string): Promise<URL> => {
      const candidate = new URL(uri, ref);
      if (typeof this.fetcher.getFinalRedirectUrlGet === 'function') {
        try {
          return await this.fetcher.getFinalRedirectUrlGet(ctx, candidate, { headers });
        } catch {
          return candidate;
        }
      }
      return candidate;
    };

    try {
      data = await this.fetcher.json(ctx, new URL(playbackUrl), {
        headers: { ...headers, 'Content-Type': 'application/json' },
        method: 'POST',
        data: JSON.stringify(playbackBody),
      }) as Record<string, unknown>;
    } catch (error) {
      const textResponse = await this.fetcher.textPost?.(ctx, new URL(playbackUrl), JSON.stringify(playbackBody), { headers }).catch(() => undefined)
        ?? await this.fetcher.text(ctx, new URL(playbackUrl), { headers }).catch(() => undefined);
      const candidate = typeof textResponse === 'string' ? extractUrlFromText(textResponse) : null;
      if (candidate) {
        const finalUrl = await resolveUrl(candidate);
        return [{
          url: finalUrl,
          format: Format.hls,
          meta: { ...meta, title: this.label },
          requestHeaders: headers,
        }];
      }

      if (embedUrl) {
        const embedText = await this.fetcher.text(ctx, new URL(embedUrl), { headers }).catch(() => undefined);
        const fallbackUri = typeof embedText === 'string' ? extractUrlFromText(embedText) : null;
        if (fallbackUri) {
          const finalUrl = await resolveUrl(fallbackUri);
          return [{
            url: finalUrl,
            format: Format.hls,
            meta: { ...meta, title: this.label },
            requestHeaders: headers,
          }];
        }
      }

      throw error;
    }

    const sources = Array.isArray(data['sources']) ? data['sources'] as Source[] : undefined;
    if (sources?.length) {
      const sorted = sortSourcesList(sources);
      const uri = pickSource(sorted);
      if (!uri) {
        throw new NotFoundError();
      }
      const finalUrl = await resolveUrl(uri);
      return [{
        url: finalUrl,
        format: Format.hls,
        meta: { ...meta, title: this.label },
        requestHeaders: headers,
      }];
    }

    const playback = data['playback'] as Playback | undefined;
    if (playback) {
      if (playback.payload && (playback.payload.startsWith('http://') || playback.payload.startsWith('https://'))) {
        const finalUrl = await resolveUrl(playback.payload);
        return [{
          url: finalUrl,
          format: Format.hls,
          meta: { ...meta, title: this.label },
          requestHeaders: headers,
        }];
      }

      if (playback.iv && playback.payload) {
        const iv = base64UrlDecode(playback.iv);
        const key = xn(playback.key_parts, playback.version);
        const lastDot = playback.payload.lastIndexOf('.');
        if (lastDot !== -1) {
          const ciphertextPart = playback.payload.slice(0, lastDot);
          const authTagPart = playback.payload.slice(lastDot + 1);
          try {
            const payload = base64UrlDecode(ciphertextPart);
            const authTag = base64UrlDecode(authTagPart);
            const decipher = require('node:crypto').createDecipheriv('aes-128-gcm', key.subarray(0, 16), iv.subarray(0, 12));
            decipher.setAuthTag(authTag);
            const decryptedBuffer = Buffer.concat([decipher.update(payload), decipher.final()]);
            const decryptedText = decryptedBuffer.toString('latin1');
            const decryptedJson = (() => {
              try {
                return JSON.parse(decryptedText) as Record<string, unknown>;
              } catch {
                return undefined;
              }
            })();

            const decryptedSources = Array.isArray(decryptedJson?.['sources']) ? decryptedJson['sources'] as Source[] : undefined;
            if (decryptedSources?.length) {
              const sorted = sortSourcesList(decryptedSources);
              const uri = pickSource(sorted);
              if (!uri) {
                throw new NotFoundError();
              }
              delete headers['X-Embed-Parent'];
              delete headers['X-Captcha-Token'];
              const finalUrl = await resolveUrl(uri);
              return [{
                url: finalUrl,
                format: Format.hls,
                meta: { ...meta, title: this.label },
                requestHeaders: headers,
              }];
            }

            const directUrl = extractUrlFromText(decryptedText);
            if (directUrl) {
              return [{
                url: await resolveUrl(directUrl),
                format: Format.hls,
                meta: { ...meta, title: this.label },
                requestHeaders: headers,
              }];
            }
          } catch {
            throw new NotFoundError();
          }
        }
      }
    }

    throw new NotFoundError();
  }
}
