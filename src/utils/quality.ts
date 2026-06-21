export const parseQualityFromUrl = (input: string | URL): number | undefined => {
  const url = typeof input === 'string' ? input : input.href;

  // common patterns: 2160p, 1080p, 720p, 480p, 360p, 4k, 2k
  const pMatch = url.match(/(\d{3,4})p/i);
  if (pMatch) return Number(pMatch[1]);

  // numbers in path like /1080/ or _1080_
  const numMatch = url.match(/(?:_|\/|\-)(\d{3,4})(?:_|\/|\-|\.)/);
  if (numMatch) return Number(numMatch[1]);

  // 4k / 2160 / UHD — use non-alphanumeric boundaries so underscore matches
  if (/(^|[^0-9A-Za-z])4k(?:[^0-9A-Za-z]|$)/i.test(url) || /2160/i.test(url)) return 2160;
  if (/(^|[^0-9A-Za-z])2k(?:[^0-9A-Za-z]|$)/i.test(url) || /1440/i.test(url)) return 1440;

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

export const parseQualityLabelToHeight = (q?: string, fallback?: number): number | undefined => {
  if (!q) return fallback;
  const m = q.match(/(\d{3,4})/);
  if (m) return Number(m[1]);
  const l = q.toLowerCase();
  if (l.includes('4k') || l.includes('2160')) return 2160;
  if (l.includes('1440') || l.includes('2k')) return 1440;
  if (l.includes('1080') || l.includes('fhd') || l === 'hd') return 1080;
  if (l.includes('720')) return 720;
  if (l.includes('480') || l === 'sd') return 480;

  return fallback;
};
