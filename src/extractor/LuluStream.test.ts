import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';
import { LuluStream } from './LuluStream.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new LuluStream(new FetcherMock(`${__dirname}/__fixtures__/LuluStream`), logger)]);

const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow.test.org', mediaFlowProxyPassword: 'test' });

describe('LuluStream', () => {
  test('streamhihi d', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://streamhihi.com/d/mk9m58lz8ts6'))).toMatchSnapshot();
  });

  test('streamhihi', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://streamhihi.com/mk9m58lz8ts6'))).toMatchSnapshot();
  });

  test('no such file', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://lulustream.com/e/uthq0o0sljnx'))).toMatchSnapshot();
  });
});
