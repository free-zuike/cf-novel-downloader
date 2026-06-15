import { BaseSource } from './base';
import type { NovelInfo, Chapter, ChapterContent, SearchResult } from '../types';

export class BiqugeSource extends BaseSource {
  id = 'biquge';
  name = '笔趣阁';
  description = '通用笔趣阁书源';
  baseUrl = 'https://www.bqg101.com';

  async search(keyword: string): Promise<SearchResult[]> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(keyword)}`;
    const html = await this.fetchHtml(url);
    const $ = this.loadHtml(html);

    const results: SearchResult[] = [];
    const links = $.findAll('a');

    for (const link of links) {
      const href = (link as any).value || (link as any).href || '';
      const title = link.text?.trim() || '';

      if (title && title.length < 50 && href.includes('/book/') && results.length < 20) {
        const idMatch = href.match(/\/book\/(\d+)/);
        const id = idMatch ? idMatch[1] : '';

        if (id && !results.some(r => r.id === id)) {
          results.push({
            id,
            title,
            author: '未知',
            lastChapter: '',
          });
        }
      }
    }

    return results;
  }

  async getNovel(novelId: string): Promise<{ info: NovelInfo; chapters: Chapter[] }> {
    const url = `${this.baseUrl}/book/${novelId}/`;
    const html = await this.fetchHtml(url);
    const $ = this.loadHtml(html);

    const title = $.getText('h1') || novelId;
    const authorText = $.getText('p') || '';
    const author = authorText.replace(/作.*者[:：]/, '').trim() || '未知';

    const descriptionEl = $.querySelector('#intro');
    const description = descriptionEl ? (descriptionEl as any).text?.replace(/展开全部/, '').trim() || '' : '';

    const links = $.findAll('a');
    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    for (const link of links) {
      const href = (link as any).value || (link as any).href || '';
      const text = link.text?.trim() || '';

      if (!text || !href || !href.endsWith('.html')) continue;

      const idMatch = href.match(/\/(\d+)\.html/);
      const chapterId = idMatch ? idMatch[1] : href;

      if (seen.has(chapterId)) continue;
      seen.add(chapterId);

      chapters.push({
        id: chapterId,
        title: text,
        index: chapters.length,
      });
    }

    return {
      info: {
        id: novelId,
        title,
        author,
        description,
        lastChapter: chapters[chapters.length - 1]?.title || '',
        chapterCount: chapters.length,
      },
      chapters,
    };
  }

  async getChapter(novelId: string, chapterId: string): Promise<ChapterContent> {
    const url = `${this.baseUrl}/book/${novelId}/${chapterId}.html`;
    const html = await this.fetchHtml(url);
    const $ = this.loadHtml(html);

    const title = $.getText('h1') || chapterId;
    const contentEl = $.querySelector('#content');
    const rawContent = contentEl ? (contentEl as any).text || '' : $.text();

    const content = rawContent
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      id: chapterId,
      title,
      content,
    };
  }
}
