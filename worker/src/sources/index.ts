import type { SourceAdapter, SourceMeta } from './base';
import { fanqieNovel } from './fanqienovel';

const sources: SourceAdapter[] = [fanqieNovel];

export function listSources(): SourceMeta[] {
  return sources.map(s => s.meta);
}

export function getSource(id: string): SourceAdapter {
  const src = sources.find(s => s.meta.id === id);
  if (!src) throw new Error(`未知书源: ${id}`);
  return src;
}

export { SourceAdapter, SourceMeta };
