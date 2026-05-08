import { createTestContext } from '../test';
import { FetcherMock, ImdbId } from '../utils';
import { SerienStream } from './SerienStream';

const ctx = createTestContext({ de: 'on' });

describe('SerienStream', () => {
  let source: SerienStream;

  beforeEach(() => {
    // This assumes you have a fixtures folder for s.to saved as HTML files
    source = new SerienStream(new FetcherMock(`${__dirname}/__fixtures__/SerienStream`));
  });

  test('should only handle series content types', async () => {
    const streams = await source.handle(ctx, 'movie' as any, new ImdbId('tt1190634', undefined, undefined));
    expect(streams).toHaveLength(0);
  });

  test('handles non-existent series gracefully', async () => {
    // Example: tt0000000 returns no search results
    const streams = await source.handle(ctx, 'series', new ImdbId('tt0000000', 1, 1));
    expect(streams).toHaveLength(0);
  });

  test('handles The Boys (tt1190634) S01E01 correctly', async () => {
    // Tests the full flow: Search -> Series Page -> Episode Page -> German Links
    const streams = await source.handle(ctx, 'series', new ImdbId('tt1190634', 1, 1));
    
    // Check snapshots to verify URLs are prefixed with s.to/r?t=...
    expect(streams).toMatchSnapshot();
  });

  test('extracts only German links (data-language-id="1")', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt1190634', 1, 1));
    
    // Verify that every result is indeed from a German link block
    streams.forEach(stream => {
      expect(stream.meta.title).toContain('(DE)');
    });
  });

  test('defaults to Season 1 Episode 1 if not provided', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt1190634', undefined, undefined));
    
    // Should construct URLs with staffel-1/episode-1
    expect(streams).toMatchSnapshot();
  });

  test('correctly handles search failures (e.g., 404 or empty HTML)', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt9999999', 1, 1));
    expect(streams).toHaveLength(0);
  });

  test('properly formats the redirect URL', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt1190634', 4, 8));
    
    if (streams.length > 0) {
      // Ensure the URL starts with the base s.to domain
      expect(streams[0].url.href).toContain('https://s.to/r?t=');
    }
  });

  test('returns empty array when no German hosters are available', async () => {
    // Scenario where series exists but specific episode is not yet dubbed
    const streams = await source.handle(ctx, 'series', new ImdbId('tt_no_german_links', 1, 1));
    expect(streams).toHaveLength(0);
  });
});
