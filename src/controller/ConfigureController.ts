import { Request, Response, Router } from 'express';
import { Extractor } from '../extractor';
import { landingTemplate } from '../landingTemplate';
import { Source } from '../source';
import { Config } from '../types';
import { buildManifest, getDefaultConfig, isElfHostedInstance, contextFromRequestAndResponse, Fetcher } from '../utils';
import { BlockedError } from '../error';

export class ConfigureController {
  public readonly router: Router;

  private readonly sources: Source[];
  private readonly extractors: Extractor[];
  private readonly fetcher: Fetcher;

  public constructor(sources: Source[], extractors: Extractor[], fetcher: Fetcher) {
    this.router = Router();

    this.sources = sources;
    this.extractors = extractors;
    this.fetcher = fetcher;

    this.router.get('/configure', this.getConfigure.bind(this));
    this.router.get('/:config/configure', this.getConfigure.bind(this));
  }

  private async getConfigure(req: Request, res: Response) {
    let config: Config = getDefaultConfig();
    if (req.params['config']) {
      try {
        config = JSON.parse(req.params['config'] as string);
      } catch {
        res.status(400).json({ error: 'Invalid config: malformed JSON' });
        return;
      }
    }

    // Convenience preset for ElfHosted WebStreamrMBG bundle including Media Flow Proxy
    if (!req.params['config'] && isElfHostedInstance(req)) {
      config.mediaFlowProxyUrl = `${req.protocol}://${req.host.replace('webstreamr-mbg', 'mediaflow-proxy')}`;
    }

    const ctx = contextFromRequestAndResponse(req, res);

    let visibleSources = this.sources;

    const manifest = buildManifest(visibleSources, this.extractors, config);

    res.setHeader('content-type', 'text/html');
    res.send(landingTemplate(manifest));
  };
}
