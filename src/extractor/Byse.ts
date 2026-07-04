import winston from 'winston';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Fetcher } from '../utils';
import { Extractor } from './Extractor';

interface DetailsRoot {
  embed_frame_url?: string;
}

interface PlaybackRoot {
  playback?: Playback;
}

interface Playback {
  algorithm?: string;
  iv?: string;
  payload?: string;
  key_parts?: string[];
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

function buildAesKey(playback: Playback): Buffer {
  const keyParts = playback.key_parts ?? [];
  const firstPart = keyParts[0] ?? '';
  const secondPart = keyParts[1] ?? '';
  if (!firstPart || !secondPart) {
    throw new Error('Missing key parts');
  }

  return Buffer.concat([base64UrlDecode(firstPart), base64UrlDecode(secondPart)]);
}

function decryptPlayback(playback: Playback): string | null {
  try {
    const payload = playback.payload ?? '';
    if (payload.startsWith('http://') || payload.startsWith('https://')) {
      return payload;
    }

    const keyBytes = buildAesKey(playback);
    const iv = playback.iv ?? '';
    const ivBytes = base64UrlDecode(iv);

    const payloadParts = payload.split('.');
    const cipherPayload = payloadParts[0]!;
    const authTagPayload = payloadParts[1];
    const cipherBytes = base64UrlDecode(cipherPayload);
    const decipher = require('node:crypto').createDecipheriv('aes-128-gcm', keyBytes.subarray(0, 16), ivBytes.subarray(0, 12));

    if (authTagPayload) {
      decipher.setAuthTag(base64UrlDecode(authTagPayload));
    }

    const decrypted = Buffer.concat([decipher.update(cipherBytes), decipher.final()]);

    return decrypted.length > 0 ? decrypted.toString('utf8') : null;
  } catch {
    return null;
  }
}

export class Byse extends Extractor {
  public readonly id = 'byse';

  public readonly label = 'Byse';

  public constructor(fetcher: Fetcher, logger: winston.Logger) {
    super(fetcher, logger);
  }

  public supports(_ctx: Context, url: URL): boolean {
    return ['byse.sx', 'bysezejataos.com', 'bysebuho.com', 'byvepoin.com', 'byseqekaho.com', 'moflix-stream.link'].includes(url.host);
  }

  public override normalize(url: URL): URL {
    return url;
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const detailsUrl = `${getBaseUrl(url.href)}/api/videos/${getCodeFromUrl(url.href)}/embed/details`;
    const details = await this.fetcher.json(ctx, new URL(detailsUrl)) as DetailsRoot;

    const embedFrameUrl = details.embed_frame_url;
    if (!embedFrameUrl) {
      throw new NotFoundError();
    }

    const embedBase = getBaseUrl(embedFrameUrl);
    const embedCode = getCodeFromUrl(embedFrameUrl);
    const playbackUrl = `${embedBase}/api/videos/${embedCode}/embed/playback`;
    const headers = {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.5',
      priority: 'u=1, i',
      referer: embedFrameUrl,
      'x-embed-parent': url.href,
    };

    const playbackRoot = await this.fetcher.json(ctx, new URL(playbackUrl), { headers }) as PlaybackRoot;
    const playback = playbackRoot.playback;
    if (!playback) {
      throw new NotFoundError();
    }

    const streamUrl = decryptPlayback(playback);
    if (!streamUrl) {
      throw new NotFoundError();
    }

    return [{
      url: new URL(streamUrl),
      format: Format.hls,
      meta: {
        ...meta,
        title: this.label,
      },
      requestHeaders: {
        Referer: getBaseUrl(url.href),
      },
    }];
  }
}
