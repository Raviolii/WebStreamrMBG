import { inferHeightFromHls } from './hls';
import { Context } from '../types';
import { Fetcher } from './Fetcher';

const ctx = {} as Context;

class FakeFetcher implements Partial<Fetcher> {
  private readonly payload: string;
  constructor(payload: string) {
    this.payload = payload;
  }
  public async text(_ctx: Context, _url: URL): Promise<string> {
    return this.payload;
  }
}

test('parses resolutions from master playlist', async () => {
  const payload = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720
mid.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080
hi.m3u8
`;

  const f = new FakeFetcher(payload) as unknown as Fetcher;
  const height = await inferHeightFromHls(ctx, f, new URL('https://example.com/master.m3u8'));
  expect(height).toBe(1080);
});

test('parses numeric tokens from variant URI when RESOLUTION missing', async () => {
  const payload = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1400000
mid_720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000
hi_1080p.m3u8
`;

  const f = new FakeFetcher(payload) as unknown as Fetcher;
  const height = await inferHeightFromHls(ctx, f, new URL('https://example.com/master.m3u8'));
  expect(height).toBe(1080);
});

test('returns undefined on fetch error', async () => {
  const badFetcher = { text: async () => { throw new Error('fail'); } } as unknown as Fetcher;
  const height = await inferHeightFromHls(ctx, badFetcher, new URL('https://example.com/master.m3u8'));
  expect(height).toBeUndefined();
});
