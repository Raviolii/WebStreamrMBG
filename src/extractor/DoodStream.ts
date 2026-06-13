import bytes from 'bytes';
import * as cheerio from 'cheerio';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { buildMediaFlowProxyExtractorRedirectUrl, supportsMediaFlowProxy } from '../utils';
import { Extractor } from './Extractor';

export class DoodStream extends Extractor {
  public readonly id = 'doodstream';

  public readonly label = 'DoodStream';

  public override readonly ttl: number = 21600000; // 6h

  public override viaMediaFlowProxy = false;

  public supports(ctx: Context, url: URL): boolean {
    return null !== url.host.match(/dood|do[0-9]go|doood|dooood|ds2play|ds2video|dsvplay|d0o0d|do0od|d0000d|d000d|myvidplay|vidply|all3do|doply|vide0|vvide0|d-s/) && supportsMediaFlowProxy(ctx);
  }

  public override normalize(url: URL): URL {
    // Extract the unique video ID from whatever format came in (/e/, /d/, /w/)
    const videoId = url.pathname.replace(/\/+$/, '').split('/').at(-1) as string;

    // Normalize directly to the exact format the oha.to server requires
    return new URL(`https://dood.yt/w/${videoId}`);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    // --- STRATEGY 1: Attempt dynamic oha.to API resolution ---
    try {
      const LOKKE_PING_URL = 'https://www.lokke.app/api/app/ping';
      const OHA_RESOLVE_URL = 'https://oha.to/web-vod/mediaurl-resolve.json';

      const lokkeHandshakePayload = {
        token: 'VKm7XwPbumwb9aeGoVi1fHa6ut1v41a5s6t-yzVQ4qZfN-VwHrdLcD18xPpL4qdzY92xAJiWD_7UZshSngIn_GTbU1uPRTuGFqYQCOBkXzu9YOUPV-u-EbB1WaSZjd6srGhQ',
        reason: 'app-blur', locale: 'de', theme: 'dark',
        metadata: {
          device: { type: 'Handset', brand: 'Apple', model: 'iPhone 12 Pro', name: 'iPhone', uniqueId: '433C3F78-A264-4096-AF20-28BFF3AB4474' },
          os: { name: 'ios', version: '18.7.7', abis: ['ARM64E'], host: 'unknown' },
          app: { platform: 'ios', version: '1.0.2', buildId: '1.0.2', engine: 'jsc', installer: 'TestFlight' },
          version: { package: 'app.lokke.main', binary: '1.0.2', js: '1.0.4' },
        },
        appFocusTime: 0, playerActive: false, playDuration: 0, devMode: true, hasAddon: true, castConnected: false,
        package: 'app.lokke.main', version: '1.0.4', process: 'app',
        firstAppStart: Date.now(), lastAppStart: Date.now(), ipLocation: null, adblockEnabled: true,
        proxy: { supported: ['openvpn'], engine: 'openvpn', enabled: false, autoServer: true, id: 'fi-hel' },
        iap: { supported: true, error: 'No in-app payment subscriptions found' },
      };

      // Removed <{ addonSig?: string }> to resolve TS2558 build failure
      const lokkeRes = await this.fetcher.json(ctx, new URL(LOKKE_PING_URL), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Lokke/1.0.2 (iPhone; CPU iPhone OS 18_7_7 like Mac OS X)'
        },
        body: JSON.stringify(lokkeHandshakePayload)
      }) as any;

      const signature = lokkeRes?.addonSig;
      if (!signature) {
        throw new Error('Failed to retrieve signature from Lokke API.');
      }

      const ohaInputPayload = {
        language: 'de',
        region: 'CH',
        url: url.href,
        clientVersion: '3.0.2'
      };

      // Removed <any> to resolve TS2558 build failure
      const ohaResult = await this.fetcher.json(ctx, new URL(OHA_RESOLVE_URL), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'MediaUrl/2',
          'Accept-Language': 'de-DE,de;q=0.9',
          'mediaurl-signature': signature
        },
        body: JSON.stringify(ohaInputPayload)
      }) as any;

      // Verify response integrity from oha
      if (ohaResult && ohaResult.url && ohaResult.kind !== 'taskRequest') {
        return [
          {
            url: ohaResult.url,
            format: Format.mp4,
            meta: {
              ...meta,
              title: ohaResult.title || 'DoodStream Video'
            }
          }
        ];
      }

      throw new Error('Oha API did not return a direct stream URL.');

    } catch (error) {
      // --- STRATEGY 2: Fallback to MediaFlow Proxy ---
      const videoId = url.pathname.split('/').at(-1) as string;
      const fallbackEmbedUrl = new URL(`https://dood.to/e/${videoId}`);
      const headers = { Referer: meta.referer ?? fallbackEmbedUrl.href };

      const html = await this.fetcher.text(ctx, fallbackEmbedUrl, { headers });

      if (/Video not found/.test(html)) {
        throw new NotFoundError();
      }

      const $ = cheerio.load(html);
      const title = $('title').text().trim().replace(/ - DoodStream$/, '').trim();

      const downloadHtml = await this.fetcher.text(ctx, new URL(fallbackEmbedUrl.href.replace('/e/', '/d/')));
      const sizeMatch = downloadHtml.match(/([\d.]+ ?[GM]B)/);

      return [
        {
          url: buildMediaFlowProxyExtractorRedirectUrl(ctx, 'Doodstream', fallbackEmbedUrl, headers),
          format: Format.mp4,
          meta: {
            ...meta,
            title,
            ...(sizeMatch && { bytes: bytes.parse(sizeMatch[1] as string) as number }),
          },
        },
      ];
    }
  }
}
