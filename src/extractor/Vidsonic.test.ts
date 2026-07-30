import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';
import { Vidsonic } from './Vidsonic.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Vidsonic(new FetcherMock(`${__dirname}/__fixtures__/Vidsonic`), logger)]);

const ctx = createTestContext();

describe('Vidsonic', () => {
  test('vidsonic.net embed', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidsonic.net/e/abc123'))).toMatchSnapshot();
  });

  test('vidsonic.net without hex string returns error', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidsonic.net/e/nourl'))).toMatchSnapshot();
  });
});
