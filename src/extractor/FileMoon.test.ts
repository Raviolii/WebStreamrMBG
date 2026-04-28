import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { FileMoon } from './FileMoon';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new FileMoon(new FetcherMock(`${__dirname}/__fixtures__/FileMoon`))]);

const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow.test.org', mediaFlowProxyPassword: 'test' });

describe('FileMoon', () => {
  test('extracts stream from API with playback data', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/c5lhlypfasmm'))).toMatchSnapshot();
  });

  test('handles video not found gracefully', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/n7i8zodwjqr9'))).toMatchSnapshot();
  });

  test('handles video without playback data gracefully', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/testnostream'))).toMatchSnapshot();
  });

  test('handles decrypted playback with no sources gracefully', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/emptysources'))).toMatchSnapshot();
  });

  test('handles non-HLS sources gracefully', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/onlymp4'))).toMatchSnapshot();
  });
});
