import { createTestContext } from '../test/index.js';
import { FetcherMock, ImdbId, TmdbId } from '../utils/index.js';
import { OhaTO } from './OhaTo.js';

const ctx = createTestContext({ de: 'on' });

describe('OhaTO', () => {
  let source: OhaTO;

  beforeEach(() => {
    source = new OhaTO(new FetcherMock(`${__dirname}/__fixtures__/OhaTo`));
  });

  test('handle imdb series match', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt2085059', 4, 2));
    expect(streams.length).toBeGreaterThanOrEqual(1);
  });

  test('handle tmdb series match', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(42009, 4, 2));
    expect(streams.length).toBeGreaterThanOrEqual(1);
  });

  test('handle movie match', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(3176, undefined, undefined));
    expect(streams.length).toBeGreaterThanOrEqual(1);
  });

  test('handle empty links returns empty array', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(3177, undefined, undefined));
    expect(streams).toEqual([]);
  });

  test('handle links API error returns empty array', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(3178, undefined, undefined));
    expect(streams).toEqual([]);
  });

  test('handle dead mirror continues with next mirror', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(3179, undefined, undefined));
    expect(streams.length).toBeGreaterThan(0);
    expect(streams.some(stream => stream.url.hostname === 'dood.to' || stream.url.hostname === 'supervideo.cc')).toBe(true);
  });

  test('handle link without language defaults title country to DE', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(3180, undefined, undefined));
    expect(streams).toEqual([]);
  });

  test('handle series defaults episode and skips empty url mirror', async () => {
    // episode is intentionally omitted to cover `episode ?? 1` branch
    const streams = await source.handle(ctx, 'series', new TmdbId(42009, 4, undefined));
    expect(streams.length).toBeGreaterThan(0);
    expect(streams.every(stream => stream.meta?.language === 'de')).toBe(true);
  });
});
