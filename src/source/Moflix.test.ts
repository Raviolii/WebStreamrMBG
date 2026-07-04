import { createTestContext } from '../test';
import { CountryCode } from '../types';
import { FetcherMock, TmdbId } from '../utils';
import { Moflix } from './Moflix';
import { Source } from './Source';

const ctx = createTestContext({ de: 'on' });

class MoflixTestFetcher extends FetcherMock {
  public constructor(fixturePath: string, private readonly handler?: (ctx: any, url: URL) => Promise<any>) {
    super(fixturePath);
  }

  public override async json(ctx: any, url: URL): Promise<any> {
    if (this.handler) {
      return this.handler(ctx, url);
    }

    if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
      return {
        title: 'The Matrix',
        release_date: '1999-03-31',
        original_title: 'The Matrix',
      };
    }

    if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
      return {
        results: [{ id: 42, model_type: 'title' }],
      };
    }

    if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/42') {
      return {
        title: {
          videos: [
            { category: 'full', quality: '1080p', src: 'https://cdn.example.com/stream.m3u8' },
          ],
        },
      };
    }

    return super.json(ctx, url);
  }
}

describe('Moflix', () => {
  beforeEach(() => {
    Source.resetCache();
  });

  beforeAll(() => {
    process.env['TMDB_ACCESS_TOKEN'] = 'test-token';
  });

  afterAll(() => {
    delete process.env['TMDB_ACCESS_TOKEN'];
  });

  test('returns full video streams for a movie', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`));
    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/stream.m3u8');
    expect(streams[0]?.meta.quality).toBe('1080p');
    expect(streams[0]?.meta.countryCodes).toEqual([CountryCode.de]);
    expect(streams[0]?.meta.sourceLabel).toBe('Moflix');
  });

  test('returns empty when no search result matches', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return { results: [] };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(0);
  });

  test('handles series episode streams and skips incomplete items', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/tv/603') {
        return {
          name: 'The Matrix',
          first_air_date: '1999-03-31',
          original_name: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return { results: [{ id: 7, model_type: 'title' }] };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/7/seasons/2/episodes/3') {
        return {
          episode: {
            videos: [
              { category: 'full', quality: '720p', src: 'https://cdn.example.com/series.m3u8' },
              { category: 'full', quality: '480p' },
              { category: 'trailer', quality: '1080p', src: 'https://cdn.example.com/trailer.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'series', new TmdbId(603, 2, 3));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/series.m3u8');
    expect(streams[0]?.meta.quality).toBe('720p');
  });

  test('handles The Rookie season 2 episode 1', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/tv/79788') {
        return {
          name: 'The Rookie',
          first_air_date: '2018-10-16',
          original_name: 'The Rookie',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return { results: [{ id: 99, model_type: 'title' }] };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/99/seasons/2/episodes/1') {
        return {
          episode: {
            videos: [
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/rookie.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'series', new TmdbId(79788, 2, 1));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/rookie.m3u8');
    expect(streams[0]?.meta.quality).toBe('1080p');
  });

  test('returns empty when the request throws', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        throw new Error('boom');
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(0);
  });
});
