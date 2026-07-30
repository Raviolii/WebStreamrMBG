import crypto from 'node:crypto';
import winston from 'winston';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Fetcher } from '../utils';
import { Extractor } from './Extractor';

declare module '../types' {
  interface Context {
    logger?: {
      error?: (...args: unknown[]) => void;
      info?: (...args: unknown[]) => void;
      warn?: (...args: unknown[]) => void;
      debug?: (...args: unknown[]) => void;
    };
  }
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0';
const AES_KEY = 'kiemtienmua911ca';
const AES_IVS = ['1234567890oiuytr', '0123456789abcdef'];

interface VidStackDecryptedPayload {
  source?: string;
  subtitle?: Record<string, string>;
}

function hexToBytes(input: string): Buffer {
  if (input.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }

  return Buffer.from(input, 'hex');
}

function decryptAesHex(inputHex: string, key: string, iv: string): string {
  const keyBytes = Buffer.from(key, 'utf8');
  const ivBytes = Buffer.from(iv, 'utf8');
  const cipher = crypto.createDecipheriv('aes-128-cbc', keyBytes, ivBytes);
  const decrypted = Buffer.concat([cipher.update(hexToBytes(inputHex)), cipher.final()]);
  return decrypted.toString('utf8');
}

function parseVideoPayload(payloadText: string): VidStackDecryptedPayload {
  for (const iv of AES_IVS) {
    try {
      const decrypted = decryptAesHex(payloadText, AES_KEY, iv);
      const parsed = JSON.parse(decrypted) as VidStackDecryptedPayload;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      // Try next IV
    }
  }

  throw new NotFoundError();
}

export class VidStack extends Extractor {
  public readonly id: string = 'vidstack';

  public readonly label: string = 'VidStack';

  public override readonly ttl: number = 10800000; // 3h

  public constructor(fetcher: Fetcher, logger: winston.Logger) {
    super(fetcher, logger);
  }

  public supports(_ctx: Context, url: URL): boolean {
    return ['server1.uns.bio', 'vidstack.io', 'moflix.rpmplay.xyz', 'moflix.upns.xyz'].includes(url.host);
  }

  public override normalize(url: URL): URL {
    const hash = url.hash.replace(/^#/, '');
    if (!hash) {
      return url;
    }

    return new URL(`${url.origin}/api/v1/video?id=${hash}`);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const headers = {
      'Referer': `${url.origin}/`,
      'User-Agent': DEFAULT_USER_AGENT,
    };

    const text = await this.fetcher.text(ctx, url, { headers });
    const payload = parseVideoPayload(text.trim());

    if (!payload.source) {
      throw new NotFoundError();
    }

    const streamUrl = new URL(payload.source);

    const results: InternalUrlResult[] = [
      {
        url: streamUrl,
        format: Format.hls,
        meta: {
          ...meta,
          title: payload.source,
        },
        requestHeaders: headers,
      },
    ];

    return results;
  }
}

export class MoflixRpmplay extends VidStack {
  public override readonly id = 'moflix-rpmplay';

  public override readonly label = 'Moflix RPMPlay';
}
