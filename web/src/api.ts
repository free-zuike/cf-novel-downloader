import type { SourceMeta, SearchResult, NovelInfo, Chapter, ChapterContent } from './types';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listSources(): Promise<SourceMeta[]> {
  const data = await request<{ sources: SourceMeta[] }>('/api/sources');
  return data.sources;
}

export async function search(source: string, keyword: string): Promise<SearchResult[]> {
  const data = await request<{ results: SearchResult[] }>('/api/search', {
    method: 'POST',
    body: JSON.stringify({ source, keyword }),
  });
  return data.results;
}

export async function getNovel(source: string, novelId: string): Promise<{ info: NovelInfo; chapters: Chapter[] }> {
  return request<{ info: NovelInfo; chapters: Chapter[] }>('/api/novel', {
    method: 'POST',
    body: JSON.stringify({ source, novelId }),
  });
}

export async function getChapter(source: string, novelId: string, chapterId: string): Promise<ChapterContent> {
  const data = await request<{ chapter: ChapterContent }>('/api/chapter', {
    method: 'POST',
    body: JSON.stringify({ source, novelId, chapterId }),
  });
  return data.chapter;
}

export async function downloadNovel(source: string, novelId: string, format: 'txt' | 'epub', title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, novelId, format }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `下载失败: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
