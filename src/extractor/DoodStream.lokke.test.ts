import winston from 'winston';
import { createTestContext } from '../test';
import { DoodStream } from './DoodStream';
import { ExtractorRegistry } from './ExtractorRegistry';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });

// Minimal fetcher stub implementing only what's needed for the Lokke/OHA flow
const lokkeFetcher: any = {
  async json(_ctx: any, url: URL) {
    if (url.href.includes('www.lokke.app')) {
      return { addonSig: 'TESTSIG' };
    }
    if (url.href.includes('mediaurl-resolve') || url.href.includes('mediaurl-item')) {
      return { url: new URL('https://cdn.example/test.mp4'), title: 'Lokke resolved title' };
    }
    throw new Error(`Unexpected json request to ${url.href}`);
  },
  async text() {
    // Should not be hit in the Lokke/OHA happy path
    return '';
  },
  async head() { return {}; },
  textPost: async () => ''
};

const extractorRegistry = new ExtractorRegistry(logger, [new DoodStream(lokkeFetcher, logger)]);
const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow.test.org', mediaFlowProxyPassword: 'test' });

describe('DoodStream Lokke flow', () => {
  test('returns direct url when Lokke/OHA resolves', async () => {
    const res = await extractorRegistry.handle(ctx, new URL('https://dood.to/e/abc123'));
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].format).toBe('mp4');
    expect(res[0].url.href).toBe('https://cdn.example/test.mp4');
    expect(res[0].meta?.title).toBe('Lokke resolved title');
  });

  test('uses default title when OHA returns no title', async () => {
    const fetcherNoTitle: any = {
      async json(_ctx: any, url: URL) {
        if (url.href.includes('www.lokke.app')) {
          return { addonSig: 'TESTSIG' };
        }
        if (url.href.includes('mediaurl-resolve')) {
          return { url: new URL('https://cdn.example/notitle.mp4') };
        }
        throw new Error(`Unexpected json request to ${url.href}`);
      },
      async text() { return ''; },
      async head() { return {}; },
      textPost: async () => ''
    };

    const registry = new ExtractorRegistry(logger, [new DoodStream(fetcherNoTitle, logger)]);
    const res = await registry.handle(ctx, new URL('https://dood.to/e/notitle'));
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].meta?.title).toBe('DoodStream Video');
  });

  test('falls back when Lokke signature missing', async () => {
    const fetcherNoSig: any = {
      async json(_ctx: any, url: URL) {
        if (url.href.includes('www.lokke.app')) {
          return {}; // no addonSig
        }
        if (url.href.includes('mediaurl-resolve')) {
          return { kind: 'taskRequest' };
        }
        throw new Error(`Unexpected json request to ${url.href}`);
      },
      async text(_ctx: any, url: URL) {
        if (url.href.includes('dood.to/e')) return '<title>Fallback - DoodStream</title>';
        if (url.href.includes('/d/')) return '317.6 MB';
        return '';
      },
      async head() { return {}; },
      textPost: async () => ''
    };

    const registry = new ExtractorRegistry(logger, [new DoodStream(fetcherNoSig, logger)]);
    const res = await registry.handle(ctx, new URL('https://dood.to/e/xyz789'));
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].meta?.title).toBe('Fallback');
  });

  test('falls back when OHA returns no url', async () => {
    const fetcherNoUrl: any = {
      async json(_ctx: any, url: URL) {
        if (url.href.includes('www.lokke.app')) {
          return { addonSig: 'X' };
        }
        if (url.href.includes('mediaurl-resolve')) {
          return { kind: 'taskRequest' };
        }
        throw new Error(`Unexpected json request to ${url.href}`);
      },
      async text(_ctx: any, url: URL) {
        if (url.href.includes('dood.to/e')) return '<title>Fallback2 - DoodStream</title>';
        if (url.href.includes('/d/')) return '1.3 GB';
        return '';
      },
      async head() { return {}; },
      textPost: async () => ''
    };

    const registry = new ExtractorRegistry(logger, [new DoodStream(fetcherNoUrl, logger)]);
    const res = await registry.handle(ctx, new URL('https://dood.to/e/xyz000'));
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].meta?.title).toBe('Fallback2');
  });
});
