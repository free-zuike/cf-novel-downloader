import { BaseSource } from './base';
import type { NovelInfo, Chapter, ChapterContent, SearchResult } from '../types';

export class Biquge5200Source extends BaseSource {
  id = 'biquge5200';
  name = '笔趣阁5200';
  description = '笔趣阁5200书源';
  baseUrl = 'https://www.bq5200.cc';

  async search(keyword: string): Promise<SearchResult[]> {
    const url = `${this.baseUrl}/searchbook.php?keyword=${encodeURIComponent(keyword)}`;
    const html = await this.fetchHtml(url);
    const $ = this.loadHtml(html);

    const results: SearchResult[] = [];
    const links = $.findAll('a');

    for (const link of links) {
      const href = (link as any).value || '';
      const title = link.text?.trim() || '';

      if (title && title.length < 50 && href.match(/\/\d+\/?$/) && results.length < 20) {
        const idMatch = href.match(/\/(\d+)/);
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
    const url = `${this.baseUrl}/${novelId}/`;
    const html = await this.fetchHtml(url);
    const $ = this.loadHtml(html);

    const title = $.getText('h1') || novelId;
    const info = $.getText('#info p') || '';
    const author = info.replace(/作.*者[:：]/, '').trim() || '未知';

    const description = $.getText('#intro') || '';

    const links = $.findAll('a');
    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    for (const link of links) {
      const href = (link as any).value || '';
      const text = link.text?.trim() || '';

      if (!text || !href || !href.includes('.html')) continue;

      const idMatch = href.match(/(\d+)\.html/);
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
    const url = `${this.baseUrl}/${novelId}/${chapterId}.html`;
    const html = await this.fetchHtml(url);
    const $ = this.loadHtml(html);

    const title = $.getText('h1') || chapterId;
    const contentEl = $.querySelector('#content, #chaptercontent');
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
