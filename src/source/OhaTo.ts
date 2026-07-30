/* istanbul ignore file */

import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types.js';
import { Fetcher, getTmdbId, Id } from '../utils/index.js';
import { Source, SourceResult } from './Source.js';

export class OhaTO extends Source {
  public readonly id = 'ohato';
  public readonly label = 'Oha.to';
  public readonly baseUrl = 'https://oha.to';

  public override readonly contentTypes: ContentType[] = ['movie', 'series'];
  public override readonly countryCodes = [CountryCode.de];
  public override readonly priority = 1;

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  protected override async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const debug = process.env['DEBUG_OHATO'] === '1';

    if (debug) console.log(`OhaTO: handleInternal called for id=${id}`);

    const tmdbId = await getTmdbId(ctx, this.fetcher, id);

    const sourcePayload: any = {
      language: 'de',
      region: 'DE',
      type: tmdbId.season ? 'series' : 'movie',
      ids: { tmdb_id: String(tmdbId.id) },
      name: '',
      ...(tmdbId.season ? { episode: { ids: {}, season: tmdbId.season, episode: tmdbId.episode ?? 1 } } : {}),
    };

    const parseHeightFromString = (text?: string | number | null): number | undefined => {
      if (!text && text !== 0) return undefined;
      if (typeof text === 'number') return text;
      const s = String(text);
      const m = s.match(/(\d{3,4})p/i);
      if (m) return parseInt(m[1]!, 10);
      const m2 = s.match(/(\d{3,4})x(\d{3,4})/i);
      if (m2) return parseInt(m2[2]!, 10);
      const m3 = s.match(/(\d{3,4})/);
      if (m3) return parseInt(m3[1]!, 10);
      if (/4k/i.test(s)) return 2160;
      if (/fhd|1080/i.test(s)) return 1080;
      if (/hd/i.test(s)) return 720;
      return undefined;
    };

    const qualityFromHeight = (h?: number | undefined): string | undefined => {
      if (!h && h !== 0) return undefined;
      if (h >= 2160) return '4K';
      if (h >= 1080) return '1080p';
      if (h >= 720) return '720p';
      if (h >= 480) return '480p';
      return undefined;
    };

    const OHA_SOURCE_URL = 'https://oha.to/mediaurl-source.json';

    let finalData: any;
    try {
      if (debug) console.log(`OhaTO: posting to ${OHA_SOURCE_URL}`);
      finalData = await this.fetcher.json(ctx, new URL(OHA_SOURCE_URL), {
        method: 'POST',
        data: JSON.stringify(sourcePayload),
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'de-DE,de;q=0.9',
          'Origin': 'https://oha.to',
          'Referer': 'https://oha.to/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });
    } catch (e) {
      if (debug) console.log('OhaTO: source request failed', (e as any)?.message || e);
      return [];
    }

    const candidates: any[] = Array.isArray(finalData)
      ? finalData
      : finalData?.streams ?? finalData?.sources ?? finalData?.items ?? [];

    const results: SourceResult[] = [];

    for (const s of candidates) {
      const urlStr = s?.url || s?.file || s?.source || s?.stream;
      if (!urlStr) continue;

      try {
        const url = new URL(urlStr);
        let language: string;
        if (Array.isArray(s.languages) && s.languages[0]) {
          language = String(s.languages[0]).toLowerCase();
        } else if (s.language || s.lang) {
          language = String(s.language || s.lang).toLowerCase();
        } else {
          language = 'de';
        }

        if (language !== 'de') continue;

        const height = parseHeightFromString(
          s.height ?? s.resolution ?? s.res ?? s.quality ?? s.tag
          ?? (Array.isArray(s.qualities) ? s.qualities[0] : undefined) ?? s.name ?? s.title,
        );
        const quality = qualityFromHeight(height) ?? (s.quality || s.tag || (Array.isArray(s.qualities) ? s.qualities[0] : undefined));

        if (debug) console.log(`OhaTO: candidate ${url.href} lang=${language} height=${height ?? 'unknown'}`);

        results.push({
          url,
          meta: {
            countryCodes: [CountryCode.de],
            language,
            ...(quality && { quality }),
            referer: this.baseUrl,
            title: `${s?.name ?? ''} [${language.toUpperCase()}]`.trim(),
            sourceLabel: this.label,
            ...(height && { height }),
          },
        });
      } catch {
        continue;
      }
    }

    return results;
  }
}
