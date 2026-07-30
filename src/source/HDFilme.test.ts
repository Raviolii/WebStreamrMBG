import { HDFilme } from './HDFilme';
import { getTmdbId } from '../utils';

jest.mock('../utils', () => {
  const actual = jest.requireActual('../utils');
  return {
    ...actual,
    getTmdbId: jest.fn(),
  };
});

const mockedGetTmdbId = getTmdbId as jest.Mock;

describe('HDFilme', () => {
  beforeEach(() => {
    mockedGetTmdbId.mockReset();
  });

  it('returns empty results when season or episode is missing', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1 });
    const fetcher = { text: jest.fn() } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123' });
    expect(result).toEqual([]);
  });

  it('returns empty results when no series page is found', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = { text: jest.fn().mockResolvedValue('<html><body><a href="/foo">No series</a></body></html>') } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });
    expect(result).toEqual([]);
  });

  it('returns empty results when the season header is missing', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="/serien/test">Series</a></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 2</div><div class="su-spoiler-content">1x1</div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });
    expect(result).toEqual([]);
  });

  it('returns empty results when the episode marker is missing', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="/serien/test">Series</a></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 1</div><div class="su-spoiler-content">2x2</div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });
    expect(result).toEqual([]);
  });

  it('skips invalid and internal links while keeping external ones', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="/serien/test">Series</a></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 1</div><div class="su-spoiler-content">1x1<a href="javascript:void(0)">Ignore</a><a href="http://exa mple.com">Bad</a><a href="https://example.com/watch">Example</a><a href="https://hdfilme.win/embed">Internal</a></div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/watch');
  });

  it('returns parsed results from matching episode links', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="/serien/test">Series</a></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 1</div><div class="su-spoiler-content">1x1<a href="https://example.com/watch">Example</a></div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/watch');
  });

  it('handles episode with next episode marker present', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="/serien/test">Series</a></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 1</div><div class="su-spoiler-content">1x1<a href="https://example.com/first">First</a>1x2<a href="https://example.com/second">Second</a></div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/first');
  });

  it('handles empty content area html', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="/serien/test">Series</a></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 1</div><div class="su-spoiler-content"></div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });
    expect(result).toEqual([]);
  });

  it('handles last episode without next episode marker', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 3, formatSeasonAndEpisode: () => 'S01E03' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="/serien/test">Series</a></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 1</div><div class="su-spoiler-content">1x1 Link1 1x2 Link2 1x3<a href="https://example.com/last">Last</a></div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 3 });
    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/last');
  });

  it('uses Mirror label when anchor text is empty', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="/serien/test">Series</a></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 1</div><div class="su-spoiler-content">1x1<a href="https://example.com/empty"></a></div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]?.meta.title).toContain('(Mirror)');
  });

  it('skips report-error and player.php links', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="/serien/test">Series</a></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 1</div><div class="su-spoiler-content">1x1<a href="https://example.com/report-error">Error</a><a href="https://example.com/engine/player.php">Player</a><a href="https://example.com/valid">Valid</a></div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/valid');
  });

  it('handles element without href attribute during search filtering', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="/serien/test">Series</a><span>No href</span></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 1</div><div class="su-spoiler-content">1x1<a href="https://example.com/watch">Example</a></div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/watch');
  });

  it('handles element with empty href during search filtering', async () => {
    mockedGetTmdbId.mockResolvedValue({ id: 'tt123', season: 1, episode: 1, formatSeasonAndEpisode: () => 'S01E01' });
    const fetcher = {
      text: jest.fn()
        .mockResolvedValueOnce('<html><body><a href="">Empty</a><a href="/serien/test">Series</a></body></html>')
        .mockResolvedValueOnce('<html><body><div class="su-spoiler-title">Staffel 1</div><div class="su-spoiler-content">1x1<a href="https://example.com/watch">Example</a></div></body></html>'),
    } as never;
    const source = new HDFilme(fetcher);
    const ctx = { config: {} } as never;

    const result = await (source as any).handleInternal(ctx, 'series', { id: 'tt123', season: 1, episode: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toBe('https://example.com/watch');
  });
});
