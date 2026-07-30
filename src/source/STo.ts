import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, Id } from '../utils';
import { Source, SourceResult } from './Source';

/* istanbul ignore next */
export const STREAMING_HOSTS = [
  'voe', 'dood', 'streamtape', 'veev', 'vinovo', 'vidhide', 'dhtpre',
  'mixdrop', 'supervideo', 'uqload', 'filelion', 'lulustream', 'fastream',
  'dropload', 'savefiles', 'streamembed', 'vidara', 'vidsonic',
];

/* istanbul ignore next */
export const isStreamingHost = (hostname: string): boolean =>
  STREAMING_HOSTS.some(host => hostname.includes(host));

export class STo extends Source {
  public readonly id = 's-to';
  public readonly label = 'S.to';
  public readonly baseUrl = 'https://serienstream.to';

  public override readonly contentTypes: ContentType[] = ['series' as ContentType];
  public override readonly countryCodes = [CountryCode.de];
  public override readonly priority = 1;

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  protected override async handleInternal(ctx: Context, type: ContentType, id: Id): Promise<SourceResult[]> {
    if (type !== 'series') return [];

    const searchUrl = new URL('/suche', this.baseUrl);
    searchUrl.searchParams.set('term', String(id.id));
    const searchHtml = await this.fetcher.text(ctx, searchUrl);
    const $search = cheerio.load(searchHtml);

    const relativeSeriesLink = $search('a.show-cover[href], a[href*="/serie/"], a[href*="/serien/"]').first().attr('href');
    if (!relativeSeriesLink) return [];

    const season = id.season ?? 1;
    const episode = id.episode ?? 1;
    const targetUrl = new URL(`${relativeSeriesLink}/staffel-${season}/episode-${episode}`, this.baseUrl).href;

    const episodeHtml = await this.fetcher.text(ctx, new URL(targetUrl));
    const $episode = cheerio.load(episodeHtml);

    const results: SourceResult[] = [];

    const linkBoxes = $episode('button.link-box[data-language-id="1"], a.link-box[data-language-id="1"], [data-play-url]').toArray();
    for (const el of linkBoxes) {
      const playPath = $episode(el).attr('data-play-url') ?? $episode(el).attr('href');
      const hostname = $episode(el).attr('data-provider-name') || 'Unknown';

      if (!playPath) continue;

      const streamUrl = await this.resolveStreamUrl(ctx, playPath, targetUrl);

      results.push({
        url: streamUrl,
        meta: {
          countryCodes: [CountryCode.de],
          referer: targetUrl,
          title: `${hostname} (DE) - S${season}E${episode}`,
          sourceLabel: this.label,
        },
      });
    }

    return results;
  }

  private async resolveStreamUrl(ctx: Context, playPath: string, targetUrl: string): Promise<URL> {
    const initialUrl = new URL(playPath, this.baseUrl);

    try {
      const redirectedUrl = await this.fetcher.getFinalRedirectUrl(ctx, initialUrl, {
        headers: { Referer: targetUrl },
      });
      if (redirectedUrl.hostname !== 's.to' || !redirectedUrl.pathname.startsWith('/r')) {
        return redirectedUrl;
      }
    } catch {
      // fall through to a GET-based fallback
    }

    try {
      const response = await this.fetcher.fetch(ctx, initialUrl, {
        headers: { Referer: targetUrl },
        method: 'GET',
        maxRedirects: 10,
      });
      const finalUrlValue = response.request?.res?.responseUrl ?? response.config.url;
      if (finalUrlValue) {
        const finalUrl = new URL(finalUrlValue, this.baseUrl);
        if (finalUrl.hostname !== 's.to' || !finalUrl.pathname.startsWith('/r')) {
          return finalUrl;
        }
      }
    } catch {
      // fall back to the initial URL
    }

    return initialUrl;
  }
}
