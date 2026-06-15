import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { listSources, getSource } from './sources';
import { exportToTxt } from './exporter';
import type { Env, Task, NovelCache } from './types';
import type { Chapter, ChapterContent } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());
app.use('*', etag());

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

app.get('/api/sources', (c) => {
  const sources = listSources();
  return c.json({ sources });
});

app.post('/api/search', async (c) => {
  try {
    const { source, keyword } = await c.req.json<{ source?: string; keyword?: string }>();
    if (!source || !keyword) return c.json({ error: '参数 source 和 keyword 必填' }, 400);
    const src = getSource(source);
    const results = await src.search(keyword.trim());
    return c.json({ results });
  } catch (err) {
    console.error('[search]', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

app.post('/api/novel', async (c) => {
  try {
    const { source, novelId } = await c.req.json<{ source?: string; novelId?: string }>();
    if (!source || !novelId) return c.json({ error: '参数 source 和 novelId 必填' }, 400);

    const cached = await c.env.DB
      .prepare('SELECT * FROM novels_cache WHERE id = ? AND source = ?')
      .bind(novelId, source)
      .first<NovelCache>();

    if (cached) {
      const chaptersData = JSON.parse(cached.data) as Chapter[];
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
        chapters: chaptersData,
        cached: true,
      });
    }

    const src = getSource(source);
    const { info, chapters } = await src.getNovel(novelId);

    const now = Date.now();
    await c.env.DB
      .prepare(`INSERT OR REPLACE INTO novels_cache (id, source, title, author, cover, description, last_chapter, chapter_count, data, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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

app.post('/api/chapter', async (c) => {
  try {
    const { source, novelId, chapterId } = await c.req.json<{ source?: string; novelId?: string; chapterId?: string }>();
    if (!source || !novelId || !chapterId) return c.json({ error: '参数 source, novelId, chapterId 必填' }, 400);

    const cached = await c.env.DB
      .prepare('SELECT * FROM chapters_cache WHERE id = ? AND novel_id = ? AND source = ?')
      .bind(chapterId, novelId, source)
      .first();

    if (cached && (cached as any).content) {
      return c.json({
        chapter: { id: chapterId, title: (cached as any).title, content: (cached as any).content },
        cached: true,
      });
    }

    const src = getSource(source);
    let chapter: ChapterContent;
    try {
      chapter = await src.getChapter(novelId, chapterId);
    } catch (e) {
      return c.json({
        chapter: {
          id: chapterId,
          title: '章节内容',
          content: '此章节内容需要在番茄小说APP中阅读。\n\n番茄小说采用JS动态加载机制，章节内容无法通过爬虫获取。',
        },
        cached: false,
        needsApp: true,
      });
    }

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

app.post('/api/download', async (c) => {
  try {
    const { source, novelId, format = 'txt' } = await c.req.json<{ source?: string; novelId?: string; format?: string }>();
    if (!source || !novelId) return c.json({ error: '参数 source 和 novelId 必填' }, 400);

    const taskId = `${source}-${novelId}-${Date.now()}`;
    const now = Date.now();

    const src = getSource(source);
    const { info, chapters } = await src.getNovel(novelId);

    await c.env.DB
      .prepare(`INSERT INTO tasks (id, novel_id, novel_title, source, format, status, current, total, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`)
      .bind(taskId, novelId, info.title, source, format, chapters.length, now, now)
      .run();

    c.executionCtx.waitUntil(processDownload(c.env, taskId, source, novelId, info, chapters, format));

    return c.json({
      taskId,
      status: 'pending',
      title: info.title,
      total: chapters.length,
      message: '下载任务已创建，稍后查询进度',
    });
  } catch (err) {
    console.error('[download]', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

app.get('/api/task/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const task = await c.env.DB
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .bind(taskId)
      .first<Task>();

    if (!task) return c.json({ error: '任务不存在' }, 404);

    let downloadUrl: string | null = null;
    if (task.status === 'completed' && task.file_key) {
      try {
        const url = await c.env.FILES.createSignedUrl({
          objectName: task.file_key,
          expiresIn: 3600,
        });
        downloadUrl = url;
      } catch (e) {
        console.warn('[signedUrl]', (e as Error).message);
      }
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

app.get('/api/download/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const task = await c.env.DB
      .prepare('SELECT * FROM tasks WHERE id = ? AND status = ?')
      .bind(taskId, 'completed')
      .first<Task>();

    if (!task || !task.file_key) return c.json({ error: '文件不存在或任务未完成' }, 404);

    const file = await c.env.FILES.get(task.file_key);
    if (!file) return c.json({ error: '文件不存在' }, 404);

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
    await updateTask({ status: 'processing', current: 0, total: chapters.length });

    const collected: ChapterContent[] = [];
    const src = getSource(source);

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      try {
        const content = await src.getChapter(novelId, ch.id);
        collected.push({ id: ch.id, title: ch.title, content: content.content });
        await updateTask({ current: i + 1 });
        if (i < chapters.length - 1) await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        collected.push({
          id: ch.id,
          title: ch.title,
          content: `【此章节需要在番茄小说APP中阅读】`,
        });
      }
    }

    const book = { id: novelId, title: info.title, author: info.author, description: info.description, cover: info.cover, chapters: collected };
    const txt = exportToTxt(book);
    const data = new TextEncoder().encode(txt);
    const filename = `${info.title}.txt`;
    const fileKey = `downloads/${taskId}/${filename}`;

    await env.FILES.put(fileKey, data, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });

    await updateTask({ status: 'completed', current: collected.length, file_key: fileKey, completed_at: Date.now() });
  } catch (err) {
    console.error('[processDownload]', err);
    await updateTask({ status: 'error', error_message: (err as Error).message });
  }
}

app.get('/', async (c) => {
  return serveStatic(c, '/index.html');
});

app.get('/assets/*', async (c) => {
  return serveStatic(c, c.req.path);
});

app.get('/*', async (c) => {
  const path = c.req.path;
  if (path.startsWith('/api/')) return c.json({ error: 'Not Found' }, 404);
  const asset = await serveStatic(c, path);
  if (asset) return asset;
  return serveStatic(c, '/index.html');
});

async function serveStatic(c: any, path: string): Promise<Response> {
  try {
    const assetPath = path.startsWith('/') ? path.slice(1) : path;
    const cacheKey = `static:${assetPath}`;
    
    const cached = await c.env.DB
      .prepare('SELECT content, content_type FROM static_cache WHERE path = ?')
      .bind(assetPath)
      .first();

    if (cached) {
      return new Response((cached as any).content, {
        headers: {
          'Content-Type': (cached as any).content_type || 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>小说下载器 - Cloudflare Workers</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5;color:#333;line-height:1.6}.container{max-width:800px;margin:40px auto;padding:20px}h1{color:#1a73e8;margin-bottom:10px}.subtitle{color:#666;margin-bottom:30px}.card{background:white;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}.row{display:flex;gap:12px;margin-bottom:12px;align-items:center}.input,.select{flex:1;padding:12px 16px;border:1px solid #ddd;border-radius:8px;font-size:15px}.btn{padding:12px 24px;background:#1a73e8;color:white;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:500}.btn:hover{background:#1557b0}.btn:disabled{background:#aac6e8;cursor:not-allowed}.btn-outline{background:white;color:#1a73e8;border:1px solid #1a73e8}.btn-outline:hover{background:#e8f0fe}.btn-small{padding:8px 16px;font-size:14px}.book-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}.book-card{background:white;border-radius:12px;padding:20px;cursor:pointer;transition:transform .15s;box-shadow:0 1px 3px rgba(0,0,0,.1)}.book-card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.1)}.book-title{font-size:18px;font-weight:600;margin-bottom:8px;color:#202124}.book-meta{color:#5f6368;font-size:14px;margin:4px 0}.chapter-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}.chapter-item{padding:10px;background:#f0f4f8;border-radius:6px;cursor:pointer;font-size:14px;transition:background .15s}.chapter-item:hover{background:#dce8f5}.back-link{color:#1a73e8;cursor:pointer;margin-bottom:16px;display:inline-block}.section-title{font-size:16px;font-weight:600;margin:16px 0 12px;color:#202124}.loading{text-align:center;padding:40px;color:#666}.error{color:#d93025;background:#fce8e6;padding:12px 16px;border-radius:8px;margin-bottom:16px}.chapter-viewer{background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.1);white-space:pre-wrap;line-height:1.8;font-size:15px}.progress-bar{height:8px;background:#e0e0e0;border-radius:4px;overflow:hidden;margin:12px 0}.progress-fill{height:100%;background:#1a73e8;transition:width .3s}.empty{text-align:center;padding:60px;color:#999}
</style>
</head>
<body>
<div class="container">
<h1>📚 番茄小说下载器</h1>
<p class="subtitle">开源小说搜索与下载工具 · Cloudflare Workers 版</p>
<div id="app"></div>
</div>
<script>
const API_BASE = '';
const state = { view: 'search', source: 'fanqienovel', keyword: '', results: [], novelInfo: null, chapters: [], currentChapter: null, downloadTask: null, polling: null };
const $ = (id) => document.getElementById(id);

async function apiCall(path, data) {
  const res = await fetch(API_BASE + path, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  return res.json();
}

async function doSearch() {
  state.keyword = $('keyword').value.trim();
  if (!state.keyword) return;
  render('<div class="loading">正在搜索...</div>');
  const data = await apiCall('/api/search', { source: state.source, keyword: state.keyword });
  state.results = data.results || [];
  renderSearch();
}

function renderSearch() {
  let html = \`<div class="card">
    <div class="row">
      <input id="keyword" class="input" placeholder="输入关键词搜索（如：特工、都市、玄幻）" value="\${state.keyword}" />
      <button class="btn" onclick="doSearch()">搜索</button>
    </div>
    <p style="font-size:13px;color:#666;margin-top:8px">提示：搜索在番茄小说推荐书籍中匹配，留空显示全部推荐</p>
  </div>\`;
  if (state.results.length === 0) {
    html += '<div class="card empty">未找到相关书籍，请尝试其他关键词</div>';
  } else {
    html += '<h2 class="section-title">搜索结果 (' + state.results.length + ')</h2><div class="book-grid">';
    for (const b of state.results) {
      html += \`<div class="book-card" onclick="openNovel('\${b.id}')">
        <div class="book-title">\${b.title}</div>
        <div class="book-meta">作者：\${b.author}</div>
        \${b.category ? '<div class="book-meta">分类：' + b.category + '</div>' : ''}
        \${b.lastChapter ? '<div class="book-meta" style="color:#888;font-size:12px;margin-top:8px">' + b.lastChapter.slice(0, 40) + '...</div>' : ''}
      </div>\`;
    }
    html += '</div>';
  }
  render(html);
}

async function openNovel(id) {
  state.view = 'detail';
  state.novelInfo = null;
  render('<div class="loading">正在加载书籍信息...</div>');
  const data = await apiCall('/api/novel', { source: state.source, novelId: id });
  state.novelInfo = data.info;
  state.chapters = data.chapters || [];
  renderDetail();
}

function renderDetail() {
  const info = state.novelInfo;
  let html = \`<span class="back-link" onclick="goSearch()">← 返回搜索</span>
    <div class="card">
      <h2 style="margin-bottom:12px">\${info.title}</h2>
      <div class="book-meta">作者：\${info.author}</div>
      \${info.description ? '<p style="margin-top:12px;color:#555;font-size:14px">' + info.description.slice(0, 200) + '</p>' : ''}
      <div style="margin-top:20px;padding:12px;background:#fff8e1;border-radius:8px;font-size:13px;color:#8a6d1c">
        ⚠️ 番茄小说章节内容采用 JS 动态加载，无法通过爬虫获取，请到番茄小说APP阅读完整内容。
      </div>
    </div>\`;
  if (state.chapters.length > 0) {
    html += '<div class="card"><h3 class="section-title">章节列表 (' + state.chapters.length + ')</h3><div class="chapter-grid">';
    for (const ch of state.chapters) {
      html += '<div class="chapter-item" onclick="openChapter(\\'' + ch.id + '\\')">' + ch.title + '</div>';
    }
    html += '</div></div>';
  }
  render(html);
}

async function openChapter(id) {
  state.view = 'chapter';
  render('<div class="loading">正在加载章节...</div>');
  const data = await apiCall('/api/chapter', { source: state.source, novelId: state.novelInfo.id, chapterId: id });
  state.currentChapter = data.chapter;
  renderChapter();
}

function renderChapter() {
  const ch = state.currentChapter;
  render(\`<span class="back-link" onclick="goDetail()">← 返回书籍</span>
    <div class="chapter-viewer">
      <h2 style="margin-bottom:20px">\${ch.title}</h2>
      <div>\${ch.content}</div>
    </div>\`);
}

function goSearch() { state.view = 'search'; renderSearch(); }
function goDetail() { state.view = 'detail'; renderDetail(); }
function render(html) { document.getElementById('app').innerHTML = html; }

window.doSearch = doSearch;
window.openNovel = openNovel;
window.openChapter = openChapter;
window.goSearch = goSearch;
window.goDetail = goDetail;

// 初始显示：获取首页推荐
(async () => {
  render('<div class="loading">正在加载推荐书籍...</div>');
  const data = await apiCall('/api/search', { source: state.source, keyword: ' ' });
  state.results = data.results || [];
  state.keyword = '';
  renderSearch();
})();
</script>
</body>
</html>`;
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    console.error('[static]', e);
    return c.text('Service unavailable', 503);
  }
}

export default app;
