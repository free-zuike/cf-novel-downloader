-- D1 Schema for Novel Downloader

-- 任务表
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    novel_id TEXT NOT NULL,
    novel_title TEXT NOT NULL,
    source TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'txt',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, downloading, completed, error
    current INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    file_key TEXT, -- R2 object key
    error_message TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created ON tasks(created_at);

-- 小说缓存表（避免重复抓取）
CREATE TABLE IF NOT EXISTS novels_cache (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    cover TEXT,
    description TEXT,
    last_chapter TEXT,
    chapter_count INTEGER,
    data TEXT NOT NULL, -- JSON stringified chapters
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_novels_source ON novels_cache(source);
CREATE INDEX idx_novels_updated ON novels_cache(updated_at);

-- 章节内容缓存
CREATE TABLE IF NOT EXISTS chapters_cache (
    id TEXT PRIMARY KEY,
    novel_id TEXT NOT NULL,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_chapters_novel ON chapters_cache(novel_id);
