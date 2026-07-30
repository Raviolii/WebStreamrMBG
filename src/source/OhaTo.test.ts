import { OhaTO } from './OhaTo';

describe('OhaTO', () => {
  it('constructs', () => {
    const source = new OhaTO({} as never);
    expect(source.id).toBe('ohato');
  });
});
