import { Mutex } from 'async-mutex';
import bytes from 'bytes';
import { ContentType, Stream } from 'stremio-addon-sdk';
import winston from 'winston';
import { logErrorAndReturnNiceString, BlockedError } from '../error';
import { ExtractorRegistry } from '../extractor';
import { Source } from '../source';
import { Context, CountryCode, Format, UrlResult } from '../types';
import { isResolutionExcluded, showErrors, showExternalUrls } from './config';
import { envGetAppName } from './env';
import { Id } from './id';
import { flagFromCountryCode } from './language';
import { getClosestResolution } from './resolution';
import { parseQualityFromUrl, qualityLabelFromUrl } from './quality';

interface ResolveResponse {
  streams: Stream[];
  ttl?: number;
}

export class StreamResolver {
  private readonly logger: winston.Logger;
  private readonly extractorRegistry: ExtractorRegistry;

  public constructor(logger: winston.Logger, extractorRegistry: ExtractorRegistry) {
    this.logger = logger;
    this.extractorRegistry = extractorRegistry;
  }

  public async resolve(ctx: Context, sources: Source[], type: ContentType, id: Id): Promise<ResolveResponse> {
    if (sources.length === 0) {
      return {
        streams: [
          {
            name: 'WebStreamrMBG',
            title: '⚠️ No sources found. Please re-configure the plugin.',
            externalUrl: ctx.hostUrl.href,
          },
        ],
      };
    }

    const streams: Stream[] = [];

    let sourceErrorCount = 0;
    const sourceErrorCountMutex = new Mutex();

    const urlResults: UrlResult[] = [];

    // Infer quality/height from the URL when metadata is missing
    const inferQualityFromUrlIfMissing = (ur: UrlResult) => {
      if (!ur.meta) ur.meta = {};
      if (!ur.meta.height) {
        const inferred = parseQualityFromUrl(ur.url);
        if (inferred) ur.meta.height = inferred;
      }
      if (!ur.meta.quality) {
        const qLabel = qualityLabelFromUrl(ur.url);
        if (qLabel) ur.meta.quality = qLabel;
      }
    };

    const urlResultsCountByCountryCode = new Map<CountryCode, number>();
    const urlResultsCountByCountryCodeMutex = new Mutex();

    const skippedFallbackSources: Source[] = [];

    const handleSource = async (source: Source, countUrlResultsByCountryCode: boolean) => {
      try {
        const sourceResults = await source.handle(ctx, type, id);
        this.logger.info(`Source ${source.id} returned ${sourceResults.length} results`, ctx);
        for (const sr of sourceResults) {
          this.logger.info(`Source ${source.id} URL: ${sr.url}`, ctx);
        }
        const sourceUrlResults = await Promise.all(
          sourceResults.map(({ url, meta }) => this.extractorRegistry.handle(ctx, url, { sourceLabel: source.label, sourceId: source.id, priority: source.priority, ...meta }, true)),
        );

        for (const urlResult of sourceUrlResults.flat()) {
          urlResults.push(urlResult);

          if (urlResult.error || !countUrlResultsByCountryCode) {
            continue;
          }

          await urlResultsCountByCountryCodeMutex.runExclusive(() => {
            urlResult.meta?.countryCodes?.forEach((countryCode) => {
              urlResultsCountByCountryCode.set(countryCode, (urlResultsCountByCountryCode.get(countryCode) ?? 0) + 1);
            });
          });
        }
      } catch (error) {
        await sourceErrorCountMutex.runExclusive(() => {
          sourceErrorCount++;
        });

        // Do not show BlockedError entries in the UI even when showErrors is enabled
        if (error instanceof BlockedError) {
          // log at debug level to keep diagnostics but avoid UI noise
          this.logger.debug(`${source.id}: blocked (${(error as BlockedError).reason}) — suppressed from UI`, ctx);
        } else if (showErrors(ctx.config)) {
          streams.push({
            name: envGetAppName(),
            title: [`🔗 ${source.label}`, logErrorAndReturnNiceString(ctx, this.logger, source.id, error)].join('\n'),
            externalUrl: source.baseUrl,
          });
        }
      }
    };

    // Resolve non-fallback sources in parallel extracting all their results
    const sourcePromises = sources.map(async (source) => {
      if (!source.contentTypes.includes(type)) {
        return;
      }

      if (source.useOnlyWithMaxUrlsFound !== undefined) {
        skippedFallbackSources.push(source);
        return;
      }

      await handleSource(source, true);
    });
    await Promise.all(sourcePromises);

    // Resolve fallback sources if we didn't get enough results already
    const skippedFallbackSourcePromises = skippedFallbackSources.map(async (skippedFallbackSource) => {
      const resultCount = urlResults.reduce((accumulator, urlResult) => accumulator + Number(this.arraysIntersect(skippedFallbackSource.countryCodes, /* istanbul ignore next */ urlResult.meta?.countryCodes ?? [])), 0);
      if (resultCount > (skippedFallbackSource.useOnlyWithMaxUrlsFound as number)) {
        return;
      }

      await handleSource(skippedFallbackSource, false);
    });
    await Promise.all(skippedFallbackSourcePromises);

    // Run inference on collected url results
    urlResults.forEach(inferQualityFromUrlIfMissing);

    urlResults.sort((a, b) => {
      if (a.error || b.error) {
        return a.error ? -1 : 1;
      }

      if (a.isExternal || b.isExternal) {
        return a.isExternal ? 1 : -1;
      }

      const parseQualityToHeight = (q?: string, h?: number) => {
        if (q) {
          const m = q.match(/(\d{3,4})/);
          if (m) return Number(m[1]);
          const ql = q.toLowerCase();
          if (ql.includes('4k') || ql.includes('2160')) return 2160;
          if (ql.includes('1440')) return 1440;
          if (ql.includes('1080') || ql.includes('fhd') || ql === 'hd') return 1080;
          if (ql.includes('720')) return 720;
          if (ql.includes('480') || ql === 'sd') return 480;
        }

        return h ?? 0;
      };

      const qualityComparison = parseQualityToHeight(b.meta?.quality, b.meta?.height) - parseQualityToHeight(a.meta?.quality, a.meta?.height);
      if (qualityComparison !== 0) {
        return qualityComparison;
      }

      const heightComparison = (b.meta?.height ?? 0) - (a.meta?.height ?? 0);
      if (heightComparison !== 0) {
        return heightComparison;
      }

      const bytesComparison = (b.meta?.bytes ?? 0) - (a.meta?.bytes ?? 0);
      if (bytesComparison !== 0) {
        return bytesComparison;
      }

      const priorityComparison = (b.meta?.priority ?? 0) - (a.meta?.priority ?? 0);
      if (priorityComparison !== 0) {
        return priorityComparison;
      }

      return a.label.localeCompare(b.label);
    });

    const errorCount = urlResults.reduce((count, urlResult) => urlResult.error ? count + 1 : count, sourceErrorCount);
    this.logger.info(`Got ${urlResults.length} url results, including ${errorCount} errors`, ctx);

    streams.push(
      ...urlResults.filter(urlResult => {
        // Always hide blocked results (e.g. Cloudflare challenge, unknown) from app display
        if (urlResult.error instanceof BlockedError) {
          return false;
        }

        return (!urlResult.error || showErrors(ctx.config)) && !isResolutionExcluded(ctx.config, getClosestResolution(urlResult.meta?.height));
      })
        .filter((urlResult, index, self) =>
          // Remove duplicate URLs
          index === self.findIndex(t => t.url.href === urlResult.url.href),
        )
        .map(urlResult => ({
          ...this.buildUrl(urlResult),
          name: this.buildName(ctx, urlResult),
          title: this.buildTitle(ctx, urlResult),
          behaviorHints: {
            bingeGroup: `webstreamr-mbg-${urlResult.meta?.sourceId}-${urlResult.meta?.extractorId}-${urlResult.meta?.countryCodes?.join('_')}`,
            ...(urlResult.format !== Format.mp4 && urlResult.notWebReady !== false && { notWebReady: true }),
            ...(urlResult.requestHeaders !== undefined && {
              notWebReady: true,
              proxyHeaders: { request: urlResult.requestHeaders },
            }),
            ...(urlResult.meta?.bytes && { videoSize: urlResult.meta.bytes }),
          },
        })),
    );

    const ttl = sourceErrorCount === 0 ? this.determineTtl(urlResults) : undefined;

    return {
      streams,
      ...(ttl && { ttl }),
    };
  };

