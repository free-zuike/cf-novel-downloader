import type { Env } from '../types';

export abstract class BaseSource {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract baseUrl: string;

  protected async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    } as RequestInit);

    if (!res.ok) {
      throw new Error(`请求失败: ${res.status} ${url}`);
    }

    return res.text();
  }

  protected loadHtml(html: string) {
    // Simple cheerio-like HTML parsing for Workers
    // In Workers environment, we use regex-based parsing or lightweight approach
    return new HTMLParser(html);
  }

  getMeta() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      baseUrl: this.baseUrl,
    };
  }

  abstract search(keyword: string): Promise<import('../types').SearchResult[]>;
  abstract getNovel(novelId: string): Promise<{ info: import('../types').NovelInfo; chapters: import('../types').Chapter[] }>;
  abstract getChapter(novelId: string, chapterId: string): Promise<import('../types').ChapterContent>;
}

export class HTMLParser {
  private html: string;

  constructor(html: string) {
    this.html = html;
  }

  querySelector(selector: string): Element | null {
    const patterns: Record<string, (html: string) => Element | null> = {
      'a': () => this.findFirst('href', selector),
      'h1': () => this.findByTag('h1'),
      'h3': () => this.findByTag('h3'),
      'img': () => this.findByTag('img'),
      'p': () => this.findByTag('p'),
    };

    const fn = patterns[selector];
    return fn ? fn() : null;
  }

  querySelectorAll(selector: string): Element[] {
    const patterns: Record<string, () => Element[]> = {
      'a': () => this.findAllLinks(),
      'li': () => this.findAllByTag('li'),
      'h3': () => this.findAllByTag('h3'),
    };

    const fn = patterns[selector];
    return fn ? fn() : [];
  }

  findFirst(attr: string, tag: string): Element | null {
    const tagMatch = this.html.match(new RegExp(`<${tag}[^>]*(${attr})="([^"]*)"[^>]*>([^<]*)</${tag}>`, 'i'));
    if (tagMatch) {
      return { tag, attr, value: tagMatch[2], text: tagMatch[3], html: tagMatch[0] } as any;
    }
    return null;
  }

  findByTag(tag: string): Element | null {
    const match = this.html.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
    if (match) {
      return { tag, text: match[1], html: match[0] } as any;
    }
    return null;
  }

  findAllLinks(): Element[] {
    const matches: Element[] = [];
    const regex = /<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let match;
    while ((match = regex.exec(this.html)) !== null) {
      matches.push({ tag: 'a', attr: 'href', value: match[1], text: match[2], html: match[0] } as any);
    }
    return matches;
  }

  findAllByTag(tag: string): Element[] {
    const matches: Element[] = [];
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi');
    let match;
    while ((match = regex.exec(this.html)) !== null) {
      matches.push({ tag, text: match[1], html: match[0] } as any);
    }
    return matches;
  }

  findAll(selector: string): Element[] {
    const patterns: Record<string, () => Element[]> = {
      'a': () => this.findAllLinks(),
      'li': () => this.findAllByTag('li'),
      'h3': () => this.findAllByTag('h3'),
      'h4': () => this.findAllByTag('h4'),
    };
    const fn = patterns[selector];
    return fn ? fn() : [];
  }

  getText(selector: string): string {
    const el = this.querySelector(selector);
    return el ? el.text || '' : '';
  }

  getAttr(selector: string, attr: string): string | undefined {
    const el = this.querySelector(selector);
    return el ? (el as any)[attr] || (el as any).value : undefined;
  }

  text(): string {
    return this.html.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim();
  }
}

export interface Element {
  tag: string;
  text?: string;
  attr?: string;
  value?: string;
  html?: string;
}
