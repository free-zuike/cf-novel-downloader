import { BaseSource } from './base';
import { BiqugeSource } from './biquge';
import { Biquge5200Source } from './biquge5200';
import type { SourceMeta } from '../types';

const sources: Record<string, BaseSource> = {
  biquge: new BiqugeSource(),
  biquge5200: new Biquge5200Source(),
};

export function getSource(sourceId: string): BaseSource {
  const source = sources[sourceId];
  if (!source) {
    throw new Error(`未知书源: ${sourceId}`);
  }
  return source;
}

export function listSources(): SourceMeta[] {
  return Object.values(sources).map((s) => s.getMeta());
}

export function registerSource(id: string, source: BaseSource) {
  sources[id] = source;
}

export { BaseSource, BiqugeSource, Biquge5200Source };
