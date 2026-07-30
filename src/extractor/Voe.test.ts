import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';
import { Voe } from './Voe.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Voe(new FetcherMock(`${__dirname}/__fixtures__/Voe`), logger)]);

const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow.test.org', mediaFlowProxyPassword: 'test' });

describe('Voe', () => {
  test.skip('jilliandescribecompany', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://jilliandescribecompany.com/e/ea21l02gcygw'))).toMatchSnapshot();
  });

  test('premium only without resolution', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://jilliandescribecompany.com/qqfyi04w52mj'))).toMatchSnapshot();
  });

  test('encoding error', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://voe.sx/e/c2yxvit4f6bz'))).toMatchSnapshot();
  });

  test.skip('charlestoughrace.com custom domain', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://charlestoughrace.com/e/lbeqm6ofmauq'))).toMatchSnapshot();
  });

  test('embed only urls which otherwise lead to 404', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://mikaylaarealike.com/e/gqlhm9hbobwu'))).toMatchSnapshot();
  });

  test('no file size in page', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://jilliandescribecompany.com/nosize123'))).toMatchSnapshot();
  });
});
