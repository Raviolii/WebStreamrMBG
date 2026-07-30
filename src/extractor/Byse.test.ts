import crypto from 'node:crypto';
import axios from 'axios';
import winston from 'winston';
import { NotFoundError } from '../error';
import { createTestContext } from '../test';
import { Context } from '../types';
import { CustomRequestConfig, Fetcher } from '../utils';
import { Byse } from './Byse';
import { ExtractorRegistry } from './ExtractorRegistry';

jest.mock('elliptic', () => ({
  ec: jest.fn().mockImplementation(() => ({
    genKeyPair: () => ({
      getPublic: () => ({
        getX: () => ({ toArray: () => Buffer.alloc(32) }),
        getY: () => ({ toArray: () => Buffer.alloc(32) }),
      }),
      sign: () => ({ toDER: () => Buffer.from('signature') }),
    }),
  })),
}), { virtual: true });

interface Scenario {
  detailsResponse?: Record<string, unknown>;
  detailsError?: Error;
  embedDetailsResponse?: Record<string, unknown>;
  embedDetailsError?: Error;
  settingsResponse?: Record<string, unknown>;
  playbackResponse?: Record<string, unknown>;
  playbackError?: Error;
  textResponse?: string;
  embedTextResponse?: string;
  textPostResponse?: string;
}

class ByseFetcherMock extends Fetcher {
  public constructor(logger: winston.Logger, private readonly scenario: Scenario = {}) {
    super(axios, logger);
  }

  public override async json(_ctx: Context, url: URL, _requestConfig?: CustomRequestConfig): Promise<any> {
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
      if (url.pathname.includes('/embed/')) {
        if (this.scenario.embedDetailsError) {
          throw this.scenario.embedDetailsError;
        }
        return this.scenario.embedDetailsResponse ?? { embed_frame_url: undefined };
      }

      if (this.scenario.detailsError) {
        throw this.scenario.detailsError;
      }

      return this.scenario.detailsResponse ?? { embed_frame_url: undefined };
    }

    if (url.pathname.endsWith('/settings')) {
      return this.scenario.settingsResponse ?? { captcha_required: false };
    }

    if (url.pathname.endsWith('/challenge')) {
      return { nonce: 'challenge' };
    }

    if (url.pathname.endsWith('/attest')) {
      return { token: 'token', viewer_id: 'viewer', device_id: 'device', confidence: 1 };
    }

    if (url.pathname.endsWith('/captcha')) {
      return { pow_nonce: 'nonce', pow_difficulty: 0, pow_token: 'token' };
    }

    if (url.pathname.endsWith('/captcha/verify')) {
      return { token: 'captcha-token' };
    }

    if (url.pathname.endsWith('/playback')) {
      if (this.scenario.playbackError) {
        throw this.scenario.playbackError;
      }
      return this.scenario.playbackResponse ?? {
        sources: [
          { url: 'https://cdn.example/test-480.m3u8', label: '480' },
          { url: 'https://cdn.example/test-720.m3u8', label: '720' },
        ],
      };
    }

    throw new Error(`Unexpected request URL: ${url.href}`);
  }

  public override async text(_ctx: Context, url: URL): Promise<string> {
    if (this.scenario.embedTextResponse && url.pathname.includes('/embed/')) {
      return this.scenario.embedTextResponse;
    }

    return this.scenario.textResponse ?? '';
  }

  public override async textPost(_ctx: Context, _url: URL, _body: string): Promise<string> {
    return this.scenario.textPostResponse ?? '';
  }
}

function createEncryptedPlaybackPayload(plaintext: string): Record<string, unknown> {
  const key = Buffer.from('1234567890abcdef');
  const iv = Buffer.from('1234567890abcdef');
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv.subarray(0, 12));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = `${encrypted.toString('base64')}.${authTag.toString('base64')}`;

  return {
    playback: {
      iv: iv.toString('base64'),
      payload,
      key_parts: [Buffer.from('1234567890abcdef').toString('base64')],
    },
  };
}

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow-proxy.test', mediaFlowProxyPassword: 'asdfg' });

describe('Byse', () => {
  test('extracts a stream with request headers', async () => {
    const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger), logger)]);
    const result = await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/test123'));

    expect(result).toHaveLength(1);
    expect(result[0]?.format).toBe('hls');
    expect(result[0]?.label).toBe('720');
    expect(result[0]?.url.href).toBe('https://cdn.example/test-720.m3u8');
    expect(result[0]?.requestHeaders).toEqual({
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; TX6s) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
      'Referer': 'https://filemoon.sx/',
      'Origin': 'https://filemoon.sx',
    });
  });

  test('returns no results for missing videos', async () => {
    const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger, { detailsError: new NotFoundError() }), logger)]);
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/notfound'))).toEqual([]);
  });

  test('uses embed text fallback when playback lookup fails', async () => {
    const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger, {
      detailsResponse: { embed_frame_url: 'https://embed.example/embed/abc123' },
      settingsResponse: { captcha_required: false },
      playbackError: new Error('boom'),
      embedTextResponse: 'https://cdn.example/embed-fallback.m3u8',
    }), logger)]);

    const result = await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/embed-fallback'));

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://cdn.example/embed-fallback.m3u8');
  });

  test('rethrows NotFound from embed details lookup', async () => {
    const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger, {
      detailsError: new Error('boom'),
      embedDetailsError: new NotFoundError(),
    }), logger)]);

    await expect(extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/embed-notfound'))).resolves.toEqual([]);
  });

  test('returns empty when captcha challenge cannot be solved', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now');
    let now = 0;
    dateNowSpy.mockImplementation(() => {
      now += 30000;
      return now;
    });

    const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger, {
      detailsResponse: { embed_frame_url: undefined },
      settingsResponse: { captcha_required: true },
      playbackError: new NotFoundError(),
    }), logger)]);

    await expect(extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/captcha-fail'))).resolves.toEqual([]);

    dateNowSpy.mockRestore();
  });

  test('uses a zero-difficulty captcha solution', async () => {
    const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger, {
      detailsResponse: { embed_frame_url: undefined },
      settingsResponse: { captcha_required: true },
      playbackResponse: { sources: [{ url: 'https://cdn.example/captcha.m3u8', label: '720' }] },
    }), logger)]);

    const result = await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/captcha-zero'));

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://cdn.example/captcha.m3u8');
  });

  test('returns a direct playback payload URL', async () => {
    const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger, {
      playbackResponse: { playback: { payload: 'https://cdn.example/direct.m3u8' } },
    }), logger)]);

    const result = await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/direct-payload'));

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://cdn.example/direct.m3u8');
  });

  test('decrypts a playback payload into a direct URL', async () => {
    const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger, {
      playbackResponse: createEncryptedPlaybackPayload('https://cdn.example/decrypted.m3u8') as Record<string, unknown>,
    }), logger)]);

    const result = await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/encrypted-payload'));

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://cdn.example/decrypted.m3u8');
  });

  test('returns no results when playback payload cannot be parsed', async () => {
    const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger, {
      playbackResponse: { playback: { iv: 'abc', payload: 'no-dot' } },
    }), logger)]);

    await expect(extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/invalid-payload'))).resolves.toEqual([]);
  });

  test('returns no results when playback has no usable source', async () => {
    const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new ByseFetcherMock(logger, {
      playbackResponse: { playback: { payload: 'https://cdn.example/empty.m3u8' }, sources: [{ url: '', label: '480' }] },
    }), logger)]);

    await expect(extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/no-source'))).resolves.toEqual([]);
  });
});
