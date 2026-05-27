import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, Id } from '../utils';
import { Source, SourceResult } from './Source';

interface OhaApiLink {
  url: string;
  name: string;
  language: string;
  icon?: string;
}

export class OhaTO extends Source {
  public readonly id = 'ohato';
  public readonly label = 'Oha.to';
  public readonly baseUrl = 'https://oha.to';
  private readonly apiKey = 'ov262WdL5UdUUz4mwsOKLCFy3mLmLKXiN3Yz';

  public override readonly contentTypes: ContentType[] = ['movie', 'series'];
  public override readonly countryCodes = [CountryCode.de];
  public override readonly priority = 1;

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  private getApiHeaders(): Record<string, string> {
    return {
      Authorization: this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  protected override async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    const results: SourceResult[] = [];

    // Construct the API target ID based on media type
    const ohaId = tmdbId.season
      ? `series.${tmdbId.id}.${tmdbId.season}.${tmdbId.episode ?? 1}`
      : `movie.${tmdbId.id}`;

    const linksUrl = new URL(`/web-vod/api/links?id=${ohaId}`, this.baseUrl);

    let links: OhaApiLink[] = [];
    try {
      links = await this.fetcher.json(ctx, linksUrl, {
        headers: this.getApiHeaders(),
      }) as OhaApiLink[];
    } catch {
      return [];
    }

    if (!Array.isArray(links) || links.length === 0) {
      return [];
    }

    // For each link, hit the streaming endpoint and resolve the final redirect URL
    for (const link of links) {
      if (!link.url) continue;

      try {
        const streamApiUrl = new URL('/web-vod/api/get', this.baseUrl);
        streamApiUrl.searchParams.set('link', link.url);

        const finalUrl = await this.fetcher.getFinalRedirectUrl(ctx, streamApiUrl, {
          headers: this.getApiHeaders(),
        });

        results.push({
          url: finalUrl,
          meta: {
            countryCodes: link.language === 'de' ? [CountryCode.de] : [],
            referer: this.baseUrl,
            title: `${link.name} [${link.language.toUpperCase()}]`,
            sourceLabel: this.label,
          },
        });
      } catch {
        // If a mirror/redirect is dead, skip it
        continue;
      }
    }

    return results;
  }
}