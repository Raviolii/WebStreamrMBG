import * as cheerio from 'cheerio';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { guessHeightFromPlaylist } from '../utils';
import { Extractor } from './Extractor';

function decodeHexUrl(hexString: string): string {
  const joined = hexString.split('|').join('');
  let decoded = '';
  for (let i = 0; i < joined.length; i += 2) {
    decoded += String.fromCharCode(parseInt(joined.substring(i, i + 2), 16));
  }
  return decoded.split('').reverse().join('');
}

export class Vidsonic extends Extractor {
  public readonly id = 'vidsonic';

  public readonly label = 'Vidsonic';

  public override readonly ttl: number = 43200000; // 12h

  public supports(_ctx: Context, url: URL): boolean {
    return /vidsonic\.net/.test(url.host);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    // Mimic the headers from the Python script
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `${url.origin}/`,
      'Origin': url.origin,
    };

    const html = await this.fetcher.text(ctx, url, { headers });

    const $ = cheerio.load(html);
    const title = $('title').text().trim().replace(/^Watch /, '').trim();

    // Regex matches the Python logic: const _0x1 = '...
    const hexMatch = html.match(/const\s*_0x1\s*=\s*'([^']+)/);
    if (!hexMatch || !hexMatch[1]) {
      throw new Error('Could not find hex-encoded video URL in Vidsonic page');
    }

    const m3u8Url = new URL(decodeHexUrl(hexMatch[1]));

    // Compute a dynamic TTL based on the expires parameter
    const expiresParam = m3u8Url.searchParams.get('expires');
    const tokenTtl = expiresParam 
        ? Math.max(900000, Number(expiresParam) * 1000 - Date.now() - 120000) 
        : this.ttl;

    return [
      {
        url: m3u8Url.toString(),
        format: Format.hls,
        ttl: Math.min(tokenTtl, this.ttl),
        meta: {
          ...meta,
          height: meta.height ?? await guessHeightFromPlaylist(ctx, this.fetcher, m3u8Url, { headers }),
          title,
        },
        requestHeaders: headers,
      },
    ];
  }
}