  private arraysIntersect<T>(arr1: T[], arr2: T[]): boolean {
    return arr1.filter(item => arr2.includes(item)).length > 0;
  }

  private determineTtl(urlResults: UrlResult[]): number | undefined {
    if (!urlResults.length) {
      return 900000; // 15m
    }

    return Math.min(...urlResults.map(urlResult => urlResult.ttl as number));
  };

  private buildUrl(urlResult: UrlResult): { externalUrl: string } | { url: string } | { ytId: string } {
    /* istanbul ignore if */
    if (urlResult.ytId) {
      return { ytId: urlResult.ytId };
    }

    if (!urlResult.isExternal) {
      return { url: urlResult.url.href };
    }

    return { externalUrl: urlResult.url.href };
  };

  private buildName(ctx: Context, urlResult: UrlResult): string {
    const lines: string[] = [envGetAppName()];

    const flags = urlResult.meta?.countryCodes?.map(cc => flagFromCountryCode(cc)).join(' ');
    if (flags) lines.push(flags);

    if (urlResult.meta?.height) {
      lines.push(getClosestResolution(urlResult.meta.height));
    }

    // Prefer explicit quality label if provided (e.g. "720p", "HD")
    if (urlResult.meta?.quality) {
      lines.push(urlResult.meta.quality);
    }

    // Show language code when available (e.g. "de", "en")
    if (urlResult.meta?.language) {
      lines.push(urlResult.meta.language);
    }

    if (urlResult.isExternal && showExternalUrls(ctx.config)) {
      lines.push('⚠️ external');
    }

    return lines.join('\n');
  };

  private buildTitle(ctx: Context, urlResult: UrlResult): string {
    const titleLines = [];

    if (urlResult.meta?.title) {
      titleLines.push(urlResult.meta.title);
    }

    if (urlResult.meta?.bytes) {
      titleLines.push(`💾 ${bytes.format(urlResult.meta.bytes, { unitSeparator: ' ' })}`);
    }
    const sourceLabel = urlResult.meta?.sourceLabel;
    if (sourceLabel && sourceLabel !== urlResult.label) {
      titleLines.push(`🔗 ${urlResult.label} from ${urlResult.meta?.sourceLabel}`);
    } else {
      titleLines.push(`🔗 ${urlResult.label}`);
    }

    if (urlResult.error) {
      const errorMsg = logErrorAndReturnNiceString(ctx, this.logger, urlResult.meta?.sourceId ?? '', urlResult.error);
      if (errorMsg) titleLines.push(errorMsg);
    }

    return titleLines.join('\n');
  };
}
