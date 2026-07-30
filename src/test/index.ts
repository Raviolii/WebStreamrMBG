import { Config, Context } from '../types.js';
import { getDefaultConfig } from '../utils/index.js';

export const createTestContext = (config?: Config): Context => {
  return {
    hostUrl: new URL('http://localhost'),
    id: 'test',
    config: config ?? getDefaultConfig(),
  };
};
