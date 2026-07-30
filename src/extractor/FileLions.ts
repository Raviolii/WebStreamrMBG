import bytes from 'bytes';
import * as cheerio from 'cheerio';
import { NotFoundError } from '../error/index.js';
import { Context, Format, InternalUrlResult, Meta } from '../types.js';
import { unpackEval } from '../utils/index.js';
import { Extractor } from './Extractor.js';

/** @see https://github.com/Gujal00/ResolveURL/commits/master/script.module.resolveurl/lib/resolveurl/plugins/filelions.py */
export class FileLions extends Extractor {
  public readonly id = 'filelions';

  public readonly label = 'FileLions';

  public override viaMediaFlowProxy = false;

  public supports(_ctx: Context, url: URL): boolean {
    const supportedDomain = null !== url.host.match(/.*lions?/) || [
      '6sfkrspw4u.sbs',
      'ajmidyadfihayh.sbs',
      'alhayabambi.sbs',
      'anime7u.com',
      'azipcdn.com',
      'bingezove.com',
      'callistanise.com',
      'coolciima.online',
      'dhtpre.com',
      'dingtezuni.com',
      'dintezuvio.com',
      'e4xb5c2xnz.sbs',
      'egsyxutd.sbs',
      'fdewsdc.sbs',
      'gsfomqu.sbs',
      'javplaya.com',
      'katomen.online',
      'lumiawatch.top',
      'minochinos.com',
      'mivalyo.com',
      'moflix-stream.click',
      'motvy55.store',
      'movearnpre.com',
      'peytonepre.com',
      'ryderjet.com',
      'smoothpre.com',
      'taylorplayer.com',
      'techradar.ink',
      'videoland.sbs',
      'vidhide.com',
      'vidhide.fun',
      'vidhidefast.com',
      'vidhidehub.com',
      'vidhideplus.com',
      'vidhidepre.com',
      'vidhidepro.com',
      'vidhidevip.com',
    ].includes(url.host);

    return supportedDomain;
  }

  public override normalize(url: URL): URL {
    return new URL(url.href.replace('/v/', '/f/').replace('/download/', '/f/').replace('/file/', '/f/'));
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const headers = { Referer: meta.referer ?? url.href };
    const html = await this.fetcher.text(ctx, url, { headers });

    if (html.includes('This video can be watched as embed only')) {
      return this.extractInternal(ctx, new URL(url.href.replace('/f/', '/v/')), meta);
    }

    if (/File Not Found|deleted by administration/.test(html)) {
      throw new NotFoundError();
    }

    let unpacked = html;
    let sourceMatch = html.match(/(?:file|src|source)\s*[:=]\s*["'](https?:\/\/[^"'\s]+?(?:\.m3u8|\.mp4)[^"'\s]*)["']/i) as RegExpMatchArray | null;

    if (!sourceMatch) {
      try {
        unpacked = unpackEval(html);
      } catch {
        unpacked = html;
      }

      sourceMatch = unpacked.match(/"(https?:\/\/[^"\s]+?(?:\.m3u8|\.mp4)[^"\s]*)"/) as RegExpMatchArray | null;
    }

    if (!sourceMatch) {
      throw new NotFoundError();
    }

    const heightMatch = unpacked.match(/(\d{3,})p/) as RegExpMatchArray | null;
    const streamUrl = new URL(sourceMatch[1] as string);
    const requestHeaders = {
      'Referer': meta.referer ?? url.href,
      'Origin': `${url.protocol}//${url.host}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    };

    const sizeMatch = html.match(/([\d.]+ ?[GM]B)/);
    const $ = cheerio.load(html);
    const title = $('meta[name="description"]').attr('content');
    const height = heightMatch ? parseInt(heightMatch[1] as string) : meta.height;

    return [
      {
        url: streamUrl,
        format: streamUrl.pathname.endsWith('.m3u8') ? Format.hls : Format.mp4,
        requestHeaders,
        meta: {
          ...meta,
          ...(height && { height }),
          ...(sizeMatch && { bytes: bytes.parse(sizeMatch[1] as string) as number }),
          ...(title && { title }),
        },
      },
    ];
  }
}
