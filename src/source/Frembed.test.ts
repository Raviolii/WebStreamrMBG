import { createTestContext } from '../test/index.js';
import { FetcherMock, ImdbId, TmdbId } from '../utils/index.js';
import { Frembed } from './Frembed.js';

const ctx = createTestContext({ fr: 'on' });

describe('Frembed', () => {
  let source: Frembed;

  beforeEach(() => {
    source = new Frembed(new FetcherMock(`${__dirname}/__fixtures__/Frembed`));
  });

  test('handle imdb black mirror s4e2', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt2085059', 4, 2));
    expect(streams).toMatchSnapshot();
  });

  test('handle tmdb black mirror s4e2', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(42009, 4, 2));
    expect(streams).toMatchSnapshot();
  });

  test('handle battle royal', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(3176, undefined, undefined));
    expect(streams).toMatchSnapshot();
  });
});
