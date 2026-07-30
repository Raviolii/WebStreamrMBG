import { createTestContext } from '../test/index.js';
import { FetcherMock, ImdbId } from '../utils/index.js';
import { FilmpalastTO } from './FilmpalastTO.js';

const ctx = createTestContext({ de: 'on' });

class AutocompleteFetcher extends FetcherMock {
  public override async textPost(ctx: any, url: URL, data: string): Promise<string> {
    if (url.pathname === '/autocomplete.php') {
      return JSON.stringify(['Breaking Bad']);
    }

    return super.textPost(ctx, url, data);
  }
}

class BadSlugAutocompleteFetcher extends FetcherMock {
  public override async textPost(ctx: any, url: URL, data: string): Promise<string> {
    if (url.pathname === '/autocomplete.php') {
      return JSON.stringify(['!!!']);
    }

    return super.textPost(ctx, url, data);
  }

  public override async text(ctx: any, url: URL): Promise<string> {
    if (url.pathname.startsWith('/search/title')) {
      return '<html><body><a href="/stream/test" title="test">Test</a></body></html>';
    }

    return super.text(ctx, url);
  }
}

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

  test('uses autocomplete for series slugs when available', async () => {
    const autocompleteSource = new FilmpalastTO(new AutocompleteFetcher(`${__dirname}/__fixtures__/FilmpalastTO`));
    const streams = await autocompleteSource.handle(ctx, 'series', new ImdbId('tt0903747', 2, 3));
    expect(streams).toMatchSnapshot();
  });

  test('fetchStreamPageUrl returns a slugged series page when autocomplete succeeds', async () => {
    const autocompleteSource = new FilmpalastTO(new AutocompleteFetcher(`${__dirname}/__fixtures__/FilmpalastTO`));
    const url = await (autocompleteSource as any).fetchStreamPageUrl(ctx, 'Breaking Bad', 2008, 2, 3);
    expect(url?.href).toBe('https://filmpalast.to/stream/breaking-bad-s02e03');
  });

  test('fetchStreamPageUrl falls back to search page when autocomplete produces only bad slug text', async () => {
    const badSlugSource = new FilmpalastTO(new BadSlugAutocompleteFetcher(`${__dirname}/__fixtures__/FilmpalastTO`));
    const url = await (badSlugSource as any).fetchStreamPageUrl(ctx, 'Bad Slug', 2008, 2, 3);
    expect(url?.href).toBe('https://filmpalast.to/stream/test');
  });

  test('extractAutocompleteResult returns string and object results', () => {
    const stringResult = (source as any).extractAutocompleteResult(['Breaking Bad', 'Other'] as unknown);
    expect(stringResult).toBe('Breaking Bad');

    const objectResult = (source as any).extractAutocompleteResult([
      { title: 'The Matrix' },
      { value: 'Another' },
    ] as unknown);
    expect(objectResult).toBe('The Matrix');
  });

  test('extractAutocompleteResult handles null and non-object candidates', () => {
    expect((source as any).extractAutocompleteResult([null, 0, false] as unknown)).toBeUndefined();
  });

  test('extractAutocompleteResult returns undefined for non-array values', () => {
    expect((source as any).extractAutocompleteResult(null)).toBeUndefined();
    expect((source as any).extractAutocompleteResult(undefined)).toBeUndefined();
  });

  test('extractAutocompleteResult returns undefined for whitespace-only string candidates', () => {
    expect((source as any).extractAutocompleteResult(['   '] as unknown)).toBeUndefined();
  });

  test('extractAutocompleteResult returns label and name fields', () => {
    expect((source as any).extractAutocompleteResult([{ label: 'Label Value' }] as unknown)).toBe('Label Value');
    expect((source as any).extractAutocompleteResult([{ name: 'Name Value' }] as unknown)).toBe('Name Value');
  });

  test('extractAutocompleteResult returns undefined for unusable objects', () => {
    expect((source as any).extractAutocompleteResult([{ foo: 'bar' }])).toBeUndefined();
  });

  test('createSeriesSlug returns undefined when slug is empty', () => {
    expect((source as any).createSeriesSlug('!!!')).toBeUndefined();
  });

  test('createSeriesSlug normalizes autocomplete text into a valid slug', () => {
    const slug = (source as any).createSeriesSlug('Breaking Bad: Season 1');
    expect(slug).toBe('breaking-bad-season-1');
  });

  test('returns empty when search finds no stream page', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt4444444', undefined, undefined));
    expect(streams).toHaveLength(0);
  });

  test('skips malformed href in stream block without throwing', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt5555555', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });
});
