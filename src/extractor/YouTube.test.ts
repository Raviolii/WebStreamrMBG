import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';
import { YouTube } from './YouTube.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new YouTube(new FetcherMock(`${__dirname}/__fixtures__/YouTube`), logger)]);

const ctx = createTestContext();

describe('YouTube', () => {
  test('Solaris', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://www.youtube.com/watch?v=Z8ZhQPaw4rE'))).toMatchSnapshot();
  });

  test('unsupported format', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://youtu.be/Z8ZhQPaw4rE?feature=shared'))).toMatchSnapshot();
  });
});
