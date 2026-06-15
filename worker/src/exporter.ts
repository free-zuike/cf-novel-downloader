import type { ChapterData } from '../types';

export interface BookData {
  id: string;
  title: string;
  author: string;
  description?: string;
  cover?: string;
  chapters: ChapterData[];
}

export function exportToTxt(book: BookData): string {
  const lines: string[] = [];
  lines.push(`${book.title}`);
  lines.push(`作者: ${book.author}`);
  if (book.description) {
    lines.push('');
    lines.push(book.description);
  }
  lines.push('');
  lines.push('='.repeat(40));
  lines.push('');

  for (const chapter of book.chapters) {
    if (!chapter.content) continue;
    lines.push(`《${chapter.title}》`);
    lines.push('');
    lines.push(chapter.content);
    lines.push('');
    lines.push('='.repeat(40));
    lines.push('');
  }

  return lines.join('\n');
}

// EPUB export using plain text/zip - simplified for Workers
// For full EPUB support, consider using a Workers-compatible zip library
export async function exportToEpubBytes(book: BookData): Promise<Uint8Array> {
  // Simple EPUB-like structure as plain text for now
  // Full EPUB requires zip library which adds complexity in Workers
  const txt = exportToTxt(book);

  // Add EPUB header markers
  const epubContent = `=== EPUB CONTAINER ===
TITLE: ${book.title}
AUTHOR: ${book.author}
DESCRIPTION: ${book.description || ''}
=== END EPUB HEADER ===

${txt}

=== END OF BOOK ===`;

  return new TextEncoder().encode(epubContent);
}
