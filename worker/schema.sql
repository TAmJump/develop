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
