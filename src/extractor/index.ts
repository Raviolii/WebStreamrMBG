import winston from 'winston';
import { envGet, Fetcher } from '../utils/index.js';
import { Byse } from './Byse.js';
import { DoodStream } from './DoodStream.js';
import { Dropload } from './Dropload.js';
import { ExternalUrl } from './ExternalUrl.js';
import { Extractor } from './Extractor.js';
import { Fastream } from './Fastream.js';
import { FileLions } from './FileLions.js';
import { Firestream } from './Firestream.js';
import { Fsst } from './Fsst.js';
import { HBLinks } from './HBLinks.js';
import { HDStream4U } from './HDStream4U.js';
import { HubExtractor } from './HubExtractor.js';
import { KinoGer } from './KinoGer.js';
import { LuluStream } from './LuluStream.js';
import { Mixdrop } from './Mixdrop.js';
import { MovieBox } from './MovieBox.js';
import { SaveFiles } from './SaveFiles.js';
import { StreamEmbed } from './StreamEmbed.js';
import { Streamtape } from './Streamtape.js';
import { SuperVideo } from './SuperVideo.js';
import { Uqload } from './Uqload.js';
import { Vidara } from './Vidara.js';
import { Vidsonic } from './Vidsonic.js';
import { VidSrc } from './VidSrc.js';
import { VidStack } from './VidStack.js';
import { Vidzee } from './Vidzee.js';
import { VixSrc } from './VixSrc.js';
import { Voe } from './Voe.js';
import { YouTube } from './YouTube.js';

export * from './Extractor.js';
export * from './ExtractorRegistry.js';

export const createExtractors = (fetcher: Fetcher, logger: winston.Logger): Extractor[] => {
  const disabledExtractors = envGet('DISABLED_EXTRACTORS')?.split(',') ?? [];

  const hubExtractor = new HubExtractor(fetcher, logger);

  return [
    new DoodStream(fetcher, logger),
    new Dropload(fetcher, logger),
    new Fastream(fetcher, logger),
    new FileLions(fetcher, logger),
    new Fsst(fetcher, logger),
    new HBLinks(fetcher, logger, hubExtractor),
    new HDStream4U(fetcher, logger),
    hubExtractor,
    new KinoGer(fetcher, logger),
    new LuluStream(fetcher, logger),
    new Mixdrop(fetcher, logger),
    new MovieBox(fetcher, logger),
    new SaveFiles(fetcher, logger),
    new StreamEmbed(fetcher, logger),
    new Streamtape(fetcher, logger),
    new SuperVideo(fetcher, logger),
    new Uqload(fetcher, logger),
    new Vidara(fetcher, logger),
    new Vidsonic(fetcher, logger),
    new Byse(fetcher, logger),
    new Firestream(fetcher, logger),
    new VidStack(fetcher, logger),
    new Vidzee(fetcher, logger),
    new VidSrc(fetcher, logger, [ // https://vidsrc.domains/
      'vidsrcme.ru',
      'vidsrcme.su',
      'vidsrc-me.ru',
      'vidsrc-me.su',
      'vsembed.ru',
      'vsembed.su',
      'vsrc.su',
    ]),
    new VixSrc(fetcher, logger),
    new Voe(fetcher, logger),
    new YouTube(fetcher, logger),
    new ExternalUrl(fetcher, logger), // fallback extractor which must come last
  ].filter(extractor => !disabledExtractors.includes(extractor.id));
};
