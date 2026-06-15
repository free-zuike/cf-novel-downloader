import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { listSources, getSource } from './sources';
import { exportToTxt, exportToEpub, type BookData, type ChapterData } from './exporter';
import type { DownloadProgress } from './types';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const WEB_DIST = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(WEB_DIST)) {
  console.log(`[server] Serving static files from: ${WEB_DIST}`);
  app.use(express.static(WEB_DIST));
}

const progressMap = new Map<string, DownloadProgress>();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/sources', (_req, res) => {
  res.json({ sources: listSources() });
});

app.post('/api/search', async (req, res) => {
  try {
    const { source, keyword } = req.body as { source: string; keyword: string };
    if (!source || !keyword) {
      res.status(400).json({ error: '参数 source 和 keyword 必填' });
      return;
    }
    const src = getSource(source);
    const results = await src.search(keyword);
    res.json({ results });
  } catch (err) {
    console.error('[search]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/novel', async (req, res) => {
  try {
    const { source, novelId } = req.body as { source: string; novelId: string };
    if (!source || !novelId) {
      res.status(400).json({ error: '参数 source 和 novelId 必填' });
      return;
    }
    const src = getSource(source);
    const { info, chapters } = await src.getNovel(novelId);
    res.json({ info, chapters });
  } catch (err) {
    console.error('[novel]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/chapter', async (req, res) => {
  try {
    const { source, novelId, chapterId } = req.body as { source: string; novelId: string; chapterId: string };
    if (!source || !novelId || !chapterId) {
      res.status(400).json({ error: '参数 source, novelId, chapterId 必填' });
      return;
    }
    const src = getSource(source);
    const chapter = await src.getChapter(novelId, chapterId);
    res.json({ chapter });
  } catch (err) {
    console.error('[chapter]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/download', async (req, res) => {
  try {
    const { source, novelId, format = 'txt' } = req.body as { source: string; novelId: string; format?: 'txt' | 'epub' };
    if (!source || !novelId) {
      res.status(400).json({ error: '参数 source 和 novelId 必填' });
      return;
    }
    const src = getSource(source);
    const { info, chapters } = await src.getNovel(novelId);

    const taskId = `${source}:${novelId}:${format}`;
    progressMap.set(taskId, {
      novelId,
      title: info.title,
      current: 0,
      total: chapters.length,
      status: 'downloading',
      format,
    });

    const collected: ChapterData[] = [];

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      try {
        const content = await src.getChapter(novelId, ch.id);
        collected.push({ id: ch.id, title: ch.title, content: content.content });
        progressMap.set(taskId, {
          novelId,
          title: info.title,
          current: i + 1,
          total: chapters.length,
          status: 'downloading',
          format,
        });
      } catch (err) {
        console.warn(`[download] skip ${ch.title}:`, (err as Error).message);
      }
    }

    const book: BookData = {
      id: novelId,
      title: info.title,
      author: info.author,
      description: info.description,
      cover: info.cover,
      chapters: collected,
    };

    let buffer: Buffer;
    let filename: string;
    let mime: string;

    if (format === 'epub') {
      buffer = await exportToEpub(book);
      filename = `${encodeURIComponent(info.title)}.epub`;
      mime = 'application/epub+zip';
    } else {
      buffer = Buffer.from(exportToTxt(book), 'utf8');
      filename = `${encodeURIComponent(info.title)}.txt`;
      mime = 'text/plain; charset=utf-8';
    }

    progressMap.set(taskId, {
      novelId,
      title: info.title,
      current: collected.length,
      total: chapters.length,
      status: 'completed',
      format,
    });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', mime);
    res.send(buffer);
  } catch (err) {
    console.error('[download]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/progress', (req, res) => {
  const { source, novelId, format = 'txt' } = req.body as { source?: string; novelId?: string; format?: string };
  if (!source || !novelId) {
    res.json({ progress: null });
    return;
  }
  const taskId = `${source}:${novelId}:${format}`;
  res.json({ progress: progressMap.get(taskId) || null });
});

app.get('*', (_req, res, next) => {
  if (fs.existsSync(WEB_DIST)) {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  } else {
    next();
  }
});

app.listen(PORT, () => {
  console.log(`[server] Novel Downloader Server running on http://localhost:${PORT}`);
});
