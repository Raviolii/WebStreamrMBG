import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { Dropload } from './Dropload.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Dropload(new FetcherMock(`${__dirname}/__fixtures__/Dropload`), logger)]);

const ctx = createTestContext();

describe('Dropload', () => {
  test('dropload.io', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://dropload.io/embed-lyo2h1snpe5c.html'))).toMatchSnapshot();
  });

  test('dropload unknown height and size', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://dropload.io/gf2apij3ql37'))).toMatchSnapshot();
  });

  test('file not found', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://dropload.io/asdfghijklmn.html'))).toMatchSnapshot();
  });

  test('processing / internal problem', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://dropload.io/7xtxuac84xyh.html'))).toMatchSnapshot();
  });

  test('download URL', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://dropload.io/d/xhcmgcc2txnv'))).toMatchSnapshot();
  });
});
