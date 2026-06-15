import type { Chapter, ChapterContent, NovelInfo, SearchResult, SourceMeta } from '../types';
import { SourceAdapter, fetchHtml, cleanHtmlTag, extractText } from './base';

interface FanqieBook {
  bookId: string;
  bookName: string;
  author: string;
  category?: string;
  abstract?: string;
  thumbUri?: string;
}

interface ApiChapter {
  item_id?: string;
  itemId?: string;
  title?: string;
  chapterTitle?: string;
  volume_name?: string;
  volumeName?: string;
  chapter_word_number?: number;
  first_pass_time?: number;
}

const PROXY_NODES = [
  'http://apifq.jingluo.love',
  'http://hwfq.jingluo.love',
  'http://fan.jingluo.love',
];

const FANQIE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

async function fetchApiJson(url: string): Promise<any | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: FANQIE_HEADERS });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.startsWith('Forwarding') || text.startsWith('<!DOCTYPE')) continue;
      if (text.startsWith('{') || text.startsWith('[')) {
        return JSON.parse(text);
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function fetchFromProxies(path: string): Promise<any | null> {
  for (const node of PROXY_NODES) {
    const result = await fetchApiJson(node + path);
    if (result !== null) return result;
  }
  return null;
}

function parseInitialState(html: string): any | null {
  const match = html.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\n\s*\})/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export class FanqieNovelSource implements SourceAdapter {
  readonly meta: SourceMeta = {
    id: 'fanqienovel',
    name: '番茄小说',
    description: '番茄小说多节点代理源（基于 jingluo.love 转发节点，支持搜索、书籍详情、章节列表及正文）',
    baseUrl: 'https://fanqienovel.com',
  };

  async search(keyword: string): Promise<SearchResult[]> {
    const kw = keyword.trim();

    // 优先尝试代理节点的搜索API
    if (kw) {
      try {
        const result = await fetchFromProxies(`/search?query=${encodeURIComponent(kw)}&offset=0`);
        if (result && (result.data || result.search_tabs)) {
          const books: any[] = [];
          if (result.search_tabs && Array.isArray(result.search_tabs)) {
            for (const tab of result.search_tabs) {
              if (tab.tab_type === 3 && Array.isArray(tab.data)) {
                for (const w of tab.data) {
                  if (w.book_data && w.book_data[0]) books.push(w.book_data[0]);
                }
              }
            }
          } else if (Array.isArray(result.data)) {
            for (const item of result.data) {
              if (item && typeof item === 'object') {
                if (item.book_data && item.book_data[0]) books.push(item.book_data[0]);
                else books.push(item);
              }
            }
          }

          if (books.length > 0) {
            return books.slice(0, 30).map((b: any) => ({
              id: String(b.book_id || b.bookId || b.id || ''),
              title: cleanHtmlTag(String(b.book_name || b.bookName || b.title || '未知书名')),
              author: String(b.author || ''),
              cover: String(b.thumb_url || b.thumbUri || ''),
              category: String(b.category || b.genre || ''),
              lastChapter: String(b.last_chapter_title || b.abstract || '').slice(0, 80),
            }));
          }
        }
      } catch (e) {
        console.warn('[fanqie] proxy search failed:', (e as Error).message);
      }
    }

    // 回退: 从首页获取推荐书籍并本地过滤
    try {
      const books = await this.getHomePageBooks();
      if (!kw) return books.map(this.toSearchResult);

      const kwLower = kw.toLowerCase();
      const filtered = books.filter(b =>
        b.bookName.toLowerCase().includes(kwLower) ||
        b.author.toLowerCase().includes(kwLower) ||
        (b.abstract || '').toLowerCase().includes(kwLower)
      );

      return (filtered.length > 0 ? filtered : books).map(this.toSearchResult);
    } catch (e) {
      console.warn('[fanqie] homepage fallback failed:', (e as Error).message);
      return [];
    }
  }

  async getNovel(novelId: string): Promise<{ info: NovelInfo; chapters: Chapter[] }> {
    // 优先代理节点 catalog API
    let chapters: Chapter[] = [];
    let info: NovelInfo | null = null;

    try {
      const result = await fetchFromProxies(`/catalog?book_id=${novelId}`);
      if (result && result.data && Array.isArray(result.data.item_data_list) && result.data.item_data_list.length > 0) {
        const list: ApiChapter[] = result.data.item_data_list;
        chapters = list.map((ch: ApiChapter, i: number) => ({
          id: String(ch.item_id || ch.itemId || i),
          title: cleanHtmlTag(String(ch.title || ch.chapterTitle || `第${i + 1}章`)),
          index: i,
        }));
      }
    } catch (e) {
      console.warn('[fanqie] proxy catalog failed:', (e as Error).message);
    }

    // 从 detail API 获取书籍信息
    try {
      const detailResult = await fetchFromProxies(`/detail?book_id=${novelId}`);
      if (detailResult && detailResult.data && typeof detailResult.data === 'object') {
        const d: any = detailResult.data;
        info = {
          id: novelId,
          title: cleanHtmlTag(String(d.book_name || d.bookName || '未知书名')),
          author: String(d.author || ''),
          description: String(d.abstract || d.description || ''),
          category: String(d.category || d.genre || ''),
          cover: String(d.thumb_url || d.thumbUri || ''),
          chapterCount: chapters.length,
        };
      }
    } catch (e) {
      console.warn('[fanqie] proxy detail failed:', (e as Error).message);
    }

    // 如果代理返回空章节, 尝试从书籍详情页获取章节
    if (chapters.length === 0) {
      try {
        const html = await fetchHtml(`https://fanqienovel.com/page/${novelId}/`);
        const state = parseInitialState(html);
        const page = state?.page || {};
        const chapterList = page.chapterList || page.chapter_list || [];

        if (Array.isArray(chapterList) && chapterList.length > 0) {
          chapters = chapterList.map((ch: any, i: number) => ({
            id: String(ch.itemId || ch.item_id || ch.chapterId || i),
            title: cleanHtmlTag(String(ch.title || ch.chapterTitle || `第${i + 1}章`)),
            index: i,
          }));
        }

        // 从page提取书籍信息
        if (!info && page) {
          const title = page.bookName || page.book_name || '';
          if (title) {
            info = {
              id: novelId,
              title: cleanHtmlTag(title),
              author: String(page.author || ''),
              description: String(page.abstract || page.description || '来自番茄小说的书籍'),
              category: String(page.category || page.genre || ''),
              cover: String(page.thumbUri || page.thumb_url || ''),
              chapterCount: chapters.length,
            };
          }
        }
      } catch (e) {
        console.warn('[fanqie] page fallback failed:', (e as Error).message);
      }
    }

    // 终极回退: 从首页推荐列表查找书籍信息
    if (!info) {
      const books = await this.getHomePageBooks();
      const book = books.find(b => b.bookId === novelId);
      if (book) {
        info = {
          id: book.bookId,
          title: book.bookName,
          author: book.author,
          description: book.abstract || '来自番茄小说的推荐书籍',
          category: book.category || '',
          cover: book.thumbUri,
          chapterCount: chapters.length,
        };
      } else {
        info = {
          id: novelId,
          title: '番茄小说书籍',
          author: '未知',
          description: '该书籍信息需要在番茄小说APP中查看',
          category: '',
          chapterCount: 0,
        };
      }
    }

    return { info, chapters };
  }

  async getChapter(novelId: string, chapterId: string): Promise<ChapterContent> {
    // 优先通过代理节点获取正文
    try {
      const result = await fetchFromProxies(`/content?item_id=${chapterId}`);
      if (result && result.data && typeof result.data.content === 'string') {
        const content = String(result.data.content);
        return {
          id: chapterId,
          novelId,
          title: String(result.data.title || ''),
          content: extractText(content),
        };
      }
    } catch (e) {
      console.warn('[fanqie] proxy content failed:', (e as Error).message);
    }

    // 回退: 尝试访问章节页面
    throw new Error('章节内容暂时无法获取，请稍后重试或在番茄小说APP中阅读');
  }

  private async getHomePageBooks(): Promise<FanqieBook[]> {
    try {
      const html = await fetchHtml('https://fanqienovel.com/');
      const state = parseInitialState(html);
      const home = state?.home || {};
      const books: FanqieBook[] = [];
      const seen = new Set<string>();

      for (const key of ['editorList', 'weekList', 'updateList', 'boyList', 'girlList', 'newbookList', 'readRankList']) {
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
    } catch (e) {
      console.warn('[fanqie] homepage fetch failed:', (e as Error).message);
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
      lastChapter: book.abstract?.slice(0, 80),
    };
  }
}

export const fanqieNovel = new FanqieNovelSource();
