PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS proxy_ips (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  port INTEGER,
  ip_version TEXT NOT NULL DEFAULT 'IPv4' CHECK (ip_version IN ('IPv4','IPv6','Dual Stack')),
  country TEXT NOT NULL DEFAULT 'نامشخص',
  domain TEXT,
  sni TEXT,
  network_type TEXT,
  ip_type TEXT NOT NULL DEFAULT 'اختصاصی' CHECK (ip_type IN ('اختصاصی','اشتراکی')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('active','inactive','unknown')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proxies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'TCP',
  ip_id TEXT,
  server_address TEXT NOT NULL,
  port INTEGER NOT NULL,
  sni TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  category TEXT NOT NULL DEFAULT 'عمومی',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ip_id) REFERENCES proxy_ips(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ip_tests (
  id TEXT PRIMARY KEY,
  ip_id TEXT NOT NULL,
  test_type TEXT NOT NULL,
  result TEXT NOT NULL,
  latency_ms REAL,
  details TEXT,
  tested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ip_id) REFERENCES proxy_ips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proxy_ips_address ON proxy_ips(address);
CREATE INDEX IF NOT EXISTS idx_proxies_protocol ON proxies(protocol);
CREATE INDEX IF NOT EXISTS idx_proxies_status ON proxies(status);
CREATE INDEX IF NOT EXISTS idx_ip_tests_ip_id ON ip_tests(ip_id);
