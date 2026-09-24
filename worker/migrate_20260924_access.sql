ALTER TABLE nda ADD COLUMN scope TEXT;
CREATE TABLE IF NOT EXISTS nda_access (id INTEGER PRIMARY KEY AUTOINCREMENT, nda_id TEXT NOT NULL, listing TEXT NOT NULL, status TEXT NOT NULL, requested_at TEXT, decided_at TEXT, UNIQUE(nda_id, listing));
