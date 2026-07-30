import { createTestContext } from '../test/index.js';
import { CountryCode } from '../types.js';
import { FetcherMock, ImdbId, TmdbId } from '../utils/index.js';
import { Moflix } from './Moflix.js';
import { Source } from './Source.js';

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

  test('matches by IMDB ID when available', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/find/tt0133093') {
        return {
          movie_results: [{ id: 603 }],
          tv_results: [],
        };
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
          results: [
            { id: 10, model_type: 'title', imdb_id: 'tt0133093' },
            { id: 20, model_type: 'title', imdb_id: 'tt9999999' },
          ],
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/10') {
        return {
          title: {
            videos: [
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/matrix.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new ImdbId('tt0133093', undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/matrix.m3u8');
  });

  test('falls back to title name match when IMDB ID does not match', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/find/tt1111111') {
        return {
          movie_results: [{ id: 604 }],
          tv_results: [],
        };
      }

      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/604') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return {
          results: [
            { id: 10, model_type: 'title', imdb_id: 'tt9999999' },
            { id: 20, model_type: 'title', name: 'the matrix' },
          ],
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/20') {
        return {
          title: {
            videos: [
              { category: 'full', quality: '720p', src: 'https://cdn.example.com/matrix2.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new ImdbId('tt1111111', undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/matrix2.m3u8');
  });

  test('handles special case "herr der elemente"', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'Avatar: The Last Airbender',
          release_date: '2005-01-01',
          original_title: 'Avatar: The Last Airbender',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return {
          results: [
            { id: 30, model_type: 'title', name: 'Herr der Elemente' },
          ],
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/30') {
        return {
          title: {
            videos: [
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/avatar.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/avatar.m3u8');
  });

  test('handles when results is not an array', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return { results: null };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(0);
  });

  test('returns results with missing quality', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return { results: [{ id: 42, model_type: 'title' }] };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/42') {
        return {
          title: {
            videos: [
              { category: 'full', src: 'https://cdn.example.com/stream.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.meta.quality).toBeUndefined();
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/stream.m3u8');
  });

  test('skips videos without full category or missing src', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return { results: [{ id: 42, model_type: 'title' }] };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/42') {
        return {
          title: {
            videos: [
              { category: 'trailer', quality: '1080p', src: 'https://cdn.example.com/trailer.m3u8' },
              { category: 'full', quality: '720p' },
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/full.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/full.m3u8');
  });

  test('handles special case "herr der elemente" title match', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'Some Other Film',
          release_date: '2000-01-01',
          original_title: 'Some Other Film',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return {
          results: [
            { id: 30, model_type: 'title', name: 'Herr der Elemente Season 1' },
          ],
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/30') {
        return {
          title: {
            videos: [
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/avatar.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/avatar.m3u8');
  });

  test('handles videos with non-string category or src', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return { results: [{ id: 42, model_type: 'title' }] };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/42') {
        return {
          title: {
            videos: [
              { category: 123, quality: '1080p', src: 'https://cdn.example.com/stream.m3u8' },
              { category: 'full', quality: '720p', src: 456 },
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/valid.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/valid.m3u8');
  });

  test('skips IMDB ID matching when id is not ImdbId', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return {
          results: [
            { id: 10, model_type: 'title', imdb_id: 'tt0133093' },
            { id: 20, model_type: 'title', name: 'the matrix' },
          ],
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/20') {
        return {
          title: {
            videos: [
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/matrix.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/matrix.m3u8');
  });

  test('handles modelType with camelCase instead of model_type', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return {
          results: [{ id: 42, modelType: 'title' }],
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

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/stream.m3u8');
  });

  test('matches by IMDB ID when available', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      // Handle IMDB to TMDB conversion
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/find/tt0133093') {
        return {
          movie_results: [
            { id: 603, title: 'The Matrix', release_date: '1999-03-31' },
          ],
          tv_results: [],
        };
      }

      // Handle TMDB movie details request
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          original_title: 'The Matrix',
          release_date: '1999-03-31',
        };
      }

      // Handle Moflix search
      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return {
          results: [
            { id: 10, model_type: 'person', imdb_id: 'tt0000001' },
            { id: 20, model_type: 'title', imdb_id: 'tt0133093' },
            { id: 30, model_type: 'title', imdb_id: 'tt0000002' },
          ],
        };
      }

      // Handle Moflix title details
      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/20') {
        return {
          title: {
            videos: [
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/matrix.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const imdbId = new ImdbId('tt0133093');
    const streams = await source.handle(ctx, 'movie', imdbId);

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/matrix.m3u8');
  });

  test('returns empty when results is not an array', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return { results: 'not an array' };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(0);
  });

  test('returns multiple full video streams', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return { results: [{ id: 42, model_type: 'title' }] };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/42') {
        return {
          title: {
            videos: [
              { category: 'full', quality: '720p', src: 'https://cdn.example.com/720p.m3u8' },
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/1080p.m3u8' },
              { category: 'full', src: 'https://cdn.example.com/sd.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(3);
    expect(streams[0]?.meta.quality).toBe('720p');
    expect(streams[1]?.meta.quality).toBe('1080p');
    expect(streams[2]?.meta.quality).toBeUndefined();
  });

  test('skips non-title items when matching by name', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'Some Film',
          release_date: '2000-01-01',
          original_title: 'Some Film',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return {
          results: [
            { id: 10, model_type: 'person', name: 'some film' },
            { id: 20, model_type: 'episode', name: 'some film' },
            { id: 30, model_type: 'title', name: 'some film' },
          ],
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/30') {
        return {
          title: {
            videos: [
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/film.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/film.m3u8');
  });

  test('returns empty when no title or stream found', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'Rare Film',
          release_date: '2000-01-01',
          original_title: 'Rare Film',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return {
          results: [
            { id: 10, model_type: 'person', name: 'person' },
            { id: 20, model_type: 'episode', name: 'episode' },
          ],
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(0);
  });

  test('handles series episode selection', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/tv/100') {
        return {
          name: 'Breaking Bad',
          original_name: 'Breaking Bad',
          first_air_date: '2008-01-20',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return {
          results: [{ id: 99, model_type: 'title' }],
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/titles/99/seasons/')) {
        return {
          episode: {
            videos: [
              { category: 'full', quality: '1080p', src: 'https://cdn.example.com/s01e01.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const tmdbId = new TmdbId(100, 1, 1);
    const streams = await source.handle(ctx, 'series', tmdbId);

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://cdn.example.com/s01e01.m3u8');
  });

  test('handles missing or non-array videos', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603') {
        return {
          title: 'The Matrix',
          release_date: '1999-03-31',
          original_title: 'The Matrix',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return { results: [{ id: 42, model_type: 'title' }] };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/42') {
        return {
          title: {
            videos: 'not an array',
          },
        };
      }

      return {};
    }));

    const streams = await source.handle(ctx, 'movie', new TmdbId(603, undefined, undefined));

    expect(streams).toHaveLength(0);
  });

  test('handles nullish coalescing for episode number', async () => {
    const source = new Moflix(new MoflixTestFetcher(`${__dirname}/__fixtures__/Moflix`, async (_ctx, url) => {
      if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/tv/100') {
        return {
          name: 'Breaking Bad',
          original_name: 'Breaking Bad',
          first_air_date: '2008-01-20',
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname.startsWith('/api/v1/search/')) {
        return {
          results: [{ id: 99, model_type: 'title' }],
        };
      }

      if (url.hostname === 'moflix-stream.xyz' && url.pathname === '/api/v1/titles/99/seasons/2/episodes/1') {
        return {
          episode: {
            videos: [
              { category: 'full', quality: '720p', src: 'https://cdn.example.com/s02e01.m3u8' },
            ],
          },
        };
      }

      return {};
    }));

    const tmdbId = new TmdbId(100, 2, undefined);
    const streams = await source.handle(ctx, 'series', tmdbId);

    expect(streams).toHaveLength(1);
  });
}); ;
