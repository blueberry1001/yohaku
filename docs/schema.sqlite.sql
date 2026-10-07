-- Shared schema for browser sql.js files and Windows Microsoft.Data.Sqlite.
-- Schema version 1; do not silently migrate unknown SQLite files.
PRAGMA application_id = 1498372161;
PRAGMA user_version = 1;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS artworks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  creator TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('illustration','video','photo','design')),
  tags TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  collection TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0,1)),
  status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox','reviewing','reviewed')),
  image_url TEXT,
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY NOT NULL,
  artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_artwork_id ON comments(artwork_id);
CREATE INDEX IF NOT EXISTS artworks_created_at ON artworks(created_at DESC);
