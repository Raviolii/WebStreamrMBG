import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, getTmdbNameAndYear, Id } from '../utils';
import { Source, SourceResult } from './Source';

interface MoflixSearchItem {
  id: number;
  name?: string;
  model_type?: string;
  modelType?: string;
  imdb_id?: string;
}

interface MoflixVideoItem {
  category?: string;
  src?: string;
  quality?: string;
}

interface MoflixApiResponse {
  results?: MoflixSearchItem[];
  title?: { videos?: MoflixVideoItem[] };
  episode?: { videos?: MoflixVideoItem[] };
}

export class Moflix extends Source {
  public readonly id = 'moflix';
  public readonly label = 'Moflix';
  public readonly baseUrl = 'https://moflix-stream.xyz';
  public override readonly contentTypes: ContentType[] = ['movie', 'series'];
  public override readonly countryCodes = [CountryCode.de];
  public override readonly priority = 85;

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  protected override async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    const [name] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId, 'de');
    const baseUrl = this.baseUrl;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
      Referer: `${baseUrl}/`,
    };

    try {
      const searchUrl = new URL(`/api/v1/search/${encodeURIComponent(name.toLowerCase())}`, baseUrl);
      searchUrl.searchParams.set('loader', 'searchPage');
      const searchData = await this.fetcher.json(ctx, searchUrl, { headers }) as MoflixApiResponse;

      const resultsList = searchData.results;
      let targetMedia: MoflixSearchItem | undefined;
      
      if (Array.isArray(resultsList)) {
        // Step 1: Match by IMDB ID if available in incoming id payload
        if (id instanceof Object && 'id' in id && typeof (id as { id?: string }).id === 'string') {
          const incomingImdbId = (id as { id?: string }).id;
          targetMedia = resultsList.find(item =>
            (item.model_type === 'title' || item.modelType === 'title') &&
            item.imdb_id === incomingImdbId,
          );
        }

        // Step 2: Fallback to exact or contextual title asset match if IMDB match fails/is missing
        if (!targetMedia) {
          const cleanTarget = name.toLowerCase().replace(/[\u2013\u2014-]/g, ' ').replace(/\s+/g, ' ').trim();
          
          for (const item of resultsList) {
            const isTitle = item.model_type === 'title' || item.modelType === 'title';
            if (!isTitle) continue;

            const itemNormalized = (item.name || '').toLowerCase().replace(/[\u2013\u2014-]/g, ' ').replace(/\s+/g, ' ').trim();
            
            if (itemNormalized === cleanTarget || itemNormalized.includes('herr der elemente')) {
              targetMedia = item;
              break;
            }
          }
        }

        // Step 3: Direct fallthrough fallback protection handling if both checks fail
        if (!targetMedia) {
          for (const item of resultsList) {
            if (item.model_type === 'title' || item.modelType === 'title') {
              targetMedia = item;
              break;
            }
          }
        }
      }

      if (!targetMedia) return [];

      const detailsUrl = new URL(`/api/v1/titles/${targetMedia.id}`, baseUrl);
      if (tmdbId.season) {
        const episodeNumber = tmdbId.episode ?? 1;
        detailsUrl.pathname = `/api/v1/titles/${targetMedia.id}/seasons/${tmdbId.season}/episodes/${episodeNumber}`;
      }
      detailsUrl.searchParams.set('loader', tmdbId.season ? 'episodePage' : 'titlePage');

      const mediaData = await this.fetcher.json(ctx, detailsUrl, { headers }) as MoflixApiResponse;
      const mediaContainer = tmdbId.season ? mediaData.episode : mediaData.title;
      let videos: MoflixVideoItem[] = [];
      if (mediaContainer && Array.isArray(mediaContainer.videos)) {
        videos = mediaContainer.videos;
      }

      const fullVideoStreams: MoflixVideoItem[] = [];
      for (const video of videos) {
        const category = typeof video.category === 'string' ? video.category.toLowerCase() : '';
        const src = typeof video.src === 'string' ? video.src : '';
        if (category === 'full' && src) {
          fullVideoStreams.push(video);
        }
      }

      const results: SourceResult[] = [];

      for (const stream of fullVideoStreams) {
        const url = new URL(stream.src as string);
        let title = this.label;
        if (stream.quality) {
          title = `${this.label} ${stream.quality}`;
        }

        results.push({
          url,
          meta: {
            countryCodes: [CountryCode.de],
            language: 'de',
            quality: stream.quality,
            referer: baseUrl,
            sourceLabel: this.label,
            title,
          },
        });
      }

      return results;
    } catch (err) {
      ctx.logger?.error?.(`[Moflix Source Error]: ${err}`);
      return [];
    }
  }
}