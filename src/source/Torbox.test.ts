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
});
