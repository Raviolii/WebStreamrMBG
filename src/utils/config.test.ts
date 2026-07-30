import { getDefaultConfig } from './config.js';

describe('getDefaultConfig', () => {
  test('has English enabled', () => {
    expect(getDefaultConfig().en).toBe('on');
  });
});
