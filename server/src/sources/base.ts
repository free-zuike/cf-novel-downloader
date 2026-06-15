import axios from 'axios';
import * as cheerio from 'cheerio';
import type { NovelInfo, Chapter, ChapterContent, SearchResult, SourceMeta } from '../types';

export abstract class BaseSource {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract baseUrl: string;

  protected http = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    timeout: 15000,
    responseType: 'text',
    decompress: true,
  });

  protected async fetchHtml(url: string): Promise<string> {
    try {
      const res = await this.http.get<string>(url);
      return res.data;
    } catch (err) {
      console.error(`[${this.id}] fetch error: ${url}`, (err as Error).message);
      throw new Error(`请求失败: ${url}`);
    }
  }

  protected loadHtml(html: string) {
    return cheerio.load(html);
  }

  getMeta(): SourceMeta {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      baseUrl: this.baseUrl,
    };
  }

  abstract search(keyword: string): Promise<SearchResult[]>;
  abstract getNovel(novelId: string): Promise<{ info: NovelInfo; chapters: Chapter[] }>;
  abstract getChapter(novelId: string, chapterId: string): Promise<ChapterContent>;

  protected sanitize(text: string): string {
    if (!text) return '';
    return text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }
}
