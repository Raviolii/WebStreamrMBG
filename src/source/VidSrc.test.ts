import { createTestContext } from '../test/index.js';
import { ImdbId } from '../utils/index.js';
import { VidSrc } from './VidSrc.js';

const ctx = createTestContext();

describe('VidSrc', () => {
  let source: VidSrc;

  beforeEach(() => {
    source = new VidSrc();
  });

  test('handle imdb black mirror s4e2', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt2085059', 4, 2));
    expect(streams).toMatchSnapshot();
  });

  test('handle imdb full metal jacket', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt0093058', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });
});
