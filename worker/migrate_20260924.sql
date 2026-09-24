CREATE TABLE IF NOT EXISTS nda_access (id INTEGER PRIMARY KEY AUTOINCREMENT, nda_id TEXT NOT NULL, listing TEXT NOT NULL, status TEXT NOT NULL, requested_at TEXT, decided_at TEXT, UNIQUE(nda_id, listing));
CREATE TABLE IF NOT EXISTS listing_status (listing TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT);
CREATE INDEX IF NOT EXISTS idx_nda_keys_email ON nda_keys(email);
CREATE INDEX IF NOT EXISTS idx_nda_email ON nda(email);
