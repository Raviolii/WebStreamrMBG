import winston from 'winston';
import { BlockedReason, Context } from '../types.js';
import { BlockedError } from './BlockedError.js';
import { HttpError } from './HttpError.js';
import { QueueIsFullError } from './QueueIsFullError.js';
import { TimeoutError } from './TimeoutError.js';
import { TooManyRequestsError } from './TooManyRequestsError.js';
import { TooManyTimeoutsError } from './TooManyTimeoutsError.js';

export * from './BlockedError.js';
export * from './HttpError.js';
export * from './NotFoundError.js';
export * from './QueueIsFullError.js';
export * from './TimeoutError.js';
export * from './TooManyRequestsError.js';
export * from './TooManyTimeoutsError.js';

export const logErrorAndReturnNiceString = (ctx: Context, logger: winston.Logger, source: string, error: unknown): string => {
  if (error instanceof BlockedError) {
    if (error.reason === BlockedReason.media_flow_proxy_auth) {
      return '⚠️ MediaFlow Proxy authentication failed. Please set the correct password.';
    }

    // Do not warn to avoid noisy UI logs for blocked hosts (Cloudflare, unknown, etc).
    // Keep debug logs for diagnostics.
    logger.debug(`${source}: Request to ${error.url} was blocked, reason: ${error.reason}, headers: ${JSON.stringify(error.headers)}.`, ctx);

    // Return empty string so callers can decide whether to show anything in the UI.
    return '';
  }

  if (error instanceof TooManyRequestsError) {
    logger.warn(`${source}: Request to ${error.url} was rate limited for ${error.retryAfter} seconds.`, ctx);

    return `🚦 Request to ${error.url.host} was rate-limited. Please try again later or consider self-hosting.`;
  }

  if (error instanceof TooManyTimeoutsError) {
    logger.warn(`${source}: Too many timeouts when requesting ${error.url}.`, ctx);

    return `🚦 Too many recent timeouts when requesting ${error.url.host}. Please try again later.`;
  }

  if (error instanceof TimeoutError) {
    logger.warn(`${source}: Request to ${error.url} timed out.`, ctx);

    return `🐢 Request to ${error.url.host} timed out.`;
  }

  if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) {
    // sometimes this gets through, no idea why..
    logger.warn(`${source}: Request timed out.`, ctx);

    return '🐢 Request timed out.';
  }

  if (error instanceof QueueIsFullError) {
    logger.warn(`${source}: Request queue for ${error.url.host} is full.`, ctx);

    return `⏳ Request queue for ${error.url.host} is full. Please try again later or consider self-hosting.`;
  }

  if (error instanceof HttpError) {
    logger.error(`${source}: Error when requesting url ${error.url}, HTTP status ${error.status} (${error.statusText}), headers: ${JSON.stringify(error.headers)}, stack: ${error.stack}.`, ctx);

    if (error.status >= 500) {
      return `❌ Remote server ${error.url.host} has issues. We can't fix this, please try later again.`;
    }

    return `❌ Request to ${error.url.host} failed with status ${error.status} (${error.statusText}). Request-id: ${ctx.id}.`;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  logger.error(`${source} error: ${error}, cause: ${cause}, stack: ${(error as Error).stack}`, ctx);

  return `❌ Request failed. Request-id: ${ctx.id}.`;
};
