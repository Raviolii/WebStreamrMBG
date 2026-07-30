import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';
import { Mixdrop } from './Mixdrop.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Mixdrop(new FetcherMock(`${__dirname}/__fixtures__/Mixdrop`), logger)]);

const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow-proxy.test', mediaFlowProxyPassword: 'asdfg' });

describe('Mixdrop', () => {
  test('mixdrop.my /e/', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://mixdrop.my/e/knq0kj8waq44l8'))).toMatchSnapshot();
  });

  test('deleted or expired file', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://mixdrop.ag/e/123456789'))).toMatchSnapshot();
  });
});
