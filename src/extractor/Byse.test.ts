import axios from 'axios';
import winston from 'winston';
import { NotFoundError } from '../error';
import { Context } from '../types';
import { createTestContext } from '../test';
import { CustomRequestConfig, Fetcher } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { Byse } from './Byse';

class ByseFetcherMock extends Fetcher {
  public constructor(logger: winston.Logger) {
    super(axios, logger);
  }

  public override async json(ctx: Context, url: URL, requestConfig?: CustomRequestConfig): Promise<any> {
    if (url.pathname === '/extractor/video') {
      return {
        destination_url: url.searchParams.get('d') ?? '',
        request_headers: {},
        mediaflow_proxy_url: 'https://mediaflow-proxy.test/proxy/hls/manifest.m3u8',
        query_params: { proxy: 'true' },
      };
    }

    const videoMatch = url.href.match(/\/api\/videos\/(.+?)\//);
    const mediaId = videoMatch?.[1];

    if (!mediaId) {
      throw new Error(`Unexpected request URL: ${url.href}`);
    }

    if (url.pathname.endsWith('/details')) {
      if (mediaId === 'notfound') {
        throw new NotFoundError();
      }

      return { embed_frame_url: undefined };
    }

    if (url.pathname.endsWith('/settings')) {
      return { captcha_required: false };
    }

    if (url.pathname.endsWith('/playback')) {
      return {
        sources: [
          { url: 'https://cdn.example/test-480.m3u8', label: '480' },
          { url: 'https://cdn.example/test-720.m3u8', label: '720' },
        ],
      };
    }

    throw new Error(`Unexpected request URL: ${url.href}`);
  }
}

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger), logger)]);
const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow-proxy.test', mediaFlowProxyPassword: 'asdfg' });

describe('Byse', () => {
  test('extracts a stream via media flow proxy', async () => {
    const result = await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/test123'));

    expect(result).toHaveLength(1);
    expect(result[0]?.format).toBe('hls');
    expect(result[0]?.label).toBe('720 (MFP)');
    expect(result[0]?.url.href).toContain('https://mediaflow-proxy.test/proxy/hls/manifest.m3u8');
    expect(result[0]?.url.searchParams.get('proxy')).toBe('true');
    expect(result[0]?.url.searchParams.get('d')).toBe('https://cdn.example/test-720.m3u8');
  });

  test('returns no results for missing videos', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/notfound'))).toEqual([]);
  });
});
