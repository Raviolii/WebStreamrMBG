import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';
import { Fastream } from './Fastream.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Fastream(new FetcherMock(`${__dirname}/__fixtures__/Fastream`), logger)]);

const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow-proxy.test', mediaFlowProxyPassword: 'asdfg' });

describe('Fastream', () => {
  test('fastream.to embed', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://fastream.to/embed-3aooif4ozt10.html'))).toMatchSnapshot();
  });

  test('expired or deleted', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://fastream.to/embed-a9rp1d1pqom7.html'))).toMatchSnapshot();
  });
});
