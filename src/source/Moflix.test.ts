import { Moflix } from './Moflix';
import { getTmdbId, getTmdbNameAndYear } from '../utils';

jest.mock('../utils', () => {
  const actual = jest.requireActual('../utils');
  return {
    ...actual,
    getTmdbId: jest.fn(),
    getTmdbNameAndYear: jest.fn(),
  };
});

const mockedGetTmdbId = getTmdbId as jest.Mock;
const mockedGetTmdbNameAndYear = getTmdbNameAndYear as jest.Mock;

describe('Moflix', () => {
  beforeEach(() => {
    mockedGetTmdbId.mockReset();
    mockedGetTmdbNameAndYear.mockReset();
  });

  it('returns empty results when no matching media is found', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockResolvedValue({ results: [] }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });
    expect(result).toEqual([]);
  });

  it('returns results for matching full video streams', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 1, model_type: 'title', imdb_id: 'tt123', name: 'Example Show' }] };
        }
        return { title: { videos: [{ category: 'full', src: 'https://example.com/stream', quality: '1080p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/stream');
  });

  it('matches normalized titles when the imdb id does not match', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 2, model_type: 'title', imdb_id: 'tt999', name: 'Example Show' }] };
        }
        return { title: { videos: [{ category: 'full', src: 'https://example.com/normalized', quality: '720p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/normalized');
  });

  it('falls back to the first title entry when no direct title match exists', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Another Title']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 9, model_type: 'title', imdb_id: 'tt999', name: 'Fallback Entry' }] };
        }
        return { title: { videos: [{ category: 'full', src: 'https://example.com/fallback', quality: '480p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/fallback');
  });

  it('falls back to first title entry using modelType camelCase in fallback loop', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Another Title']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 15, modelType: 'title', imdb_id: 'tt999', name: 'Fallback Entry' }] };
        }
        return { title: { videos: [{ category: 'full', src: 'https://example.com/camel-fallback', quality: '720p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/camel-fallback');
  });

  it('skips non-title items in fallback loop when both model_type and modelType are not title', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Another Title']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return {
            results: [
              { id: 17, model_type: 'person', name: 'Some Person' },
              { id: 18, modelType: 'episode', name: 'Some Episode' },
              { id: 19, model_type: 'title', imdb_id: 'tt999', name: 'Fallback Entry' },
            ],
          };
        }
        return { title: { videos: [{ category: 'full', src: 'https://example.com/skip-non-title', quality: '1080p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/skip-non-title');
  });

  it('uses the season and episode endpoint when a season is provided', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 2, episode: 3 });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 4, model_type: 'title', imdb_id: 'tt123', name: 'Example Show' }] };
        }
        expect(url.pathname).toContain('/seasons/2/episodes/3');
        return { episode: { videos: [{ category: 'full', src: 'https://example.com/episode', quality: '1080p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 2, episode: 3 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/episode');
  });

  it('returns empty results when the request throws', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockRejectedValue(new Error('boom')),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });
    expect(result).toEqual([]);
  });

  it('returns empty results when results is not an array', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockResolvedValue({ results: null }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });
    expect(result).toEqual([]);
  });

  it('returns empty results when id is not an object with a string id property', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockResolvedValue({ results: [] }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', 'tt123');
    expect(result).toEqual([]);
  });

  it('matches items using modelType (camelCase) instead of model_type', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 5, modelType: 'title', imdb_id: 'tt123', name: 'Example Show' }] };
        }
        return { title: { videos: [{ category: 'full', src: 'https://example.com/camel', quality: '1080p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/camel');
  });

  it('skips non-title items during normalized name matching and falls back to first title', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return {
            results: [
              { id: 6, model_type: 'person', name: 'Some Person' },
              { id: 7, model_type: 'title', imdb_id: 'tt999', name: 'Example Show' },
            ],
          };
        }
        return { title: { videos: [{ category: 'full', src: 'https://example.com/skip', quality: '720p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/skip');
  });

  it('matches items with no name using the empty string fallback in normalized name matching', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return {
            results: [
              { id: 16, model_type: 'title', imdb_id: 'tt999' },
            ],
          };
        }
        return { title: { videos: [{ category: 'full', src: 'https://example.com/no-name', quality: '720p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/no-name');
  });

  it('matches the special case "herr der elemente" in normalized name', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return {
            results: [
              { id: 8, model_type: 'title', imdb_id: 'tt999', name: 'herr der elemente' },
            ],
          };
        }
        return { title: { videos: [{ category: 'full', src: 'https://example.com/herr', quality: '1080p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/herr');
  });

  it('uses episode default of 1 when season is provided without episode', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 2 });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 10, model_type: 'title', imdb_id: 'tt123', name: 'Example Show' }] };
        }
        expect(url.pathname).toContain('/seasons/2/episodes/1');
        return { episode: { videos: [{ category: 'full', src: 'https://example.com/episode-default', quality: '1080p' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 2 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/episode-default');
  });

  it('handles missing videos container gracefully', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 11, model_type: 'title', imdb_id: 'tt123', name: 'Example Show' }] };
        }
        return { title: { } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toEqual([]);
  });

  it('filters out non-full category videos', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 12, model_type: 'title', imdb_id: 'tt123', name: 'Example Show' }] };
        }
        return {
          title: {
            videos: [
              { category: 'trailer', src: 'https://example.com/trailer', quality: '1080p' },
              { category: 'full', src: 'https://example.com/full', quality: '1080p' },
            ],
          },
        };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/full');
  });

  it('filters out videos with empty src even if category is full', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 13, model_type: 'title', imdb_id: 'tt123', name: 'Example Show' }] };
        }
        return {
          title: {
            videos: [
              { category: 'full', src: '', quality: '1080p' },
              { category: 'full', src: 'https://example.com/valid', quality: '720p' },
            ],
          },
        };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/valid');
  });

  it('handles missing quality gracefully', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 14, model_type: 'title', imdb_id: 'tt123', name: 'Example Show' }] };
        }
        return { title: { videos: [{ category: 'full', src: 'https://example.com/no-quality' }] } };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/no-quality');
    expect(result[0]?.meta.title).toBe('Moflix');
  });

  it('handles non-string category and src types gracefully', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123' });
    mockedGetTmdbNameAndYear.mockResolvedValue(['Example Show']);
    const fetcher = {
      json: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname.includes('/search/')) {
          return { results: [{ id: 20, model_type: 'title', imdb_id: 'tt123', name: 'Example Show' }] };
        }
        return {
          title: {
            videos: [
              { category: 123, src: 456 },
              { category: 'full', src: 'https://example.com/string-check', quality: '1080p' },
            ],
          },
        };
      }),
    } as never;
    const source = new Moflix(fetcher);
    const ctx = { config: {}, logger: { error: jest.fn() } } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/string-check');
  });
});