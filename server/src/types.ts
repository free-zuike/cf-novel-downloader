export interface NovelInfo {
  id: string;
  title: string;
  author: string;
  cover?: string;
  description?: string;
  category?: string;
  status?: string;
  lastChapter?: string;
  updateTime?: string;
  chapterCount?: number;
}

export interface Chapter {
  id: string;
  title: string;
  index: number;
}

export interface ChapterContent {
  id: string;
  title: string;
  content: string;
}

export interface SearchResult {
  id: string;
  title: string;
  author: string;
  cover?: string;
  category?: string;
  lastChapter?: string;
}

export interface SourceMeta {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
}

export interface DownloadProgress {
  novelId: string;
  title: string;
  current: number;
  total: number;
  status: 'downloading' | 'completed' | 'error';
  message?: string;
  format: string;
}
