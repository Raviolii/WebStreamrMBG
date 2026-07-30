import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';
import { VixSrc } from './VixSrc.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new VixSrc(new FetcherMock(`${__dirname}/__fixtures__/VixSrc`), logger)]);

const ctx = createTestContext();

describe('VixSrc', () => {
  test('Full Metal Jacket', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vixsrc.to/movie/600'))).toMatchSnapshot();
  });
  test('Full Metal Jacket via MediaFlow Proxy', async () => {
    const ctxMfp = createTestContext({ multi: '', mediaFlowProxyUrl: 'mediaflow.test.org', mediaFlowProxyPassword: 'test' });
    expect(await extractorRegistry.handle(ctxMfp, new URL('https://vixsrc.to/movie/600'))).toMatchSnapshot();
  });

  test('Black Mirror', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vixsrc.to/tv/42009/4/2'))).toMatchSnapshot();
  });

  test('Rental Family', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vixsrc.to/movie/1208348'))).toMatchSnapshot();
  });

  test('Black Mirror is excluded if no matching language was found', async () => {
    const ctx = createTestContext({ de: 'on' });

    expect(await extractorRegistry.handle(ctx, new URL('https://vixsrc.to/tv/42009/4/3'))).toMatchSnapshot();
  });

  test('returns empty when embed page has no token/expires/url patterns', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vixsrc.to/movie/999999'))).toHaveLength(0);
  });
});
