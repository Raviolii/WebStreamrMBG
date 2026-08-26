import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Extractor } from './Extractor';

export class Torbox extends Extractor {
  public readonly id = 'torbox';

  public readonly label = 'TorBox';

  // Keep extractor cache short so TorBox final-URL resolution and metadata refresh promptly
  public override readonly ttl: number = 60 * 1000; // 1 minute

  public supports(_ctx: Context, url: URL): boolean {
    return url.hostname === 'api.torbox.app' && /\/v1\/api\/(usenet|torrents)\/requestdl$/.test(url.pathname);
  }

  protected async extractInternal(_ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const finalUrl = await this.fetcher.getFinalRedirectUrl(_ctx, url, { timeout: 10000 });
    const lowerPath = finalUrl.pathname.toLowerCase();
    const format = lowerPath.endsWith('.m3u8')
      ? Format.hls
      : lowerPath.endsWith('.mp4')
        ? Format.mp4
        : Format.unknown;

    return [
      {
        url: finalUrl,
        format,
        label: 'TorBox',
        meta,
      },
    ];
  };
}
