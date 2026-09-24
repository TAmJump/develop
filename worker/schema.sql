CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  name TEXT, email TEXT, phone TEXT, company TEXT,
  kind TEXT, region TEXT, budget TEXT, message TEXT,
  status TEXT DEFAULT '新規',
  admin_note TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT, ua TEXT, ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_inq_created ON inquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_inq_status ON inquiries(status);

-- ===== NDA 自動締結・解除キー =====
CREATE TABLE IF NOT EXISTS nda (
  id TEXT PRIMARY KEY,
  doc_no TEXT, listing TEXT,
  company TEXT, address TEXT, rep_name TEXT, person TEXT, title TEXT, email TEXT, phone TEXT,
  status TEXT DEFAULT '申請',          -- 申請 / 確認済 / 締結 / 失効
  verified_at TEXT, signer TEXT, signed_at TEXT, doc_hash TEXT, pdf_hash TEXT, text_ver TEXT,
  created_at TEXT, updated_at TEXT, ip TEXT, ua TEXT
);
CREATE INDEX IF NOT EXISTS idx_nda_email ON nda(email, listing);
CREATE INDEX IF NOT EXISTS idx_nda_doc ON nda(doc_no);

CREATE TABLE IF NOT EXISTS nda_keys (
  key_hash TEXT PRIMARY KEY,           -- 解除キーは SHA-256 で保存（平文は保存しない）
  key_tail TEXT, nda_id TEXT, listing TEXT, email TEXT,
  issued_at TEXT, expires_at TEXT, revoked INTEGER DEFAULT 0, last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_keys_nda ON nda_keys(nda_id);

CREATE TABLE IF NOT EXISTS nda_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nda_id TEXT, purpose TEXT, code_hash TEXT, expires_at TEXT,
  tries INTEGER DEFAULT 0, used INTEGER DEFAULT 0, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_codes_nda ON nda_codes(nda_id, purpose);

CREATE TABLE IF NOT EXISTS nda_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT, kind TEXT, key_tail TEXT, nda_id TEXT, listing TEXT, ok INTEGER, ip TEXT, ua TEXT
);
CREATE INDEX IF NOT EXISTS idx_log_ip ON nda_log(ip, at);
CREATE INDEX IF NOT EXISTS idx_log_nda ON nda_log(nda_id);
