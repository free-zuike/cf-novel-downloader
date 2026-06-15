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

    $('.search-result-list .bookbox, .result-list .book-item, .search-list li, #list .bookbox, .article-list li').each((_, el) => {
      const $el = $(el);
      const title = $el.find('h3, h4, .title, a').first().text().trim();
      const $link = $el.find('a').first();
      const href = $link.attr('href') || '';
      const author = $el.find('.author, .book-author, p').first().text().trim();

      if (title && href) {
        const idMatch = href.match(/\/(\d+)\/?(\d+)?/);
        const id = idMatch ? idMatch[1] : href.replace(/\//g, '');

        results.push({
          id,
          title,
          author: author || '未知',
          cover: $el.find('img').attr('src') || undefined,
          category: '',
          lastChapter: $el.find('.chapter, .last').text().trim(),
        });
      }
    });

    if (results.length === 0) {
      $('a[href*="/book/"], a[href*="/html/"]').each((_, el) => {
        const $el = $(el);
        const title = $el.text().trim();
        const href = $el.attr('href') || '';
        if (title && title.length < 50 && results.length < 20) {
          const idMatch = href.match(/(\d+)/);
          if (idMatch) {
            results.push({
              id: idMatch[1],
              title,
              author: '未知',
              category: '',
              lastChapter: '',
            });
          }
        }
      });
    }

    return results;
  }

  async getNovel(novelId: string): Promise<{ info: NovelInfo; chapters: Chapter[] }> {
    const url = `${this.baseUrl}/book/${novelId}/`;
    const html = await this.fetchHtml(url);
    const $ = this.loadHtml(html);

    const title = $('h1, #info h1').first().text().trim() || novelId;
    const author = $('#info p, .info p, .book-info .author').first().text().replace(/作.*者[:：]/, '').trim() || '未知';
    const cover = $('#fmimg img, .book-cover img').attr('src') || '';
    const description = $('#intro, .intro, .book-desc').text().trim();

    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    $('#list a, .catalog a, .chapter-list a, ul li a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const text = $el.text().trim();

      if (!text || !href || !href.endsWith('.html')) return;

      const idMatch = href.match(/\/(\d+)\.html/);
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
    const url = `${this.baseUrl}/book/${novelId}/${chapterId}.html`;
    const html = await this.fetchHtml(url);
    const $ = this.loadHtml(html);

    const title = $('h1, .bookname h1').first().text().trim() || chapterId;

    $('#content').find('script, style, ins').remove();
    const rawContent = $('#content, .content, .chapter-content').html() || '';
    const content = this.sanitize(rawContent);

    return {
      id: chapterId,
      title,
      content,
    };
  }
}
