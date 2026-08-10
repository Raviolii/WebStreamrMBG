import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { Torbox } from './Torbox';
import { ExtractorRegistry } from './ExtractorRegistry';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const fixturePath = `${__dirname}/__fixtures__/Torbox`;

class TorboxFetcherMock extends FetcherMock {
  public override async getFinalRedirectUrl(_ctx: Parameters<FetcherMock['getFinalRedirectUrl']>[0], _url: Parameters<FetcherMock['getFinalRedirectUrl']>[1]): Promise<URL> {
    return new URL('https://cdn.example.com/video.mp4');
  }
}

const extractorRegistry = new ExtractorRegistry(logger, [new Torbox(new TorboxFetcherMock(fixturePath), logger)]);
const ctx = createTestContext();

describe('Torbox extractor', () => {
  test('supports TorBox requestdl URLs', () => {
    expect(new Torbox(new FetcherMock(fixturePath), logger).supports(ctx, new URL('https://api.torbox.app/v1/api/usenet/requestdl?token=abc&usenet_id=123&file_id=0&redirect=true'))).toBe(true);
  });

  test('follows TorBox redirect and returns final direct URL', async () => {
    const results = await extractorRegistry.handle(ctx, new URL('https://api.torbox.app/v1/api/usenet/requestdl?token=abc&usenet_id=123&file_id=0&redirect=true'));
    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.url.href).toBe('https://cdn.example.com/video.mp4');
    expect(result.isExternal).toBeUndefined();
  });
});
