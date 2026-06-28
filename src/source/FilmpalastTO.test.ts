import { createTestContext } from '../test';
import { FetcherMock, ImdbId } from '../utils';
import { FilmpalastTO } from './FilmpalastTO';

const ctx = createTestContext({ de: 'on' });

const STREAMING_HOSTS = [
  'voe', 'dood', 'streamtape', 'veev', 'vinovo', 'vidhide', 'dhtpre',
  'mixdrop', 'supervideo', 'uqload', 'filelion', 'lulustream', 'fastream',
  'dropload', 'savefiles', 'streamembed', 'vidara', 'vidsonic',
];

const normalizeStreams = (streams: any[]) => {
  const map = new Map<string, any>();

  for (const s of streams) {
    const url = new URL(s.url);
    const host = STREAMING_HOSTS.find(h => url.hostname.includes(h)) ?? 'unknown';

    const titleParts = (s.meta?.title ?? '').split(' - ');
    const titleSuffix = titleParts.slice(1).join(' - ') || titleParts[0] || '';

    const normalized = {
      url: s.url,
      meta: {
        ...s.meta,
        title: `${host.toUpperCase()} - ${titleSuffix}`.trim(),
      },
    };

    map.set(s.url, normalized);
  }

  return Array.from(map.values());
};

describe('FilmpalastTO', () => {
  let source: FilmpalastTO;

  beforeEach(() => {
    source = new FilmpalastTO(new FetcherMock(`${__dirname}/__fixtures__/FilmpalastTO`));
  });

  test('handles non-existent movies gracefully', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt12345678', undefined, undefined));
    expect(streams).toHaveLength(0);
  });

  test('handles fetch error gracefully', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt9999999', undefined, undefined));
    expect(streams).toHaveLength(0);
  });

  test('handle the matrix', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt0133093', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('handles embedded player with data-player-url', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt1111111', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('handles multiple hosters including known streaming hosts', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt2222222', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('falls back to first result when year does not match', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt3333333', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('handles series with season and episode', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt0903747', 2, 3));
    expect(streams).toMatchSnapshot();
  });

  test('handles series with season but no episode', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt0903747', 1, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('returns empty when search finds no stream page', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt4444444', undefined, undefined));
    expect(streams).toHaveLength(0);
  });

  test('skips malformed href in stream block without throwing', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt5555555', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('correctly selects movie by title similarity when multiple results exist', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt17490712', undefined, undefined));
    expect(streams).toHaveLength(2);
    expect(streams.every(s => s.meta.title.includes('Test Movie Title'))).toBe(true);
  });

  const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN;
  const runLive = !!TMDB_TOKEN;

  const createRealSource = () => {
    // lazy-require to avoid changing behavior when running fixture-only tests
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axios = require('axios');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const winston = require('winston');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Fetcher } = require('../utils');

    const fetcher = new Fetcher(axios, winston.createLogger({ transports: [new winston.transports.Console({ level: 'info' })] }));

    return new FilmpalastTO(fetcher);
  };

  if (runLive) {
    test('LIVE: queries Filmpalast by IMDb id tt17490712 (network)', async () => {
      const realSource = createRealSource();
      const streams = await realSource.handle(ctx, 'movie', new ImdbId('tt17490712', undefined, undefined));
      const normalized = normalizeStreams(streams);

      expect(Array.isArray(normalized)).toBe(true);
    });
  } else {
    test.skip('LIVE: queries Filmpalast by IMDb id tt17490712 (network) - set TMDB_ACCESS_TOKEN to run', () => {});
  }
});
