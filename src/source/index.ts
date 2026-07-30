import { envGet, Fetcher } from '../utils/index.js';
import { CineHDPlus } from './CineHDPlus.js';
import { Cuevana } from './Cuevana.js';
// import { Einschalten } from './Einschalten.js';
import { Eurostreaming } from './Eurostreaming.js';
import { FilmpalastTO } from './FilmpalastTO.js';
import { FourKHDHub } from './FourKHDHub.js';
import { Frembed } from './Frembed.js';
import { FrenchCloud } from './FrenchCloud.js';
import { HDHub4u } from './HDHub4u.js';
import { HomeCine } from './HomeCine.js';
import { KinoGer } from './KinoGer.js';
import { Kokoshka } from './Kokoshka.js';
import { MegaKino } from './MegaKino.js';
import { MeineCloud } from './MeineCloud.js';
import { Moflix } from './Moflix.js';
import { MostraGuarda } from './MostraGuarda.js';
import { MovieBox } from './MovieBox.js';
import { Movix } from './Movix.js';
import { OhaTO } from './OhaTo.js';
import { Source } from './Source.js';
import { VerHdLink } from './VerHdLink.js';
import { VidSrc } from './VidSrc.js';
import { Vidzee } from './Vidzee.js';
import { VixSrc } from './VixSrc.js';

export * from './Source.js';

export const createSources = (fetcher: Fetcher): Source[] => {
  const disabledSources = envGet('DISABLED_SOURCES')?.split(',') ?? [];

  return [
    // multi
    new FourKHDHub(fetcher),
    new HDHub4u(fetcher),
    new VixSrc(fetcher),
    new VidSrc(),
    new Vidzee(fetcher),
    new MovieBox(fetcher),
    // AL
    new Kokoshka(fetcher),
    // ES / MX
    new CineHDPlus(fetcher),
    new Cuevana(fetcher),
    new HomeCine(fetcher),
    new VerHdLink(fetcher),
    // DE
    // new Einschalten(fetcher),
    new KinoGer(fetcher),
    new MegaKino(fetcher),
    new MeineCloud(fetcher),
    new FilmpalastTO(fetcher),
    new OhaTO(fetcher),
    new Moflix(fetcher),
    // FR
    new Frembed(fetcher),
    new FrenchCloud(fetcher),
    new Movix(fetcher),
    // IT
    new Eurostreaming(fetcher),
    new MostraGuarda(fetcher),
  ].filter(source => !disabledSources.includes(source.id));
};
