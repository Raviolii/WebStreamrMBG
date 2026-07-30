import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';
import { Uqload } from './Uqload.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Uqload(new FetcherMock(`${__dirname}/__fixtures__/Uqload`), logger)]);

const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow.test.org', mediaFlowProxyPassword: 'test' });

describe('Uqload', () => {
  test('uqload.net /embed-', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://uqload.net/embed-z0xbr87oz637.html'))).toMatchSnapshot();
  });

  test('file not found', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://uqload.cx/2ua47fdfkjgd.html'))).toMatchSnapshot();
  });
});
