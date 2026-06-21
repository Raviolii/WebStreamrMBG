export const parseQualityFromUrl = (input: string | URL): number | undefined => {
  const url = typeof input === 'string' ? input : input.href;

  // common patterns: 2160p, 1080p, 720p, 480p, 360p, 4k, 2k
  const pMatch = url.match(/(\d{3,4})p/i);
  if (pMatch) return Number(pMatch[1]);

  // numbers in path like /1080/ or _1080_
  const numMatch = url.match(/(?:_|\/|\-)(\d{3,4})(?:_|\/|\-|\.)/);
  if (numMatch) return Number(numMatch[1]);

  // 4k / 2160 / UHD
  if (/\b4k\b/i.test(url) || /2160/i.test(url)) return 2160;
  if (/\b2k\b/i.test(url) || /1440/i.test(url)) return 1440;

  // sometimes quality is in query param like ?q=1080 or &resolution=720
  const queryMatch = url.match(/[?&](?:q|quality|resolution|res)=(\d{3,4})/i);
  if (queryMatch) return Number(queryMatch[1]);

  return undefined;
};

export const qualityLabelFromUrl = (input: string | URL): string | undefined => {
  const h = parseQualityFromUrl(input);
  if (!h) return undefined;
  return `${h}p`;
};
