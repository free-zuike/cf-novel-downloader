import { useEffect, useState } from 'react';
import { listSources, search, getNovel, getChapter, createDownloadTask, getTaskStatus, getDownloadUrl } from './api';
import type { SourceMeta, SearchResult, NovelInfo, Chapter, ChapterContent, TaskStatus } from './types';

type View = 'search' | 'detail' | 'chapter';

export default function App() {
  const [sources, setSources] = useState<SourceMeta[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  const [view, setView] = useState<View>('search');
  const [novelInfo, setNovelInfo] = useState<NovelInfo | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingNovel, setLoadingNovel] = useState(false);
  const [novelError, setNovelError] = useState('');

  const [currentChapter, setCurrentChapter] = useState<ChapterContent | null>(null);
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [chapterError, setChapterError] = useState('');

  const [downloadFormat, setDownloadFormat] = useState<'txt' | 'epub'>('txt');
  const [downloadError, setDownloadError] = useState('');
  const [downloadInfo, setDownloadInfo] = useState<{ taskId: string; status: TaskStatus } | null>(null);
  const [downloadLinks, setDownloadLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    listSources().then((s) => {
      setSources(s);
      if (s.length > 0 && !selectedSource) {
        setSelectedSource(s[0].id);
      }
    });
  }, []);

  // Poll task status when download is in progress
  useEffect(() => {
    if (!downloadInfo || downloadInfo.status.status === 'completed' || downloadInfo.status.status === 'error') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const { task } = await getTaskStatus(downloadInfo.taskId);
        setDownloadInfo({ taskId: downloadInfo.taskId, status: task });

        if (task.status === 'completed' && task.downloadUrl) {
          clearInterval(interval);
          setDownloadLinks((prev) => ({ ...prev, [downloadInfo.taskId]: task.downloadUrl! }));
        } else if (task.status === 'error') {
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [downloadInfo]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyword.trim() || !selectedSource) return;
    setSearching(true);
    setSearchError('');
    setResults([]);
    try {
      const list = await search(selectedSource, keyword.trim());
      setResults(list);
      if (list.length === 0) {
        setSearchError('未找到相关小说');
      }
    } catch (err) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const openNovel = async (item: SearchResult) => {
    setLoadingNovel(true);
    setNovelError('');
    setView('detail');
    setNovelInfo(null);
    setChapters([]);
    try {
      const { info, chapters: chs } = await getNovel(selectedSource, item.id);
      setNovelInfo(info);
      setChapters(chs);
    } catch (err) {
      setNovelError((err as Error).message);
    } finally {
      setLoadingNovel(false);
    }
  };

  const openChapter = async (chapter: Chapter) => {
    if (!novelInfo) return;
    setLoadingChapter(true);
    setChapterError('');
    setView('chapter');
    setCurrentChapter(null);
    try {
      const ch = await getChapter(selectedSource, novelInfo.id, chapter.id);
      setCurrentChapter(ch);
    } catch (err) {
      setChapterError((err as Error).message);
    } finally {
      setLoadingChapter(false);
    }
  };

  const handleDownload = async () => {
    if (!novelInfo) return;
    setDownloadError('');
    try {
      const result = await createDownloadTask(selectedSource, novelInfo.id, downloadFormat);
      setDownloadInfo({
        taskId: result.taskId,
        status: {
          id: result.taskId,
          status: 'pending',
          current: 0,
          total: result.total,
          fileKey: null,
          downloadUrl: null,
          error: null,
          createdAt: Date.now(),
          completedAt: null,
        },
      });
    } catch (err) {
      setDownloadError((err as Error).message);
    }
  };

  const handleDownloadClick = async (taskId: string, title: string, format: string) => {
    try {
      const url = await getDownloadUrl(taskId);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      setDownloadError((err as Error).message);
    }
  };

  const backToSearch = () => {
    setView('search');
    setNovelInfo(null);
    setChapters([]);
    setDownloadInfo(null);
  };

  const backToDetail = () => {
    setView('detail');
    setCurrentChapter(null);
  };

  const progress = downloadInfo ? Math.round((downloadInfo.status.current / Math.max(downloadInfo.status.total, 1)) * 100) : 0;
  const isDownloading = downloadInfo && ['pending', 'downloading'].includes(downloadInfo.status.status);
  const isCompleted = downloadInfo && downloadInfo.status.status === 'completed';
  const isError = downloadInfo && downloadInfo.status.status === 'error';

  return (
    <div className="app">
      <header className="header">
        <h1>📚 小说下载器</h1>
        <p>开源小说搜索与下载工具 · Cloudflare Workers</p>
      </header>

      <main className="container">
        <div className="search-panel">
          <form onSubmit={handleSearch}>
            <div className="search-row">
              <select
                className="select"
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                style={{ flex: '0 0 200px' }}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="输入小说名称，例如：三体、斗破苍穹..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={searching || !keyword.trim()}>
                {searching ? '搜索中...' : '🔍 搜索'}
              </button>
            </div>
          </form>
          {searchError && <div className="error">{searchError}</div>}
        </div>

        {view === 'search' && (
          <>
            {searching && (
              <div className="loading">
                <div className="spinner"></div>
                <p>正在搜索...</p>
              </div>
            )}
            {!searching && results.length > 0 && (
              <>
                <h2 className="section-title">搜索结果 ({results.length})</h2>
                <div className="results-grid">
                  {results.map((r) => (
                    <div key={r.id} className="card" onClick={() => openNovel(r)}>
                      <h3 className="card-title">{r.title}</h3>
                      <div className="card-meta">作者：{r.author}</div>
                      {r.category && <div className="card-meta">分类：{r.category}</div>}
                      {r.lastChapter && <div className="card-meta">最新：{r.lastChapter}</div>}
                      <div className="card-actions">
                        <button className="btn btn-primary btn-small" onClick={(e) => { e.stopPropagation(); openNovel(r); }}>
                          查看详情
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!searching && results.length === 0 && !searchError && (
              <div className="empty-state">
                <div className="empty-state-icon">📖</div>
                <p>输入关键词开始搜索小说</p>
              </div>
            )}
          </>
        )}

        {view === 'detail' && (
          <>
            <span className="back-link" onClick={backToSearch}>← 返回搜索</span>
            {loadingNovel && (
              <div className="loading">
                <div className="spinner"></div>
                <p>正在加载小说信息...</p>
              </div>
            )}
            {novelError && <div className="error">{novelError}</div>}
            {novelInfo && (
              <div className="detail-view">
                <div className="detail-header">
                  <div className="detail-info">
                    <h2 className="detail-title">{novelInfo.title}</h2>
                    <div className="detail-meta">作者：{novelInfo.author}</div>
                    {novelInfo.chapterCount && <div className="detail-meta">章节数：{novelInfo.chapterCount}</div>}
                    {novelInfo.lastChapter && <div className="detail-meta">最新章节：{novelInfo.lastChapter}</div>}
                    {novelInfo.description && <div className="detail-desc">{novelInfo.description}</div>}
                  </div>
                </div>
                <div className="detail-actions">
                  <span style={{ fontWeight: 600 }}>下载格式：</span>
                  <select
                    className="select"
                    style={{ flex: '0 0 140px' }}
                    value={downloadFormat}
                    onChange={(e) => setDownloadFormat(e.target.value as 'txt' | 'epub')}
                  >
                    <option value="txt">TXT 文本</option>
                    <option value="epub">EPUB 电子书</option>
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={handleDownload}
                    disabled={isDownloading || chapters.length === 0}
                  >
                    {isDownloading ? '处理中...' : `⬇️ 创建下载任务`}
                  </button>
                  {isCompleted && downloadInfo && (
                    <button
                      className="btn btn-outline"
                      onClick={() => handleDownloadClick(downloadInfo.taskId, novelInfo.title, downloadFormat)}
                    >
                      ⬇️ 下载文件
                    </button>
                  )}
                  {isError && (
                    <span style={{ color: 'var(--danger)', fontSize: 13 }}>下载失败</span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 'auto' }}>
                    {chapters.length > 0 ? `${chapters.length}章节` : ''}
                  </span>
                </div>

                {downloadInfo && (
                  <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: '#f9fafb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span style={{ fontWeight: 500 }}>
                        {downloadInfo.status.status === 'pending' && '⏳ 等待中'}
                        {downloadInfo.status.status === 'downloading' && '📥 下载中'}
                        {downloadInfo.status.status === 'completed' && '✅ 完成'}
                        {downloadInfo.status.status === 'error' && '❌ 失败'}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {downloadInfo.status.current} / {downloadInfo.status.total} 章节
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                    </div>
                    {isCompleted && downloadInfo && (
                      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--success)' }}>
                        点击上方「下载文件」按钮获取文件
                      </p>
                    )}
                    {isError && downloadInfo.status.error && (
                      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--danger)' }}>
                        错误：{downloadInfo.status.error}
                      </p>
                    )}
                  </div>
                )}

                {downloadError && <div style={{ padding: '0 24px' }}><div className="error">{downloadError}</div></div>}

                <div className="chapter-list">
                  <h3 className="section-title" style={{ marginBottom: 16 }}>章节列表</h3>
                  <div className="chapter-grid">
                    {chapters.map((ch) => (
                      <div key={ch.id} className="chapter-item" onClick={() => openChapter(ch)} title={ch.title}>
                        {ch.title}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {view === 'chapter' && (
          <>
            <span className="back-link" onClick={backToDetail}>← 返回小说详情</span>
            {loadingChapter && (
              <div className="loading">
                <div className="spinner"></div>
                <p>正在加载章节...</p>
              </div>
            )}
            {chapterError && <div className="error">{chapterError}</div>}
            {currentChapter && (
              <div className="detail-view">
                <div className="chapter-viewer">
                  <h2>{currentChapter.title}</h2>
                  <div className="chapter-content">{currentChapter.content}</div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        Novel Downloader · Cloudflare Workers · D1 Database · R2 Storage · 开源项目
      </footer>
    </div>
  );
}
