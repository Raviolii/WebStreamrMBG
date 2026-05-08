import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, Id } from '../utils';
import { Source, SourceResult } from './Source';

export class STo extends Source {
  public readonly id = 's-to';
  public readonly label = 'S.to';
  public readonly baseUrl = 'https://s.to';

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

    // 1. Search by IMDb ID
    const searchUrl = `${this.baseUrl}/suche?term=${id.id}`;
    const searchHtml = await this.fetcher.text(ctx, new URL(searchUrl));
    const $search = cheerio.load(searchHtml);

    // 2. Get the series path (e.g., /serie/the-boys)
    const relativeSeriesLink = $search('.col-6.col-md-4.col-lg-2 a.show-cover').attr('href');
    if (!relativeSeriesLink) return [];

    // 3. Build the Staffel/Episode URL
    const season = id.season ?? 1;
    const episode = id.episode ?? 1;
    const targetUrl = new URL(`${relativeSeriesLink}/staffel-${season}/episode-${episode}`, this.baseUrl).href;

    // 4. Fetch the specific episode page
    const episodeHtml = await this.fetcher.text(ctx, new URL(targetUrl));
    const $episode = cheerio.load(episodeHtml);

    const results: SourceResult[] = [];

    // 5. Target only German links
    // S.to uses data-language-id="1" for German
    $episode('button.link-box[data-language-id="1"]').each((_i, el) => {
      const playPath = $episode(el).attr('data-play-url');
      const providerName = $episode(el).attr('data-provider-name') || 'Unknown';

      if (playPath) {
        // Construct the full redirect URL: https://s.to/r?t=...
        const fullRedirectUrl = new URL(playPath, this.baseUrl).href;

        results.push({
          url: new URL(fullRedirectUrl),
          meta: {
            countryCodes: [CountryCode.de],
            referer: targetUrl,
            title: `${providerName} (DE) - S${season}E${episode}`,
            sourceLabel: this.label,
          },
        });
      }
    });

    return results;
  }
}
