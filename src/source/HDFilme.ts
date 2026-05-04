import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, Id, TmdbId } from '../utils';
import { Source, SourceResult } from './Source';

export class HDFilme extends Source {
  public readonly id = 'hdfilme';

  public readonly label = 'HDFilme';

  public readonly contentTypes: ContentType[] = ['series'];

  public readonly countryCodes: CountryCode[] = [CountryCode.de];

  public readonly baseUrl = 'https://hdfilme.win';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  public async handleInternal(ctx: Context, _type: string, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    if (tmdbId.season === undefined || tmdbId.episode === undefined) {
      return [];
    }

    const seriesPageUrl = await this.fetchSeriesPageUrl(ctx, tmdbId);
    if (!seriesPageUrl) {
      return [];
    }

    const html = await this.fetcher.text(ctx, seriesPageUrl);
    const $ = cheerio.load(html);

    const title = `${($('meta[property="og:title"]').attr('content') as string || 'HDFilme').trim()} ${tmdbId.formatSeasonAndEpisode()}`;

    const staffelHeader = $('.su-spoiler-title').filter((_i, el) =>
      $(el).text().includes(`Staffel ${tmdbId.season}`),
    );

    if (staffelHeader.length === 0) return [];

    const contentArea = staffelHeader.next('.su-spoiler-content');
    const contentHtml = contentArea.html() || '';

    const episodeMarker = `${tmdbId.season}x${tmdbId.episode}`;
    const nextEpisodeMarker = `${tmdbId.season}x${tmdbId.episode + 1}`;

    const startIdx = contentHtml.indexOf(episodeMarker);
    if (startIdx === -1) return [];

    const endIdx = contentHtml.indexOf(nextEpisodeMarker, startIdx);
    const episodeSegment = endIdx === -1 ? contentHtml.substring(startIdx) : contentHtml.substring(startIdx, endIdx);

    const segment$ = cheerio.load(episodeSegment);
    const results: SourceResult[] = [];

    segment$('a').each((_i, el) => {
      const href = segment$(el).attr('href');
      if (!href || href.includes('report-error') || href.startsWith('javascript')) return;

      try {
        const url = new URL(href, this.baseUrl);

        if (!url.host.includes('hdfilme') || url.pathname.includes('player.php')) {
          results.push({
            url,
            meta: {
              countryCodes: [CountryCode.de],
              referer: seriesPageUrl.href,
              title: `${title} (${segment$(el).text().trim() || 'Mirror'})`,
            },
          });
        }
      } catch {
        // Ignore invalid URLs
      }
    });

    return results;
  }

  private fetchSeriesPageUrl = async (ctx: Context, tmdbId: TmdbId): Promise<URL | undefined> => {
    const searchUrl = new URL(`/?story=${tmdbId.id}&do=search&subaction=search`, this.baseUrl);
    const html = await this.fetcher.text(ctx, searchUrl);

    const $ = cheerio.load(html);

    const firstResult = $('.item.relative.mt-3 a[href]').first();

    return firstResult.attr('href') ? new URL(firstResult.attr('href') as string, this.baseUrl) : undefined;
  };
}
