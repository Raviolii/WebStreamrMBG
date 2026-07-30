import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, getTmdbNameAndYear, Id } from '../utils';
import { Source, SourceResult } from './Source';

const STREAMING_HOSTS = [
  'voe', 'dood', 'streamtape', 'veev', 'vinovo', 'vidhide', 'dhtpre',
  'mixdrop', 'supervideo', 'uqload', 'filelion', 'lulustream', 'fastream',
  'dropload', 'savefiles', 'streamembed', 'vidara', 'vidsonic',
];

const isStreamingHost = (hostname: string): boolean =>
  STREAMING_HOSTS.some(host => hostname.includes(host));

const resolveHref = (href: string, baseUrl: string): URL => {
  const fullHref = href.startsWith('//') ? `https:${href}` : href;
  return new URL(fullHref.startsWith('http') ? fullHref : `${baseUrl}${fullHref}`);
};

export class FilmpalastTO extends Source {
  public readonly id = 'filmpalast';
  public readonly label = 'Filmpalast';
  public readonly baseUrl = 'https://filmpalast.to';

  public override readonly contentTypes: ContentType[] = ['movie' as ContentType, 'series' as ContentType];
  public override readonly countryCodes = [CountryCode.de];
  public override readonly priority = 1;

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  protected override async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);

    const [name, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId, 'de');

    let streamPageUrl: URL | undefined;
    try {
      streamPageUrl = await this.fetchStreamPageUrl(ctx, name, year, tmdbId.season, tmdbId.episode);
    } catch {
      return [];
    }
    if (!streamPageUrl) {
      return [];
    }

    const title = tmdbId.season
      ? `${name} ${tmdbId.formatSeasonAndEpisode()}`
      : `${name} (${year})`;

    const html = await this.fetcher.text(ctx, streamPageUrl);
    const $ = cheerio.load(html);

    const results: SourceResult[] = [];

    $('ul.currentStreamLinks').each((_i, streamBlock) => {
      const hostName = $(streamBlock).find('.hostName').text().trim();

      $(streamBlock).find('a[data-player-url]').each((_j, el) => {
        const playerUrl = $(el).attr('data-player-url');
        if (playerUrl?.startsWith('http')) {
          results.push({
            url: new URL(playerUrl),
            meta: {
              countryCodes: [CountryCode.de],
              referer: streamPageUrl.href,
              title: `${hostName} - ${title}`,
              sourceLabel: this.label,
            },
          });
        }
      });

      $(streamBlock).find('a[href]').each((_j, el) => {
        const href = $(el).attr('href');
        if (!href || href === '#' || href.startsWith('javascript') || href.includes('filmpalast.to') || $(el).attr('data-player-url')) {
          return;
        }

        try {
          const url = resolveHref(href, this.baseUrl);

          if (isStreamingHost(url.hostname)) {
            results.push({
              url,
              meta: {
                countryCodes: [CountryCode.de],
                referer: streamPageUrl.href,
                title: `${hostName} - ${title}`,
                sourceLabel: this.label,
              },
            });
          }
        } catch {
          // Invalid URL, skip
        }
      });
    });

    return results;
  }

  private readonly fetchStreamPageUrl = async (
    ctx: Context,
    name: string,
    year: number,
    season: number | undefined,
    episode: number | undefined,
  ): Promise<URL | undefined> => {
    const searchQuery = season
      ? `${name} S${String(season).padStart(2, '0')}E${String(episode ?? 1).padStart(2, '0')}`
      : name;

    const autocompleteUrl = new URL('/autocomplete.php', this.baseUrl);
    let searchResult: string | undefined;

    try {
      const formBody = new URLSearchParams({ term: searchQuery }).toString();
      const autocompleteText = await this.fetcher.textPost(ctx, autocompleteUrl, formBody, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const autocompleteCandidates = JSON.parse(autocompleteText);
      searchResult = this.extractAutocompleteResult(autocompleteCandidates);
    } catch {
      searchResult = undefined;
    }

    if (searchResult && season && episode) {
      const seriesSlug = this.createSeriesSlug(searchResult);
      if (seriesSlug) {
        return new URL(`/stream/${seriesSlug}-s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`, this.baseUrl);
      }
    }

    const searchUrl = new URL(`/search/title/${encodeURIComponent(searchResult ?? searchQuery)}`, this.baseUrl);
    const html = await this.fetcher.text(ctx, searchUrl);
    const $ = cheerio.load(html);

    const streamLinks = $('a[href*="/stream/"]')
      .map((_i, el) => ({
        href: $(el).attr('href') as string,
        title: ($(el).attr('title') ?? $(el).text().trim()) as string,
      }))
      .get();

    if (streamLinks.length === 0) {
      return undefined;
    }

    // For movies: try to match by year first
    if (!season) {
      const yearMatch = streamLinks.find(link => link.title.includes(String(year)));
      if (yearMatch) {
        return resolveHref(yearMatch.href, this.baseUrl);
      }
    }

    // Fallback: use the first result
    const firstLink = streamLinks[0];
    /* istanbul ignore if */
    if (!firstLink) {
      return undefined;
    }
    return resolveHref(firstLink.href, this.baseUrl);
  };

  private readonly extractAutocompleteResult = (candidates: unknown): string | undefined => {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return undefined;
    }

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }

      if (candidate && typeof candidate === 'object') {
        const objectCandidate = candidate as Record<string, unknown>;
        const value = (objectCandidate['value'] as string | undefined)
          ?? (objectCandidate['title'] as string | undefined)
          ?? (objectCandidate['label'] as string | undefined)
          ?? (objectCandidate['name'] as string | undefined);

        if (value && value.trim()) {
          return value.trim();
        }
      }
    }

    return undefined;
  };

  private readonly createSeriesSlug = (text: string): string | undefined => {
    const candidate = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    return candidate || undefined;
  };
}
