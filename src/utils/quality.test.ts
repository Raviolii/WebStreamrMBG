import { parseQualityFromUrl, qualityLabelFromUrl } from './quality.js';

describe('parseQualityFromUrl', () => {
  test('parses 1080p token', () => {
    expect(parseQualityFromUrl('https://example.com/video-1080p/master.m3u8')).toBe(1080);
  });

  test('parses numeric segment', () => {
    expect(parseQualityFromUrl('https://cdn.example.com/1080/playlist.m3u8')).toBe(1080);
  });

  test('parses query param', () => {
    expect(parseQualityFromUrl('https://ex.com/stream.m3u8?q=720')).toBe(720);
  });

  test('parses 4k token', () => {
    expect(parseQualityFromUrl('https://ex.com/video_4k.m3u8')).toBe(2160);
  });

  test('returns undefined when no hint', () => {
    expect(parseQualityFromUrl('https://ex.com/no-hint.m3u8')).toBeUndefined();
  });
});

describe('qualityLabelFromUrl', () => {
  test('returns label for 1080', () => {
    expect(qualityLabelFromUrl('https://ex.com/1080p/playlist')).toBe('1080p');
  });

  test('returns undefined when unknown', () => {
    expect(qualityLabelFromUrl('https://ex.com/unknown')).toBeUndefined();
  });
});
