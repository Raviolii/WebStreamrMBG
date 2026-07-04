import crypto from 'crypto';
import winston from 'winston';
import { NotFoundError } from '../error';
import { createTestContext } from '../test';
import { Fetcher } from '../utils';
import { Byse } from './Byse';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const ctx = createTestContext();

async function callExtractInternal(extractor: Byse, url: URL) {
  return (extractor as unknown as {
    extractInternal: (ctx: typeof ctx, url: URL, meta: Record<string, unknown>) => Promise<unknown[]>;
  }).extractInternal(ctx, url, {});
}

function createFetcher(responses: Record<string, unknown>): Fetcher {
  return {
    json: jest.fn(async (_ctx: typeof ctx, url: URL) => responses[url.href] ?? {}),
  } as unknown as Fetcher;
}

describe('Byse', () => {
  test('supports and normalizes the expected hosts', () => {
    const extractor = new Byse(createFetcher({}), logger);
    const url = new URL('https://byse.sx/videos/123');

    expect(extractor.supports(ctx, url)).toBe(true);
    expect(extractor.supports(ctx, new URL('https://example.com/videos/123'))).toBe(false);
    expect(extractor.normalize(url)).toEqual(url);
  });

  test('extracts a direct playback URL when the payload is already a URL', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: { playback: { payload: 'https://cdn.example.com/master.m3u8' } },
    }), logger);

    const result = await callExtractInternal(extractor, new URL('https://byse.sx/videos/123'));

    expect(result).toHaveLength(1);
    expect((result[0] as { url: URL }).url.href).toBe('https://cdn.example.com/master.m3u8');
  });

  test('returns empty results when embed details are missing', async () => {
    const extractor = new Byse(createFetcher({
      'https://byse.sx/api/videos/123/embed/details': {},
    }), logger);

    await expect(callExtractInternal(extractor, new URL('https://byse.sx/videos/123'))).rejects.toThrow(NotFoundError);
  });

  test('returns empty results when playback is missing', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: {},
    }), logger);

    await expect(callExtractInternal(extractor, new URL('https://byse.sx/videos/123'))).rejects.toThrow(NotFoundError);
  });

  test('returns empty results when encrypted playback cannot be decoded', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: { playback: { key_parts: ['abc'], payload: 'bad-payload' } },
    }), logger);

    await expect(callExtractInternal(extractor, new URL('https://byse.sx/videos/123'))).rejects.toThrow(NotFoundError);
  });

  test('covers the base64url and decryption helper branches', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const key = Buffer.from('0123456789abcdef');
    const iv = Buffer.from('123456789012');
    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from('https://cdn.example.com/master.m3u8')), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: {
        playback: {
          key_parts: [Buffer.from('0123456789abcdef').toString('base64url'), Buffer.from('0123456789abcdef').toString('base64url')],
          iv: iv.toString('base64url'),
          payload: `${ciphertext.toString('base64url')}.${authTag.toString('base64url')}`,
        },
      },
    }), logger);

    const result = await callExtractInternal(extractor, new URL('https://byse.sx/videos/123'));
    expect(result).toHaveLength(1);
    expect((result[0] as { url: URL }).url.href).toBe('https://cdn.example.com/master.m3u8');
  });

  test('returns empty results when key parts are missing', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: { playback: { payload: 'bad-payload' } },
    }), logger);

    await expect(callExtractInternal(extractor, new URL('https://byse.sx/videos/123'))).rejects.toThrow(NotFoundError);
  });

  test('handles direct playback URL with http:// protocol', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: { playback: { payload: 'http://cdn.example.com/master.m3u8' } },
    }), logger);

    const result = await callExtractInternal(extractor, new URL('https://byse.sx/videos/123'));

    expect(result).toHaveLength(1);
    expect((result[0] as { url: URL }).url.href).toBe('http://cdn.example.com/master.m3u8');
  });

  test('handles direct http:// playback URL', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: { playback: { payload: 'http://cdn.example.com/master.m3u8' } },
    }), logger);

    const result = await callExtractInternal(extractor, new URL('https://byse.sx/videos/123'));

    expect(result).toHaveLength(1);
    expect((result[0] as { url: URL }).url.href).toBe('http://cdn.example.com/master.m3u8');
  });

  test('handles embed_frame_url with empty path component', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos//embed/playback';
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/' },
      [playbackUrl]: { playback: { payload: 'https://cdn.example.com/stream.m3u8' } },
    }), logger);

    const result = await callExtractInternal(extractor, new URL('https://byse.sx/videos/123'));
    expect(result).toHaveLength(1);
  });

  test('processes encrypted payload when payload does not start with http/https', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const key = Buffer.from('0123456789abcdef');
    const iv = Buffer.from('123456789012');
    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from('https://cdn.example.com/video.m3u8')), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: {
        playback: {
          key_parts: [Buffer.from('0123456789abcdef').toString('base64url'), Buffer.from('0123456789abcdef').toString('base64url')],
          iv: iv.toString('base64url'),
          payload: `${ciphertext.toString('base64url')}.${authTag.toString('base64url')}`,
        },
      },
    }), logger);

    const result = await callExtractInternal(extractor, new URL('https://byse.sx/videos/123'));
    expect(result).toHaveLength(1);
    expect((result[0] as { url: URL }).url.href).toBe('https://cdn.example.com/video.m3u8');
  });

  test('handles missing payload in playback object', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const key = Buffer.from('0123456789abcdef');
    const iv = Buffer.from('123456789012');
    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from('https://cdn.example.com/video.m3u8')), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: {
        playback: {
          key_parts: [Buffer.from('0123456789abcdef').toString('base64url'), Buffer.from('0123456789abcdef').toString('base64url')],
          iv: iv.toString('base64url'),
          payload: undefined,
        },
      },
    }), logger);

    await expect(callExtractInternal(extractor, new URL('https://byse.sx/videos/123'))).rejects.toThrow(NotFoundError);
  });

  test('handles missing iv in playback object', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const key = Buffer.from('0123456789abcdef');
    const cipher = crypto.createCipheriv('aes-128-gcm', key, Buffer.from('123456789012'));
    const ciphertext = Buffer.concat([cipher.update(Buffer.from('https://cdn.example.com/video.m3u8')), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: {
        playback: {
          key_parts: [Buffer.from('0123456789abcdef').toString('base64url'), Buffer.from('0123456789abcdef').toString('base64url')],
          iv: undefined,
          payload: `${ciphertext.toString('base64url')}.${authTag.toString('base64url')}`,
        },
      },
    }), logger);

    await expect(callExtractInternal(extractor, new URL('https://byse.sx/videos/123'))).rejects.toThrow(NotFoundError);
  });

  test('fails to decrypt payload without auth tag', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const key = Buffer.from('0123456789abcdef');
    const iv = Buffer.from('123456789012');
    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from('https://cdn.example.com/master.m3u8')), cipher.final()]);
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: {
        playback: {
          key_parts: [Buffer.from('0123456789abcdef').toString('base64url'), Buffer.from('0123456789abcdef').toString('base64url')],
          iv: iv.toString('base64url'),
          payload: ciphertext.toString('base64url'),
        },
      },
    }), logger);

    await expect(callExtractInternal(extractor, new URL('https://byse.sx/videos/123'))).rejects.toThrow(NotFoundError);
  });

  test('returns empty results when decrypted payload is empty', async () => {
    const detailsUrl = 'https://byse.sx/api/videos/123/embed/details';
    const playbackUrl = 'https://byse.sx/api/videos/abc/embed/playback';
    const key = Buffer.from('0123456789abcdef');
    const iv = Buffer.from('123456789012');
    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from('')), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const extractor = new Byse(createFetcher({
      [detailsUrl]: { embed_frame_url: 'https://byse.sx/embed/abc' },
      [playbackUrl]: {
        playback: {
          key_parts: [Buffer.from('0123456789abcdef').toString('base64url'), Buffer.from('0123456789abcdef').toString('base64url')],
          iv: iv.toString('base64url'),
          payload: `${ciphertext.toString('base64url')}.${authTag.toString('base64url')}`,
        },
      },
    }), logger);

    await expect(callExtractInternal(extractor, new URL('https://byse.sx/videos/123'))).rejects.toThrow(NotFoundError);
  });
});
