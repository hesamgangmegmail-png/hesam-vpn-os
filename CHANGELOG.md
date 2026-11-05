# Changelog

## 0.2.0 — 2026-11-05

- Added full edit APIs and forms for IP records and proxies.
- Added country/protocol/status filters and category/tag metadata.
- Added PBKDF2 password hashes, hashed 12-hour sessions, role checks, logout and admin-management endpoints.
- Restricted CORS to explicitly configured origins.
- Added D1-backed per-IP request/login rate limits and audit event recording.
- Added additive D1 migration `0002_v02_admin_and_metadata.sql`.
- Added Vitest unit tests for input validation.
- Kept VPN runtime and active network measurements marked as not implemented until a real VPN Node exists.
