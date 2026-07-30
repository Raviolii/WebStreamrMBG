import { Context, Format, InternalUrlResult, Meta } from '../types';
import {
  buildMediaFlowProxyExtractorStreamUrl,
  supportsMediaFlowProxy,
} from '../utils';
import { Extractor } from './Extractor';

export class FileMoon extends Extractor {
  public readonly id = 'filemoon';

  public readonly label = 'FileMoon';

  public override viaMediaFlowProxy = true;

  public supports(ctx: Context, url: URL): boolean {
    const supportedDomain = null !== url.host.match(/filemoon/)
      || [
        '1azayf9w.xyz',
        '222i8x.lol',
        '81u6xl9d.xyz',
        '8mhlloqo.fun',
        '96ar.com',
        'bf0skv.org',
        'boosteradx.online',
        'c1z39.com',
        'cinegrab.com',
        'f51rm.com',
        'furher.in',
        'kerapoxy.cc',
        'l1afav.net',
        'moonmov.pro',
        'smdfs40r.skin',
        'xcoic.com',
        'z1ekv717.fun',
      ].includes(url.host);

    return supportedDomain && supportsMediaFlowProxy(ctx);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const headers = { Referer: meta.referer ?? url.href };

    const playlistUrl = await buildMediaFlowProxyExtractorStreamUrl(ctx, this.fetcher, 'FileMoon', url, headers);

    return [
      {
        url: playlistUrl,
        format: Format.hls,
        meta,
      },
    ];
  };
}
