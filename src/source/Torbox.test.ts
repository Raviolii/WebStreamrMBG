import { createTestContext } from '../test';
import { TmdbId } from '../utils';
import { Torbox } from './Torbox';

describe('Torbox', () => {
  test('returns all series matches for the same show from TorBox mylist', async () => {
    const fetcher = {
      json: jest.fn(async (_ctx, url) => {
        const href = url.href;

        if (href === 'https://api.themoviedb.org/3/tv/987654') {
          return {
            name: 'Example Show',
            first_air_date: '2020-01-01',
            original_name: 'Example Show',
          };
        }

        if (href === 'https://api.torbox.app/v1/api/usenet/mylist') {
          return {
            data: [
              {
                id: 1,
                name: 'Example.Show.S01E01.1080p.WEB-DL',
                title: 'Example.Show.S01E01.1080p.WEB-DL',
                download_finished: true,
                files: [{ id: 1, name: 'Example.Show.S01E01.1080p.WEB-DL.mkv', short_name: 'Example.Show.S01E01.1080p.WEB-DL.mkv' }],
              },
              {
                id: 2,
                name: 'Example.Show.S01E02.1080p.WEB-DL',
                title: 'Example.Show.S01E02.1080p.WEB-DL',
                download_finished: true,
                files: [{ id: 2, name: 'Example.Show.S01E02.1080p.WEB-DL.mkv', short_name: 'Example.Show.S01E02.1080p.WEB-DL.mkv' }],
              },
              {
                id: 3,
                name: 'Example.Show.S01E02.2160p.WEB-DL',
                title: 'Example.Show.S01E02.2160p.WEB-DL',
                download_finished: true,
                files: [{ id: 3, name: 'Example.Show.S01E02.2160p.WEB-DL.mkv', short_name: 'Example.Show.S01E02.2160p.WEB-DL.mkv' }],
              },
            ],
          };
        }

        if (href === 'https://api.torbox.app/v1/api/torrents/mylist') {
          return { data: [] };
        }

        throw new Error(`Unexpected URL: ${href}`);
      }),
    } as any;

    const source = new Torbox(fetcher);
    const ctx = createTestContext({ torboxApiKey: 'abc123' });

    const streams = await source.handle(ctx, 'series', new TmdbId(987654, 1, 2));

    expect(streams).toHaveLength(2);
    expect(streams.map(stream => stream.meta.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Example.Show.S01E02.1080p'),
        expect.stringContaining('Example.Show.S01E02.2160p'),
      ]),
    );
  });

  test('includes processing and downloading statuses when a TorBox item is not ready yet', async () => {
    const fetcher = {
      json: jest.fn(async (_ctx, url) => {
        const href = url.href;

        if (href === 'https://api.themoviedb.org/3/tv/987654') {
          return {
            name: 'Example Show',
            first_air_date: '2020-01-01',
            original_name: 'Example Show',
          };
        }

        if (href === 'https://api.torbox.app/v1/api/usenet/mylist') {
          return {
            data: [
              {
                id: 11,
                name: 'Example.Show.S01E05.1080p.WEB-DL',
                title: 'Example.Show.S01E05.1080p.WEB-DL',
                download_state: 'processing',
                progress: 0.85,
                files: [{ id: 11, name: 'Example.Show.S01E05.1080p.WEB-DL.mkv', short_name: 'Example.Show.S01E05.1080p.WEB-DL.mkv' }],
              },
              {
                id: 12,
                name: 'Example.Show.S01E06.1080p.WEB-DL',
                title: 'Example.Show.S01E06.1080p.WEB-DL',
                download_state: 'downloading',
                progress: 0.42,
                files: [{ id: 12, name: 'Example.Show.S01E06.1080p.WEB-DL.mkv', short_name: 'Example.Show.S01E06.1080p.WEB-DL.mkv' }],
              },
            ],
          };
        }

        if (href === 'https://api.torbox.app/v1/api/torrents/mylist') {
          return { data: [] };
        }

        throw new Error(`Unexpected URL: ${href}`);
      }),
    } as any;

    const source = new Torbox(fetcher);
    const ctx = createTestContext({ torboxApiKey: 'abc123' });

    const streams = await source.handle(ctx, 'series', new TmdbId(987654, 1, 5));

    expect(streams.map(stream => stream.meta.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Processing'),
      ]),
    );

    const downloadStream = await source.handle(ctx, 'series', new TmdbId(987654, 1, 6));
    expect(downloadStream.map(stream => stream.meta.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Downloading'),
      ]),
    );
  });
});
