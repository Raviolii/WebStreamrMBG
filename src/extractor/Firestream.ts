import * as cheerio from 'cheerio';
import winston from 'winston';
import { NotFoundError } from '../error/index.js';
import { Context, Format, InternalUrlResult, Meta } from '../types.js';
import { Fetcher } from '../utils/index.js';
import { Extractor } from './Extractor.js';

export class Firestream extends Extractor {
  public readonly id = 'firestream';

  public readonly label = 'Firestream';

  private readonly mainUrl = 'https://firestream.to';
  private readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

  public constructor(fetcher: Fetcher, logger: winston.Logger) {
    super(fetcher, logger);
  }

  public supports(_ctx: Context, url: URL): boolean {
    return null !== url.host.match(/firestream\.to/);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const pathParts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    const id = pathParts.pop();
    if (!id) {
      throw new NotFoundError();
    }

    const pageUrl = this.getExtractorUrl(id);
    const html = await this.fetcher.text(ctx, pageUrl, {
      headers: {
        'User-Agent': this.UA,
        'Referer': this.mainUrl,
      },
    });

    const $ = cheerio.load(html);
    const token = $('script#token-blob').html();
    if (!token) {
      throw new NotFoundError();
    }

    const response = await this.fetcher.json(ctx, new URL(`${this.mainUrl}/api/videos/${id}/resolve`), {
      method: 'POST',
      headers: {
        'User-Agent': this.UA,
        'Referer': pageUrl.href,
        'Content-Type': 'application/json',
      },
      data: { blob: token },
    });

    if (!response?.signedVideoUrl || typeof response.signedVideoUrl !== 'string') {
      throw new NotFoundError();
    }

    const videoUrl = new URL(response.signedVideoUrl);
    const format = videoUrl.pathname.endsWith('.m3u8') ? Format.hls : Format.mp4;

    return [
      {
        url: videoUrl,
        format,
        label: this.label,
        meta,
      },
    ];
  }

  private getExtractorUrl(id: string): URL {
    return new URL(`${this.mainUrl}/e/${id}`);
  }
}
