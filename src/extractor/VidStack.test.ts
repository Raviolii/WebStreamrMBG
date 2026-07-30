import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';
import { MoflixRpmplay, VidStack } from './VidStack.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new MoflixRpmplay(new FetcherMock(`${__dirname}/__fixtures__/VidStack`), logger), new VidStack(new FetcherMock(`${__dirname}/__fixtures__/VidStack`), logger)]);

const ctx = createTestContext();

describe('VidStack', () => {
  test('extracts an hls stream from a decrypted payload', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://server1.uns.bio/#abc123'))).toMatchSnapshot();
  });

  test('returns the original URL when no hash is present', () => {
    const extractor = new VidStack(new FetcherMock(`${__dirname}/__fixtures__/VidStack`), logger);
    const url = new URL('https://server1.uns.bio/');

    expect(extractor.normalize(url)).toEqual(url);
  });

  test('returns empty when decrypted payload has no source', async () => {
    const results = await extractorRegistry.handle(ctx, new URL('https://server1.uns.bio/#nosource'));
    expect(results).toHaveLength(0);
  });

  test('returns empty when decrypted payload is not an object', async () => {
    const results = await extractorRegistry.handle(ctx, new URL('https://server1.uns.bio/#primitive'));
    expect(results).toHaveLength(0);
  });

  test('returns empty when payload cannot be decrypted', async () => {
    const results = await extractorRegistry.handle(ctx, new URL('https://server1.uns.bio/#baddecrypt'));
    expect(results).toHaveLength(0);
  });
});
