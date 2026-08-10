import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { envGet, Fetcher, getTmdbId, getTmdbNameAndYear, Id } from '../utils';
import { Source, SourceResult } from './Source';

interface TorboxApiFile {
  id?: number | string;
  name?: string;
  short_name?: string;
  size?: number;
}

interface TorboxApiItem {
  id: number | string;
  name?: string;
  title?: string;
  size?: number;
  files?: TorboxApiFile[];
  download_finished?: boolean;
  download_present?: boolean;
  cached?: boolean;
  progress?: number;
  download_state?: string;
  active?: boolean;
}

interface TorboxListResponse {
  data?: TorboxApiItem[];
}

const videoExtensions = ['.mp4', '.mkv', '.avi', '.m4v', '.ts', '.mov', '.wmv'];

function normalize(str?: string): string {
  return (str || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractSeasonEpisode(str?: string): { season: number; episode: number } | null {
  const m = (str || '').match(/[sS](\d{1,2})[eE](\d{1,2})/);
  if (!m || !m[1] || !m[2]) return null;
  return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
}

function significantTokens(str: string): string[] {
  const stop = new Set([
    'the', 'and', 'of', 'a', 'an', 'in', 'on', 'to', 'for', 'with', 'dl', 'web', 'webrip', 'bluray',
    'hdtv', 'x264', 'x265', 'hevc', 'aac', 'ac3', 'dts', 'german', 'ger', 'deutsch', 'deu', 'multi',
    'proper', 'repack', 'internal', 'season', 'episode', 'series', 'movie', 'film', 'hdr', 'dv', 'uhd',
  ]);
  return normalize(str)
    .split(' ')
    .filter((t) => t.length > 1 && !stop.has(t) && !/^\d{3,4}p$/.test(t) && !/^s\d{1,2}e\d{1,2}$/i.test(t));
}

function scoreAgainstName(name: string, titleTokens: string[], season?: number, episode?: number): number {
  const candNorm = normalize(name);
  if (!candNorm) return 0;

  const se = extractSeasonEpisode(name);
  if (season != null && episode != null && se && (se.season !== season || se.episode !== episode)) return 0;

  if (titleTokens.length === 0) return 0;

  let hits = 0;
  for (const t of titleTokens) {
    const singular = t.endsWith('s') ? t.slice(0, -1) : t;
    const plural = t + 's';
    if (candNorm.includes(t) || candNorm.includes(singular) || candNorm.includes(plural)) {
      hits++;
    }
  }

  const minRequired = titleTokens.length <= 2 ? titleTokens.length : Math.max(1, Math.floor(titleTokens.length * 0.75));
  if (hits >= minRequired) {
    let s = hits / titleTokens.length;
    if (season != null && episode != null && se && se.season === season && se.episode === episode) {
      return 1.2;
    }
    return s;
  }

  return 0;
}

function isReady(item: TorboxApiItem): boolean {
  return item.download_finished === true
    || item.download_present === true
    || item.cached === true
    || (typeof item.progress === 'number' && item.progress >= 1)
    || ['completed', 'complete', 'cached', 'ready', 'finished'].some(s => (item.download_state || '').toLowerCase().includes(s));
}

function getBestVideoFile(files?: TorboxApiFile[] | null): TorboxApiFile | null {
  if (!files || !files.length) return null;

  const videos = files.filter((f) => {
    const name = (f.name || f.short_name || '').toLowerCase();
    const isVideo = videoExtensions.some(ext => name.endsWith(ext) || name.includes(ext + ' '));
    const isSample = name.includes('sample');
    const isJunk = name.endsWith('.nfo') || name.endsWith('.txt') || name.endsWith('.jpg') || name.endsWith('.png');
    return isVideo && !isSample && !isJunk;
  });

  if (videos.length > 0) {
    videos.sort((a, b) => (b.size || 0) - (a.size || 0));
    return videos[0] ?? null;
  }

  const nonJunk = files.filter((f) => {
    const name = (f.name || f.short_name || '').toLowerCase();
    return !name.endsWith('.nfo') && !name.endsWith('.txt') && !name.includes('sample');
  });

  if (nonJunk.length > 0) {
    nonJunk.sort((a, b) => (b.size || 0) - (a.size || 0));
    return nonJunk[0] ?? null;
  }

  return files[0] ?? null;
}

export class Torbox extends Source {
  public readonly id = 'torbox';

  public readonly label = 'TorBox';

  public readonly contentTypes: ContentType[] = ['movie', 'series'];

  public readonly countryCodes: CountryCode[] = [CountryCode.multi];

  public readonly baseUrl = 'https://api.torbox.app';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  public async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const apiKey = ctx.config.torboxApiKey || envGet('TORBOX_API_KEY');
    if (!apiKey) return [];

    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    const [name] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId);

    const [usenetList, torrentList] = await Promise.all([
      this.fetchMyList(ctx, 'usenet', apiKey),
      this.fetchMyList(ctx, 'torrents', apiKey),
    ]);

    const titleTokens = significantTokens(name || '');
    const mediaType = _type === 'series' ? 'tv' : 'movie';
    const results: Array<{ score: number; stream: SourceResult }> = [];

    const consider = (item: TorboxApiItem, streamType: 'usenet' | 'torrents') => {
      const itemName = String(item.name || item.title || '').toLowerCase();

      if (tmdbId?.id) {
        const season = tmdbId.season;
        const episode = tmdbId.episode;
        let exactQuery = '';
        if (mediaType === 'tv' && season != null && episode != null) {
          exactQuery = `tmdb-${tmdbId.id} s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`.toLowerCase();
        } else {
          exactQuery = `tmdb-${tmdbId.id}`.toLowerCase();
        }

        if (itemName.includes(exactQuery)) {
          const bestFile = getBestVideoFile(item.files);
          if (isReady(item)) {
            results.push({ score: 10, stream: this.buildTorBoxStream(item, streamType, apiKey, bestFile, name) });
            return;
          }
        }
      }

      if (titleTokens.length > 0) {
        const names = [item.name || ''];
        if (Array.isArray(item.files)) {
          for (const f of item.files) {
            if (f.name) names.push(f.name);
            if (f.short_name) names.push(f.short_name);
          }
        }

        let best = 0;
        for (const n of names) {
          const s = scoreAgainstName(n, titleTokens, tmdbId.season, tmdbId.episode);
          if (s > best) best = s;
        }

        if (best >= 0.75) {
          const bestFile = getBestVideoFile(item.files);
          if (isReady(item)) {
            results.push({ score: best, stream: this.buildTorBoxStream(item, streamType, apiKey, bestFile, name) });
          }
        }
      }
    };

    for (const item of usenetList) consider(item, 'usenet');
    for (const item of torrentList) consider(item, 'torrents');

    results.sort((a, b) => b.score - a.score);
    return results.map((r) => r.stream);
  }

  private async fetchMyList(ctx: Context, type: 'usenet' | 'torrents', apiKey: string): Promise<TorboxApiItem[]> {
    const url = new URL(`https://api.torbox.app/v1/api/${type}/mylist`);

    try {
      const json = await this.fetcher.json(ctx, url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      }) as TorboxListResponse;
      return (json?.data as TorboxApiItem[]) ?? [];
    } catch {
      return [];
    }
  }

  private buildTorBoxStream(item: TorboxApiItem, type: 'usenet' | 'torrents', apiKey: string, file: TorboxApiFile | null, titleHint: string): SourceResult {
    const idParam = type === 'usenet' ? 'usenet_id' : 'torrent_id';
    const fileId = file && file.id != null ? file.id : 0;
    const targetUrl = new URL(`https://api.torbox.app/v1/api/${type}/requestdl`);
    targetUrl.searchParams.set('token', apiKey);
    targetUrl.searchParams.set(idParam, String(item.id));
    targetUrl.searchParams.set('file_id', String(fileId));
    targetUrl.searchParams.set('redirect', 'true');

    const filename = file ? file.short_name || file.name || item.name || item.title : item.name || item.title;
    const displayTitle = filename || titleHint || 'TorBox item';

    return {
      url: targetUrl,
      meta: {
        countryCodes: [CountryCode.multi],
        title: `TorBox · ${displayTitle}`,
      },
    };
  }
}
