import { Request, Response, Router } from 'express';
import { Extractor } from '../extractor';
import { Source } from '../source';
import { Config } from '../types';
import { buildManifest, getDefaultConfig, contextFromRequestAndResponse, Fetcher } from '../utils';
import { BlockedError } from '../error';

export class ManifestController {
  public readonly router: Router;

  private readonly sources: Source[];
  private readonly extractors: Extractor[];
  private readonly fetcher: Fetcher;

  public constructor(sources: Source[], extractors: Extractor[], fetcher: Fetcher) {
    this.router = Router();

    this.sources = sources;
    this.extractors = extractors;
    this.fetcher = fetcher;

    this.router.get('/manifest.json', this.getManifest.bind(this));
    this.router.get('/:config/manifest.json', this.getManifest.bind(this));
  }

  private async getManifest(req: Request, res: Response) {
    let config: Config = getDefaultConfig();
    if (req.params['config']) {
      try {
        config = JSON.parse(req.params['config'] as string);
      } catch {
        res.status(400).json({ error: 'Invalid config: malformed JSON' });
        return;
      }
    }

    const ctx = contextFromRequestAndResponse(req, res);

    let visibleSources = this.sources;

    const manifest = buildManifest(visibleSources, this.extractors, config);

    res.setHeader('Content-Type', 'application/json');
    res.send(manifest);
  };
}
