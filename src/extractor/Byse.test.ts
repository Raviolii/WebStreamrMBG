import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { Byse } from './Byse';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Byse(new FetcherMock(`${__dirname}/__fixtures__/Byse`), logger)]);

const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow-proxy.test', mediaFlowProxyPassword: 'asdfg' });

describe('Byse', () => {
  test.skip('filemoon.sx /e/', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/test123'))).toMatchSnapshot();
  });

  test.skip('byse.sx /e/', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://byse.sx/e/test456'))).toMatchSnapshot();
  });

  test.skip('cinegrab.com /e/', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://cinegrab.com/e/test789'))).toMatchSnapshot();
  });

  test.skip('video not found', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/notfound'))).toMatchSnapshot();
  });
});
