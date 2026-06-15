import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { listSources, getSource } from './sources';
import { exportToTxt, exportToEpubBytes } from './exporter';
import type { Env, Task, NovelCache } from './types';
import type { Chapter, ChapterContent } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());
app.use('*', etag());

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// List sources
app.get('/api/sources', (c) => {
  const sources = listSources();
  return c.json({ sources });
});

// Search novels
app.post('/api/search', async (c) => {
  try {
    const { source, keyword } = await c.req.json<{ source?: string; keyword?: string }>();

    if (!source || !keyword) {
      return c.json({ error: '参数 source 和 keyword 必填' }, 400);
    }

    const src = getSource(source);
    const results = await src.search(keyword.trim());

    return c.json({ results });
  } catch (err) {
    console.error('[search]', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Get novel info and chapters
app.post('/api/novel', async (c) => {
  try {
    const { source, novelId } = await c.req.json<{ source?: string; novelId?: string }>();

    if (!source || !novelId) {
      return c.json({ error: '参数 source 和 novelId 必填' }, 400);
    }

    // Check cache first
    const cached = await c.env.DB
      .prepare('SELECT * FROM novels_cache WHERE id = ? AND source = ?')
      .bind(novelId, source)
      .first<NovelCache>();

    if (cached) {
      const data = JSON.parse(cached.data) as Chapter[];
      return c.json({
        info: {
          id: cached.id,
          title: cached.title,
          author: cached.author || '未知',
          cover: cached.cover,
          description: cached.description,
          lastChapter: cached.last_chapter,
          chapterCount: cached.chapter_count,
        },
        chapters: data,
        cached: true,
      });
    }

    const src = getSource(source);
    const { info, chapters } = await src.getNovel(novelId);

    // Cache for 24 hours
    const now = Date.now();
    await c.env.DB
      .prepare(`INSERT OR REPLACE INTO novels_cache (id, source, title, author, cover, description, last_chapter, chapter_count, data, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        novelId, source, info.title, info.author, info.cover || '',
        info.description || '', info.lastChapter || '', info.chapterCount || 0,
        JSON.stringify(chapters), now, now
      )
      .run();

    return c.json({ info, chapters, cached: false });
  } catch (err) {
    console.error('[novel]', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Get chapter content
app.post('/api/chapter', async (c) => {
  try {
    const { source, novelId, chapterId } = await c.req.json<{ source?: string; novelId?: string; chapterId?: string }>();

    if (!source || !novelId || !chapterId) {
      return c.json({ error: '参数 source, novelId, chapterId 必填' }, 400);
    }

    // Check cache
    const cached = await c.env.DB
      .prepare('SELECT * FROM chapters_cache WHERE id = ? AND novel_id = ? AND source = ?')
      .bind(chapterId, novelId, source)
      .first();

    if (cached) {
      return c.json({
        chapter: {
          id: chapterId,
          title: (cached as any).title,
          content: (cached as any).content,
        },
        cached: true,
      });
    }

    const src = getSource(source);
    const chapter = await src.getChapter(novelId, chapterId);

    // Cache for 7 days
    await c.env.DB
      .prepare(`INSERT OR REPLACE INTO chapters_cache (id, novel_id, source, title, content, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(chapterId, novelId, source, chapter.title, chapter.content, Date.now())
      .run();

    return c.json({ chapter, cached: false });
  } catch (err) {
    console.error('[chapter]', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Create download task (async)
app.post('/api/download', async (c) => {
  try {
    const { source, novelId, format = 'txt' } = await c.req.json<{ source?: string; novelId?: string; format?: string }>();

    if (!source || !novelId) {
      return c.json({ error: '参数 source 和 novelId 必填' }, 400);
    }

    const taskId = `${source}-${novelId}-${Date.now()}`;
    const now = Date.now();

    // Get novel info
    const src = getSource(source);
    const { info, chapters } = await src.getNovel(novelId);

    // Create task in D1
    await c.env.DB
      .prepare(`INSERT INTO tasks (id, novel_id, novel_title, source, format, status, current, total, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`)
      .bind(taskId, novelId, info.title, source, format, chapters.length, now, now)
      .run();

    // Start async download (fire and let the worker handle it via queue or background)
    // For now, we do it inline but with chunked approach
    // In production, use Cloudflare Queue for reliability
    c.executionCtx.waitUntil(processDownload(c.env, taskId, source, novelId, info, chapters, format));

    return c.json({
      taskId,
      status: 'pending',
      title: info.title,
      total: chapters.length,
      message: '下载任务已创建，请稍后查询进度',
    });
  } catch (err) {
    console.error('[download]', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Get task status
app.get('/api/task/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');

    const task = await c.env.DB
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .bind(taskId)
      .first<Task>();

    if (!task) {
      return c.json({ error: '任务不存在' }, 404);
    }

    let downloadUrl: string | null = null;
    if (task.status === 'completed' && task.file_key) {
      // Generate presigned URL (valid for 1 hour)
      const url = await c.env.FILES.createSignedUrl({
        objectName: task.file_key,
        expiresIn: 3600,
      });
      downloadUrl = url;
    }

    return c.json({
      task: {
        id: task.id,
        status: task.status,
        current: task.current,
        total: task.total,
        fileKey: task.file_key,
        downloadUrl,
        error: task.error_message,
        createdAt: task.created_at,
        completedAt: task.completed_at,
      },
    });
  } catch (err) {
    console.error('[task]', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Download via task file key
app.get('/api/download/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');

    const task = await c.env.DB
      .prepare('SELECT * FROM tasks WHERE id = ? AND status = ?')
      .bind(taskId, 'completed')
      .first<Task>();

    if (!task || !task.file_key) {
      return c.json({ error: '文件不存在或任务未完成' }, 404);
    }

    const file = await c.env.FILES.get(task.file_key);
    if (!file) {
      return c.json({ error: '文件不存在' }, 404);
    }

    const filename = encodeURIComponent(`${task.novel_title}.${task.format}`);

    return new Response(file.body, {
      headers: {
        'Content-Type': task.format === 'epub' ? 'application/epub+zip' : 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[download file]', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// List recent tasks
app.get('/api/tasks', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');

    const { results } = await c.env.DB
      .prepare('SELECT id, novel_title, source, format, status, current, total, created_at FROM tasks ORDER BY created_at DESC LIMIT ?')
      .bind(limit)
      .all<Task>();

    return c.json({ tasks: results });
  } catch (err) {
    console.error('[tasks]', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Async download processor
async function processDownload(
  env: Env,
  taskId: string,
  source: string,
  novelId: string,
  info: { title: string; author: string; description?: string; cover?: string },
  chapters: Chapter[],
  format: string
) {
  const now = Date.now();
  const updateTask = async (updates: Partial<Task>) => {
    const sets = Object.entries(updates).map(([k]) => `${k} = ?`).join(', ');
    const values = Object.entries(updates).map(([, v]) => v as any);
    await env.DB
      .prepare(`UPDATE tasks SET ${sets}, updated_at = ? WHERE id = ?`)
      .bind(...values, now, taskId)
      .run();
  };

  try {
    await updateTask({ status: 'downloading', current: 0, total: chapters.length });

    const collected: ChapterContent[] = [];
    const src = getSource(source);

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      try {
        const content = await src.getChapter(novelId, ch.id);
        collected.push({ id: ch.id, title: ch.title, content: content.content });

        await updateTask({ current: i + 1 });

        // Small delay to be respectful to the source
        if (i < chapters.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (err) {
        console.warn(`[download] skip ${ch.title}:`, (err as Error).message);
      }
    }

    const book = {
      id: novelId,
      title: info.title,
      author: info.author,
      description: info.description,
      cover: info.cover,
      chapters: collected,
    };

    let data: Uint8Array;
    let filename: string;

    if (format === 'epub') {
      data = await exportToEpubBytes(book);
      filename = `${info.title}.txt`; // Simplified: save as txt with epub markers
    } else {
      const txt = exportToTxt(book);
      data = new TextEncoder().encode(txt);
      filename = `${info.title}.txt`;
    }

    // Store in R2
    const fileKey = `downloads/${taskId}/${filename}`;
    await env.FILES.put(fileKey, data, {
      httpMetadata: {
        contentType: format === 'epub' ? 'application/epub+zip' : 'text/plain; charset=utf-8',
      },
    });

    await updateTask({ status: 'completed', current: collected.length, file_key: fileKey });

  } catch (err) {
    console.error('[processDownload]', err);
    await updateTask({ status: 'error', error_message: (err as Error).message });
  }
}

// Serve static files from R2 or built web app
app.get('*', async (c) => {
  // Check if it's an API route
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not Found' }, 404);
  }

  // Try R2 first for any static assets
  const path = c.req.path === '/' ? '/index.html' : c.req.path;
  const file = await c.env.FILES.get(`static${path}`);

  if (file) {
    const contentType = getContentType(path);
    return new Response(file.body, {
      headers: { 'Content-Type': contentType },
    });
  }

  // Return 404 for API
  return c.json({ error: 'Not Found', path: c.req.path }, 404);
});

function getContentType(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return 'text/plain';
}

export default app;
