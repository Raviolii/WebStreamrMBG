import { createTestContext } from '../test/index.js';
import { FetcherMock, TmdbId } from '../utils/index.js';
import { Einschalten } from './Einschalten.js';

const ctx = createTestContext({ de: 'on' });

describe.skip('Einschalten', () => {
  let source: Einschalten;

  beforeEach(() => {
    source = new Einschalten(new FetcherMock(`${__dirname}/__fixtures__/Einschalten`));
  });

  test('handle superman', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(1061474, undefined, undefined));
    expect(streams).toMatchSnapshot();
  });
});
