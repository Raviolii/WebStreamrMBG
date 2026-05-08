import { createTestContext } from '../test';
import { FetcherMock, ImdbId } from '../utils';
import { STo } from './STo';

const ctx = createTestContext({ de: 'on' });

describe('SerienStream', () => {
  let source: STo;

  beforeEach(() => {
    source = new STo(new FetcherMock(`${__dirname}/__fixtures__/STo`));
  });

  test('should only handle series content types', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt1190634', undefined, undefined));
    expect(streams).toHaveLength(0);
  });

  test('handles non-existent series gracefully', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt0000000', 1, 1));
    expect(streams).toHaveLength(0);
  });

  test('handles The Boys (tt1190634) S01E01 correctly', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt1190634', 1, 1));
    expect(streams).toMatchSnapshot();
  });

  test('extracts only German links (data-language-id="1")', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt1190634', 1, 1));
    streams.forEach((stream) => {
      expect(stream.meta.title).toContain('(DE)');
    });
  });

  test('defaults to Season 1 Episode 1 if not provided', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt1190634', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('correctly handles search failures', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt9999999', 1, 1));
    expect(streams).toHaveLength(0);
  });

  test('properly formats the redirect URL', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt1190634', 4, 8));
    if (streams.length > 0) {
      expect(streams[0].url.href).toContain('https://s.to/r?t=');
    }
  });

  test('returns empty array when no German hosters are available', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt_no_german_links', 1, 1));
    expect(streams).toHaveLength(0);
  });

  test('uses Unknown provider fallback and ignores entries without play url', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt_unknown_provider', 1, 1));
    expect(streams).toHaveLength(1);
    expect(streams[0].meta.title).toContain('Unknown (DE) - S1E1');
    expect(streams[0].url.href).toContain('https://s.to/r?t=unknown-provider');
  });
});
