export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  AI: Ai;
}

export interface Task {
  id: string;
  novel_id: string;
  novel_title: string;
  source: string;
  format: 'txt' | 'epub';
  status: 'pending' | 'downloading' | 'completed' | 'error';
  current: number;
  total: number;
  file_key: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

export interface NovelCache {
  id: string;
  source: string;
  title: string;
  author: string;
  cover?: string;
  description?: string;
  last_chapter?: string;
  chapter_count?: number;
  data: string;
  created_at: number;
  updated_at: number;
}

export interface Chapter {
  id: string;
  title: string;
  index: number;
}

export interface NovelInfo {
  id: string;
  title: string;
  author: string;
  cover?: string;
  description?: string;
  lastChapter?: string;
  chapterCount?: number;
  category?: string;
  status?: string;
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

export interface ChapterContent {
  id: string;
  title: string;
  content: string;
}

export interface TaskStatus {
  id: string;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  current: number;
  total: number;
  fileKey: string | null;
  downloadUrl: string | null;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
}
