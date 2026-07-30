import { Context } from '../types.js';
import { Fetcher } from './Fetcher.js';

// Parse HLS master playlist and return the highest variant height found
export const inferHeightFromHls = async (ctx: Context, fetcher: Fetcher, url: URL): Promise<number | undefined> => {
  try {
    const data = await fetcher.text(ctx, url, { timeout: 5000 });
    const lines = data.split(/\r?\n/);

    const heights: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      if (line.startsWith('#EXT-X-STREAM-INF')) {
        // attributes after ':'
        const attrs = line.split(':')[1] ?? '';
        const resMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);
        if (resMatch) {
          heights.push(Number(resMatch[2]));
          continue;
        }

        // try to look at the next URI (variant) for hints (filename may contain 720p)
        const next = lines[i + 1] ?? '';
        const urlMatch = next.match(/(\d{3,4})p/);
        if (urlMatch) heights.push(Number(urlMatch[1]));
      }
    }

    if (heights.length) return Math.max(...heights);

    return undefined;
  } catch {
    return undefined;
  }
};

export default inferHeightFromHls;
