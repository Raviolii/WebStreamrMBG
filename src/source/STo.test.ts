import { STo } from './STo';

describe('STo', () => {
  it('returns empty results when no series link is found', async () => {
    const fetcher = {
      text: jest.fn().mockResolvedValue('<html></html>'),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123' });
    expect(result).toEqual([]);
  });

  it('returns empty results for non-series requests', async () => {
    const fetcher = { text: jest.fn() } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'movie', { id: 'tt123' });
    expect(result).toEqual([]);
  });

  it('returns resolved stream results when links are present', async () => {
    const fetcher = {
      text: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname === '/suche') {
          return '<html><body><a class="show-cover" href="/serie/example">Example</a></body></html>';
        }
        return '<html><body><button class="link-box" data-language-id="1" data-play-url="/watch/1" data-provider-name="Voe"></button></body></html>';
      }),
      getFinalRedirectUrl: jest.fn().mockResolvedValue(new URL('https://voe.example/watch')),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://voe.example/watch');
  });

  it('falls back to fetch when redirect resolution is unavailable', async () => {
    const fetcher = {
      text: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname === '/suche') {
          return '<html><body><a class="show-cover" href="/serie/example">Example</a></body></html>';
        }
        return '<html><body><button class="link-box" data-language-id="1" data-play-url="/watch/1" data-provider-name="Voe"></button></body></html>';
      }),
      getFinalRedirectUrl: jest.fn().mockRejectedValue(new Error('no redirect')),
      fetch: jest.fn().mockResolvedValue({ request: { res: { responseUrl: 'https://voe.example/fallback' } }, config: {} }),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://voe.example/fallback');
  });

  it('returns the initial URL when the resolved redirect is still an s.to/r path', async () => {
    const fetcher = {
      text: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname === '/suche') {
          return '<html><body><a class="show-cover" href="/serie/example">Example</a></body></html>';
        }
        return '<html><body><button class="link-box" data-language-id="1" data-play-url="/watch/1" data-provider-name="Voe"></button></body></html>';
      }),
      getFinalRedirectUrl: jest.fn().mockResolvedValue(new URL('https://s.to/r/abc')),
      fetch: jest.fn().mockRejectedValue(new Error('no fetch')),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://serienstream.to/watch/1');
  });

  it('uses default season and episode when not provided', async () => {
    const fetcher = {
      text: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname === '/suche') {
          return '<html><body><a class="show-cover" href="/serie/example">Example</a></body></html>';
        }
        expect(url.pathname).toContain('/staffel-1/episode-1');
        return '<html><body><button class="link-box" data-language-id="1" data-play-url="/watch/1" data-provider-name="Voe"></button></body></html>';
      }),
      getFinalRedirectUrl: jest.fn().mockResolvedValue(new URL('https://voe.example/default')),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123' });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://voe.example/default');
  });

  it('uses href fallback when data-play-url is missing', async () => {
    const fetcher = {
      text: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname === '/suche') {
          return '<html><body><a class="show-cover" href="/serie/example">Example</a></body></html>';
        }
        return '<html><body><a class="link-box" data-language-id="1" href="/watch/href-only" data-provider-name="Dood"></a></body></html>';
      }),
      getFinalRedirectUrl: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        expect(url.pathname).toContain('/watch/href-only');
        return new URL('https://dood.example/href');
      }),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://dood.example/href');
  });

  it('uses Unknown when data-provider-name is missing', async () => {
    const fetcher = {
      text: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname === '/suche') {
          return '<html><body><a class="show-cover" href="/serie/example">Example</a></body></html>';
        }
        return '<html><body><button class="link-box" data-language-id="1" data-play-url="/watch/unknown" ></button></body></html>';
      }),
      getFinalRedirectUrl: jest.fn().mockResolvedValue(new URL('https://unknown.example/watch')),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.meta.title).toContain('Unknown');
  });

  it('skips elements without playPath or href', async () => {
    const fetcher = {
      text: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname === '/suche') {
          return '<html><body><a class="show-cover" href="/serie/example">Example</a></body></html>';
        }
        return '<html><body>'
          + '<button class="link-box" data-language-id="1"></button>'
          + '<button class="link-box" data-language-id="1" data-play-url="/watch/valid" data-provider-name="Voe"></button>'
          + '</body></html>';
      }),
      getFinalRedirectUrl: jest.fn().mockResolvedValue(new URL('https://voe.example/valid')),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://voe.example/valid');
  });

  it('falls back to config.url when responseUrl is missing in fetch fallback', async () => {
    const fetcher = {
      text: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname === '/suche') {
          return '<html><body><a class="show-cover" href="/serie/example">Example</a></body></html>';
        }
        return '<html><body><button class="link-box" data-language-id="1" data-play-url="/watch/1" data-provider-name="Voe"></button></body></html>';
      }),
      getFinalRedirectUrl: jest.fn().mockRejectedValue(new Error('no redirect')),
      fetch: jest.fn().mockResolvedValue({ request: { res: {} }, config: { url: 'https://voe.example/config-url' } }),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://voe.example/config-url');
  });

  it('returns initial URL when fetch fallback finalUrlValue is empty', async () => {
    const fetcher = {
      text: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname === '/suche') {
          return '<html><body><a class="show-cover" href="/serie/example">Example</a></body></html>';
        }
        return '<html><body><button class="link-box" data-language-id="1" data-play-url="/watch/1" data-provider-name="Voe"></button></body></html>';
      }),
      getFinalRedirectUrl: jest.fn().mockRejectedValue(new Error('no redirect')),
      fetch: jest.fn().mockResolvedValue({ request: { res: {} }, config: { url: '' } }),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://serienstream.to/watch/1');
  });

  it('returns initial URL when fetch fallback final URL is still s.to/r path', async () => {
    const fetcher = {
      text: jest.fn().mockImplementation(async (_ctx: unknown, url: URL) => {
        if (url.pathname === '/suche') {
          return '<html><body><a class="show-cover" href="/serie/example">Example</a></body></html>';
        }
        return '<html><body><button class="link-box" data-language-id="1" data-play-url="/watch/1" data-provider-name="Voe"></button></body></html>';
      }),
      getFinalRedirectUrl: jest.fn().mockRejectedValue(new Error('no redirect')),
      fetch: jest.fn().mockResolvedValue({ request: { res: { responseUrl: 'https://s.to/r/abc' } }, config: {} }),
    } as never;
    const source = new STo(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://serienstream.to/watch/1');
  });
});