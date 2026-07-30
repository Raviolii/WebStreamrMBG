import winston from 'winston';
import { createTestContext } from '../test/index.js';
import { FetcherMock } from '../utils/index.js';
import { ExtractorRegistry } from './ExtractorRegistry.js';
import { Fsst } from './Fsst.js';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Fsst(new FetcherMock(`${__dirname}/__fixtures__/Fsst`), logger)]);

const ctx = createTestContext();

describe('Fsst', () => {
  test('Wake up Dead Man', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://fsst.online/embed/948429/'))).toMatchSnapshot();
  });
});
