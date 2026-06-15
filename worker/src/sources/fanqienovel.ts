import type { Chapter, ChapterContent, NovelInfo, SearchResult, SourceMeta } from '../types';
import { SourceAdapter, fetchHtml, cleanHtmlTag } from './base';

interface FanqieBook {
  bookId: string;
  bookName: string;
  author: string;
  category?: string;
  abstract?: string;
  thumbUri?: string;
}

export class FanqieNovelSource implements SourceAdapter {
  readonly meta: SourceMeta = {
    id: 'fanqienovel',
    name: '番茄小说',
    description: '从番茄小说首页获取推荐书籍',
    baseUrl: 'https://fanqienovel.com',
  };

  async search(keyword: string): Promise<SearchResult[]> {
    const books = await this.getRecommendation();
    const kw = keyword.trim().toLowerCase();
    if (!kw || kw === ' ') return books.map(this.toSearchResult);

    const filtered = books.filter(b =>
      b.bookName.toLowerCase().includes(kw) ||
      b.author.toLowerCase().includes(kw) ||
      (b.category || '').toLowerCase().includes(kw) ||
      (b.abstract || '').toLowerCase().includes(kw)
    );

    return filtered.length > 0
      ? filtered.map(this.toSearchResult)
      : books.map(this.toSearchResult);
  }

  async getNovel(novelId: string): Promise<{ info: NovelInfo; chapters: Chapter[] }> {
    const books = await this.getRecommendation();
    const book = books.find(b => b.bookId === novelId);
    if (!book) {
      throw new Error(`未找到书籍: ${novelId}`);
    }

    const info: NovelInfo = {
      id: book.bookId,
      title: book.bookName,
      author: book.author,
      description: book.abstract || '来自番茄小说的推荐书籍',
      category: book.category || '',
      cover: book.thumbUri,
      chapterCount: 0,
    };

    const chapters: Chapter[] = [];
    try {
      const html = await this.fetchChapters(book.bookId);
      if (html && html.length > 0) {
        info.chapterCount = chapters.length;
      }
    } catch (e) {
      console.warn(`[fanqie] getChapters failed for ${book.bookName}:`, (e as Error).message);
    }

    return { info, chapters };
  }

  async getChapter(novelId: string, chapterId: string): Promise<ChapterContent> {
    throw new Error('番茄小说章节内容需要在番茄小说APP中阅读');
  }

  private async getRecommendation(): Promise<FanqieBook[]> {
    try {
      const html = await fetchHtml(this.meta.baseUrl + '/');
      const stateMatch = html.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/);
      if (!stateMatch) return [];

      try {
        const state = JSON.parse(stateMatch[1]);
        const home = state?.home || {};
        const books: FanqieBook[] = [];
        const seen = new Set<string>();

        for (const key of ['editorList', 'weekList', 'updateList', 'boyList', 'girlList', 'newbookList']) {
          const list = home[key];
          if (Array.isArray(list)) {
            for (const item of list) {
              if (item && typeof item === 'object') {
                const bid = String(item.bookId || item.book_id || item.id || '');
                if (bid && !seen.has(bid)) {
                  seen.add(bid);
                  books.push({
                    bookId: bid,
                    bookName: String(item.bookName || item.book_name || item.title || '未知书名'),
                    author: String(item.author || item.authorName || ''),
                    category: String(item.category || item.genre || ''),
                    abstract: String(item.abstract || item.description || ''),
                    thumbUri: String(item.thumbUri || item.thumb_url || ''),
                  });
                }
              }
            }
          }
        }

        return books;
      } catch {
        return [];
      }
    } catch (e) {
      console.warn('[fanqie] fetch failed:', (e as Error).message);
      return [];
    }
  }

  private async fetchChapters(bookId: string): Promise<Chapter[]> {
    try {
      const html = await fetchHtml(`${this.meta.baseUrl}/page/${bookId}/`);
      const stateMatch = html.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/);
      if (!stateMatch) return [];

      const state = JSON.parse(stateMatch[1]);
      const page = state?.page || {};
      const chapterList = page.chapterList || page.chapter_list || [];

      if (Array.isArray(chapterList) && chapterList.length > 0) {
        const chapters: Chapter[] = [];
        for (let i = 0; i < chapterList.length; i++) {
          const ch = chapterList[i];
          if (ch && typeof ch === 'object') {
            const title = String(ch.title || ch.chapterTitle || ch.name || `第${i + 1}章`);
            const cid = String(ch.itemId || ch.chapterId || ch.id || String(i));
            chapters.push({ id: cid, title: cleanHtmlTag(title), index: i });
          }
        }
        return chapters;
      }
      return [];
    } catch (e) {
      console.warn('[fanqie] chapters failed:', (e as Error).message);
      return [];
    }
  }

  private toSearchResult(book: FanqieBook): SearchResult {
    return {
      id: book.bookId,
      title: book.bookName,
      author: book.author,
      cover: book.thumbUri,
      category: book.category,
      lastChapter: book.abstract?.slice(0, 50),
    };
  }
}

export const fanqieNovel = new FanqieNovelSource();
