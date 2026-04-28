import { createDecipheriv } from 'node:crypto';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import {
  buildMediaFlowProxyHlsUrl,
  supportsMediaFlowProxy,
} from '../utils';
import { Extractor } from './Extractor';

interface FileMoonPlayback {
  algorithm: string;
  iv: string;
  payload: string;
  key_parts: string[];
  expires_at: string;
}

interface FileMoonApiVideo {
  code: string;
  title: string;
  duration_seconds: number;
  download_allowed: boolean;
  playback?: FileMoonPlayback;
}

interface DecryptedSource {
  quality: string;
  label: string;
  mime_type: string;
  url: string;
  bitrate_kbps: number;
  height: number;
  size_bytes: number;
}

interface DecryptedPlayback {
  sources: DecryptedSource[];
  tracks: unknown[];
  poster_url: string;
  expires_at: string;
}

/** Decode a base64url-encoded string to a Buffer */
function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? 0 : 4 - padded.length % 4;
  return Buffer.from(padded + '='.repeat(padding), 'base64');
}

/** Combine base64url-encoded key parts into a single key Buffer */
function combineKeyParts(keyParts: string[]): Buffer {
  const decoded = keyParts.map(part => base64UrlDecode(part));
  const totalLength = decoded.reduce((sum, buf) => sum + buf.length, 0);
  const combined = Buffer.alloc(totalLength);
  let offset = 0;
  for (const buf of decoded) {
    buf.copy(combined, offset);
    offset += buf.length;
  }
  return combined;
}

/** Decrypt AES-256-GCM encrypted payload */
function decryptPlayback(playback: FileMoonPlayback): DecryptedPlayback {
  const key = combineKeyParts(playback.key_parts);
  const iv = base64UrlDecode(playback.iv);
  const payload = base64UrlDecode(playback.payload);

  // GCM auth tag is the last 16 bytes of the payload
  const tag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(0, payload.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(new TextDecoder().decode(decrypted)) as DecryptedPlayback;
}

export class FileMoon extends Extractor {
  public readonly id = 'filemoon';

  public readonly label = 'FileMoon';

  public override viaMediaFlowProxy = true;

  public supports(ctx: Context, url: URL): boolean {
    const supportedDomain = null !== url.host.match(/filemoon/)
      || [
        '1azayf9w.xyz',
        '222i8x.lol',
        '81u6xl9d.xyz',
        '8mhlloqo.fun',
        '96ar.com',
        'bf0skv.org',
        'boosteradx.online',
        'c1z39.com',
        'cinegrab.com',
        'f51rm.com',
        'furher.in',
        'kerapoxy.cc',
        'l1afav.net',
        'moonmov.pro',
        'smdfs40r.skin',
        'xcoic.com',
        'z1ekv717.fun',
      ].includes(url.host);

    return supportedDomain && supportsMediaFlowProxy(ctx);
  }

  public override normalize(url: URL): URL {
    // Extract the file code from the URL path (last segment)
    const code = url.pathname.replace(/\/+$/, '').split('/').at(-1) as string;
    // Normalize to the API endpoint
    return new URL(`/api/videos/${code}`, url);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const headers = { Referer: meta.referer ?? url.href };

    const data = await this.fetcher.json(ctx, url, { headers }) as FileMoonApiVideo;

    if (!data.playback || !data.playback.key_parts || data.playback.key_parts.length === 0) {
      throw new NotFoundError();
    }

    const decrypted = decryptPlayback(data.playback);

    if (!decrypted.sources || decrypted.sources.length === 0) {
      throw new NotFoundError();
    }

    return decrypted.sources
      .filter(source => source.mime_type === 'application/vnd.apple.mpegurl')
      .map((source) => {
        const streamUrl = new URL(source.url);
        const proxyUrl = buildMediaFlowProxyHlsUrl(ctx, streamUrl, headers);

        return {
          url: proxyUrl,
          format: Format.hls,
          meta: {
            ...meta,
            title: data.title,
            ...(source.height && { height: source.height }),
            ...(source.size_bytes && source.size_bytes > 16777216 && { bytes: source.size_bytes }),
          },
        } satisfies InternalUrlResult;
      });
  };
}
