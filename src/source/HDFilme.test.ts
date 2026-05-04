import { createTestContext } from '../test';
import { FetcherMock, TmdbId } from '../utils';
import { HDFilme } from './HDFilme';

const ctx = createTestContext({ de: 'on' });

describe('HDFilme', () => {
  let source: HDFilme;

  beforeEach(() => {
    source = new HDFilme(new FetcherMock(`${__dirname}/__fixtures__/HDFilme`));
  });

  test('handles non-existent series gracefully', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(12345678, 1, 1));
    expect(streams).toHaveLength(0);
  });

  test('returns empty when tmdb id has no season and episode', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(42009, undefined, undefined));
    expect(streams).toHaveLength(0);
  });

  test('handle black mirror s2e4', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(42009, 2, 4));
    expect(streams).toMatchSnapshot();
  });

  test('handle monster: the ed gein story s1e2', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(286801, 1, 2));
    expect(streams).toMatchSnapshot();
  });

  test('returns empty when season exists but requested staffel is missing', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(900001, 1, 1));
    expect(streams).toHaveLength(0);
  });

  test('returns empty when requested episode marker is missing', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(900002, 1, 2));
    expect(streams).toHaveLength(0);
  });

  test('handles links filtering and next-episode boundaries', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(900003, 1, 1));
    expect(streams).toMatchSnapshot();
  });

  test('handles last episode segment when no next episode marker exists', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(900004, 1, 1));
    expect(streams).toMatchSnapshot();
  });

  test('returns empty when season content container is missing', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(900005, 1, 1));
    expect(streams).toHaveLength(0);
  });
});
