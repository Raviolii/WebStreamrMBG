import axios from 'axios';
import winston from 'winston';
import { NotFoundError } from '../error';
import { createTestContext } from '../test';
import { Context, Format } from '../types';
import { CustomRequestConfig, Fetcher } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { Firestream } from './Firestream';

class FirestreamFetcherMock extends Fetcher {
  public constructor(logger: winston.Logger) {
    super(axios, logger);
  }

  public override async text(_ctx: Context, url: URL, _requestConfig?: CustomRequestConfig): Promise<string> {
    if (url.pathname === '/e/notoken') {
      return '<html><head></head><body></body></html>';
    }

    if (url.pathname.startsWith('/e/')) {
      return '<html><head></head><body><script id="token-blob">token-value</script></body></html>';
    }

    throw new Error(`Unexpected text request URL: ${url.href}`);
  }

  public override async json(_ctx: Context, url: URL, _requestConfig?: CustomRequestConfig): Promise<any> {
    if (url.pathname.endsWith('/resolve')) {
      if (url.pathname.includes('/notfound/resolve')) {
        throw new NotFoundError();
      }

      if (url.pathname.includes('/bad/resolve')) {
        return { signedVideoUrl: null };
      }

      return {
        signedVideoUrl: 'https://cdn.example/test-720.m3u8',
      };
    }

    throw new Error(`Unexpected json request URL: ${url.href}`);
  }
}

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Firestream(new FirestreamFetcherMock(logger), logger)]);
const ctx = createTestContext();

describe('Firestream', () => {
  test('extracts a signed HLS URL', async () => {
    const result = await extractorRegistry.handle(ctx, new URL('https://firestream.to/e/test123'));

    expect(result).toHaveLength(1);
    expect(result[0]?.format).toBe(Format.hls);
    expect(result[0]?.label).toBe('Firestream');
    expect(result[0]?.url.href).toBe('https://cdn.example/test-720.m3u8');
  });

  test('returns no results for missing id', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://firestream.to'))).toEqual([]);
  });

  test('returns no results for missing token', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://firestream.to/e/notoken'))).toEqual([]);
  });

  test('returns no results for invalid resolve response', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://firestream.to/e/bad'))).toEqual([]);
  });

  test('extracts mp4 format when signedVideoUrl points to mp4', async () => {
    class Mp4FirestreamFetcherMock extends FirestreamFetcherMock {
      public override async json(_ctx: Context, url: URL, _requestConfig?: CustomRequestConfig): Promise<any> {
        if (url.pathname.endsWith('/resolve')) {
          return { signedVideoUrl: 'https://cdn.example/test-720.mp4' };
        }
        return super.json(_ctx, url, _requestConfig);
      }
    }

    const mp4Registry = new ExtractorRegistry(logger, [new Firestream(new Mp4FirestreamFetcherMock(logger), logger)]);
    const result = await mp4Registry.handle(ctx, new URL('https://firestream.to/e/testmp4'));

    expect(result).toHaveLength(1);
    expect(result[0]?.format).toBe(Format.mp4);
    expect(result[0]?.url.href).toBe('https://cdn.example/test-720.mp4');
  });
});
