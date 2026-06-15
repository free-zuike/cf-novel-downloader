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

    $('.listbox li, .booklist .item, .search-result a').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('a').first();
      const title = $link.text().trim();
      const href = $link.attr('href') || '';

      if (title && href) {
        const idMatch = href.match(/\/(\d+)\/?/);
        results.push({
          id: idMatch ? idMatch[1] : href,
          title,
          author: $el.find('.author, p').last().text().replace(/作.*者[:：]/, '').trim() || '未知',
          cover: $el.find('img').attr('src') || undefined,
          category: '',
          lastChapter: '',
        });
      }
    });

    return results;
  }

  async getNovel(novelId: string): Promise<{ info: NovelInfo; chapters: Chapter[] }> {
    const url = `${this.baseUrl}/${novelId}/`;
    const html = await this.fetchHtml(url);
    const $ = this.loadHtml(html);

    const title = $('h1').first().text().trim() || novelId;
    const author = $('#info p').first().text().replace(/作.*者[:：]/, '').trim() || '未知';
    const cover = $('#fmimg img').attr('src') || '';
    const description = $('#intro').text().trim();

    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    $('#list dd a, .chapter-list a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const text = $el.text().trim();

      if (!text || !href || !href.includes('.html')) return;

      const idMatch = href.match(/(\d+)\.html/);
      const chapterId = idMatch ? idMatch[1] : href;

      if (seen.has(chapterId)) return;
      seen.add(chapterId);

      chapters.push({
        id: chapterId,
        title: text,
        index: chapters.length,
      });
    });

    return {
      info: {
        id: novelId,
        title,
        author,
        cover,
        description: this.sanitize(description),
        status: '',
        lastChapter: chapters[chapters.length - 1]?.title || '',
        updateTime: '',
        chapterCount: chapters.length,
      },
      chapters,
    };
  }

  async getChapter(novelId: string, chapterId: string): Promise<ChapterContent> {
    const url = `${this.baseUrl}/${novelId}/${chapterId}.html`;
    const html = await this.fetchHtml(url);
    const $ = this.loadHtml(html);

    const title = $('h1, .bookname h1').first().text().trim() || chapterId;

    $('#content, #chaptercontent').find('script, style, ins, a').remove();
    const rawContent = $('#content, #chaptercontent').html() || '';
    const content = this.sanitize(rawContent);

    return {
      id: chapterId,
      title,
      content,
    };
  }
}
