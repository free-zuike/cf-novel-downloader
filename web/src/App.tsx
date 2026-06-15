import { useEffect, useState } from 'react';
import { listSources, search, getNovel, getChapter, downloadNovel } from './api';
import type { SourceMeta, SearchResult, NovelInfo, Chapter, ChapterContent } from './types';

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

  const [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'txt' | 'epub'>('txt');
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    listSources().then((s) => {
      setSources(s);
      if (s.length > 0 && !selectedSource) {
        setSelectedSource(s[0].id);
      }
    });
  }, []);

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
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadNovel(selectedSource, novelInfo.id, downloadFormat, novelInfo.title);
    } catch (err) {
      setDownloadError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const backToSearch = () => {
    setView('search');
    setNovelInfo(null);
    setChapters([]);
  };

  const backToDetail = () => {
    setView('detail');
    setCurrentChapter(null);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>📚 小说下载器</h1>
        <p>开源小说搜索与下载工具 · Novel Downloader</p>
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
                    disabled={downloading || chapters.length === 0}
                  >
                    {downloading ? '下载中...' : `⬇️ 下载整本 (${chapters.length}章)`}
                  </button>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 'auto' }}>
                    提示：下载整本可能需要较长时间
                  </span>
                </div>
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
        Novel Downloader · 开源项目 · 仅供学习交流 · 请支持正版
      </footer>
    </div>
  );
}
