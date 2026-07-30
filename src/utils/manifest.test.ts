import winston from 'winston';
import { DoodStream } from '../extractor/DoodStream.js';
import { ExternalUrl } from '../extractor/ExternalUrl.js';
import { SuperVideo } from '../extractor/SuperVideo.js';
import { createSources } from '../source/index.js';
import { MeineCloud } from '../source/MeineCloud.js';
import { VerHdLink } from '../source/VerHdLink.js';
import { VixSrc } from '../source/VixSrc.js';
import { FetcherMock } from './FetcherMock.js';
import { buildManifest } from './manifest.js';

const fetcher = new FetcherMock('/dev/null');
const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });

describe('buildManifest', () => {
  test('default manifest', async () => {
    const manifest = buildManifest(createSources(fetcher), [], {});

    expect(manifest).toMatchSnapshot({
      version: expect.any(String),
    });
  });

  test('has unchecked source without a config', () => {
    const sources = [
      new VixSrc(fetcher),
      new VerHdLink(fetcher),
      new MeineCloud(fetcher),
    ];

    const manifest = buildManifest(sources, [], {});

    expect(manifest.config).toMatchSnapshot();
  });

  test('has checked source with appropriate config', () => {
    const sources = [
      new VerHdLink(fetcher),
      new MeineCloud(fetcher),
    ];
    const manifest = buildManifest(sources, [], { de: 'on', includeExternalUrls: 'on' });

    expect(manifest.config).toMatchSnapshot();
  });

  test('showErrors and includeExternalUrls are unchecked by default', () => {
    const manifest = buildManifest([], [], {});

    expect(manifest.config).toMatchSnapshot();
  });

  test('has checked showErrors', () => {
    const manifest = buildManifest([], [], { showErrors: 'on' });

    expect(manifest.config).toMatchSnapshot();
  });

  test('has checked includeExternalUrls', () => {
    const manifest = buildManifest([], [], { includeExternalUrls: 'on' });

    expect(manifest.config).toMatchSnapshot();
  });

  test('disable extractors', () => {
    const extractors = [
      new DoodStream(fetcher, logger),
      new SuperVideo(fetcher, logger),
      new ExternalUrl(fetcher, logger),
    ];
    const manifest = buildManifest([], extractors, { disableExtractor_doodstream: 'on' });

    expect(manifest.config).toMatchSnapshot();
  });

  test('has checked excludeResolution_2160p', () => {
    const manifest = buildManifest([], [], { excludeResolution_2160p: 'on' });

    expect(manifest.config).toMatchSnapshot();
  });
});
