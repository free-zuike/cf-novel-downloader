import JSZip from 'jszip';

export interface ChapterData {
  id: string;
  title: string;
  content: string;
}

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

async function encodeImage(cover?: string): Promise<{ data: Buffer; mime: string } | null> {
  if (!cover) return null;
  try {
    const url = cover.startsWith('//') ? 'https:' + cover : cover;
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    const mime = res.headers.get('content-type') || 'image/jpeg';
    return { data: Buffer.from(arr), mime };
  } catch {
    return null;
  }
}

export async function exportToEpub(book: BookData): Promise<Buffer> {
  const zip = new JSZip();
  const uuid = `urn:uuid:${book.id || Date.now().toString()}`;
  const safeTitle = book.title || 'Untitled';
  const safeAuthor = book.author || 'Unknown';

  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const chapters = book.chapters.filter((c) => c.content);

  let coverManifest = '';
  let coverSpine = '';

  const image = await encodeImage(book.cover);
  if (image) {
    const ext = image.mime.includes('png') ? 'png' : 'jpg';
    zip.file(`cover.${ext}`, image.data);
    zip.file(
      'cover.html',
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>封面</title></head><body><div style="text-align:center"><img src="cover.${ext}" alt="封面" /></div></body></html>`
    );
    coverManifest = `<item id="cover-image" href="cover.${ext}" media-type="${image.mime}"/><item id="cover" href="cover.html" media-type="application/xhtml+xml"/>`;
    coverSpine = '<itemref idref="cover" linear="yes"/>';
  }

  const chapterManifests = chapters
    .map(
      (_, i) => `<item id="chapter${i}" href="chapter${i}.html" media-type="application/xhtml+xml"/>`
    )
    .join('');

  const chapterSpine = chapters
    .map((_, i) => `<itemref idref="chapter${i}"/>`)
    .join('');

  const tocItems = chapters
    .map(
      (c, i) => `<navPoint id="navPoint-${i}" playOrder="${i + 1}"><navLabel><text>${escapeXml(c.title)}</text></navLabel><content src="chapter${i}.html"/></navPoint>`
    )
    .join('');

  zip.file(
    'toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(safeTitle)}</text></docTitle>
  <docAuthor><text>${escapeXml(safeAuthor)}</text></docAuthor>
  <navMap>${tocItems}</navMap>
</ncx>`
  );

  zip.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${uuid}</dc:identifier>
    <dc:title>${escapeXml(safeTitle)}</dc:title>
    <dc:creator>${escapeXml(safeAuthor)}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:description>${escapeXml(book.description || '')}</dc:description>
    <meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta>
  </metadata>
  <manifest>
    ${coverManifest}
    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${chapterManifests}
  </manifest>
  <spine toc="toc">
    ${coverSpine}
    ${chapterSpine}
  </spine>
</package>`
  );

  const navLinks = chapters
    .map((c, i) => `<li><a href="chapter${i}.html">${escapeXml(c.title)}</a></li>`)
    .join('');

  zip.file(
    'nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body>
<nav epub:type="toc"><h1>目录</h1><ol>${navLinks}</ol></nav>
</body>
</html>`
  );

  chapters.forEach((c, i) => {
    const paragraphs = c.content
      .split('\n')
      .filter((p) => p.trim())
      .map((p) => `<p>${escapeXml(p)}</p>`)
      .join('\n');

    zip.file(
      `chapter${i}.html`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>${escapeXml(c.title)}</title></head>
<body>
<h2>${escapeXml(c.title)}</h2>
${paragraphs}
</body>
</html>`
    );
  });

  return (await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/epub+zip' })) as Buffer;
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
