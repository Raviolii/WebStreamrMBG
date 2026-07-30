import { Context } from '../../types.js';
import { Fetcher } from '../Fetcher.js';
import { getImdbIdFromTmdbId, getTmdbIdFromImdbId } from '../tmdb.js';
import { ImdbId } from './ImdbId.js';
import { TmdbId } from './TmdbId.js';

export * from './ImdbId.js';
export * from './TmdbId.js';

export type Id = ImdbId | TmdbId;

export const getImdbId = async (ctx: Context, fetcher: Fetcher, id: Id): Promise<ImdbId> => {
  if (id instanceof TmdbId) {
    return await getImdbIdFromTmdbId(ctx, fetcher, id);
  }

  return id;
};

export const getTmdbId = async (ctx: Context, fetcher: Fetcher, id: Id): Promise<TmdbId> => {
  if (id instanceof ImdbId) {
    return await getTmdbIdFromImdbId(ctx, fetcher, id);
  }

  return id;
};
