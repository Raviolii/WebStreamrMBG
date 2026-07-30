import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types.js';
import { Id } from '../utils/index.js';
import { Source, SourceResult } from './Source.js';

export class VidSrc extends Source {
  public readonly id = 'vidsrc';

  public readonly label = 'VidSrc';

  public readonly contentTypes: ContentType[] = ['movie', 'series'];

  public readonly countryCodes: CountryCode[] = [CountryCode.multi];

  public readonly baseUrl = 'https://vidsrcme.ru';

  public async handleInternal(_ctx: Context, _type: string, id: Id): Promise<SourceResult[]> {
    const url = id.season
      ? new URL(`/embed/tv/${id.id}/${id.season}-${id.episode}`, this.baseUrl)
      : new URL(`/embed/movie/${id.id}`, this.baseUrl);

    return [{ url, meta: { countryCodes: [CountryCode.multi] } }];
  };
}
