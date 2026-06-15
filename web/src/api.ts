import type { SourceMeta, SearchResult, NovelInfo, Chapter, ChapterContent, TaskStatus } from './types';

const API_BASE = '';

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

export async function getNovel(source: string, novelId: string): Promise<{ info: NovelInfo; chapters: Chapter[]; cached?: boolean }> {
  return request<{ info: NovelInfo; chapters: Chapter[]; cached?: boolean }>('/api/novel', {
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

// Create async download task
export async function createDownloadTask(source: string, novelId: string, format: 'txt' | 'epub'): Promise<{ taskId: string; status: string; title: string; total: number }> {
  return request<{ taskId: string; status: string; title: string; total: number }>('/api/download', {
    method: 'POST',
    body: JSON.stringify({ source, novelId, format }),
  });
}

// Poll task status
export async function getTaskStatus(taskId: string): Promise<{ task: TaskStatus }> {
  return request<{ task: TaskStatus }>(`/api/task/${taskId}`);
}

// Get download URL for completed task
export async function getDownloadUrl(taskId: string): Promise<string | null> {
  const res = await fetch(`/api/download/${taskId}`);
  if (res.ok) {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return url;
  }
  return null;
}

// Legacy direct download (for small files)
export async function downloadDirect(source: string, novelId: string, format: 'txt' | 'epub', title: string): Promise<void> {
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
