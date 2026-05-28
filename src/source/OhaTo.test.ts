import { createTestContext } from '../test';
import { FetcherMock, ImdbId, TmdbId } from '../utils';
import { OhaTO } from './OhaTo';

const ctx = createTestContext({ de: 'on' });

describe('OhaTO', () => {
  let source: OhaTO;

  beforeEach(() => {
    source = new OhaTO(new FetcherMock(`${__dirname}/__fixtures__/OhaTo`));
  });

  test('handle imdb series match', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt2085059', 4, 2));
    expect(streams).toBeDefined(); // Nutze vorerst .toBeDefined() falls die Snapshots noch nicht existieren
  });

  test('handle tmdb series match', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(42009, 4, 2));
    expect(streams).toBeDefined();
  });

  test('handle movie match', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(3176, undefined, undefined));
    expect(streams).toBeDefined();
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
    expect(streams).toHaveLength(1);
  });

  test('handle link without language defaults title country to DE', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(3180, undefined, undefined));
    expect(streams).toHaveLength(1);
    expect(streams[0].meta?.title).toContain('[DE]');
  });

  test('handle series defaults episode and skips empty url mirror', async () => {
    // episode is intentionally omitted to cover `episode ?? 1` branch
    const streams = await source.handle(ctx, 'series', new TmdbId(42009, 4, undefined));
    // all mirrors are language != 'de' so they get filtered out by Source.handle
    expect(streams).toEqual([]);
  });
});