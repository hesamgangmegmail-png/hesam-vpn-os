import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  adminCreateSchema,
  adminUpdateSchema,
  ipSchema,
  loginSchema,
  normalizeTags,
  parseStoredTags,
  proxySchema
} from "./validation";

type Role = "owner" | "admin" | "operator" | "viewer";
type Admin = { id: string; username: string; role: Role; sessionId: string };
type Env = {
  DB: D1Database;
  APP_NAME?: string;
  PANEL_ORIGIN?: string;
  ADDITIONAL_ALLOWED_ORIGINS?: string;
  BOOTSTRAP_ADMIN_USERNAME?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
};
type Variables = { admin: Admin };
type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const SESSION_HOURS = 12;
const PASSWORD_ITERATIONS = 100_000;

function id(): string { return crypto.randomUUID(); }
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsRaw, saltRaw, hashRaw] = stored.split("$");
  if (algorithm !== "pbkdf2" || !iterationsRaw || !saltRaw || !hashRaw) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 50_000 || iterations > 500_000) return false;
  const salt = base64UrlToBytes(saltRaw);
  const expected = base64UrlToBytes(hashRaw);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, expected.length * 8));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < actual.length; index++) diff |= actual[index] ^ expected[index];
  return diff === 0;
}
function allowedOrigins(env: Env): string[] {
  return [env.PANEL_ORIGIN, ...(env.ADDITIONAL_ALLOWED_ORIGINS ?? "").split(",")]
    .map((origin) => (origin ?? "").trim().replace(/\/$/, ""))
    .filter(Boolean);
}
async function audit(
  db: D1Database,
  admin: Pick<Admin, "username" | "role"> | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: unknown = null
): Promise<void> {
  await db.prepare(`INSERT INTO audit_logs
    (id,action,entity_type,entity_id,details,actor_username,actor_role)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(id(), action, entityType, entityId, details == null ? null : JSON.stringify(details), admin?.username ?? null, admin?.role ?? null)
    .run();
}
async function clientKey(c: { req: { header(name: string): string | undefined } }): Promise<string> {
  const raw = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
  return sha256(raw);
}
async function consumeRateLimit(db: D1Database, key: string, limit: number, periodSeconds: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / periodSeconds) * periodSeconds;
  const row = await db.prepare(`INSERT INTO rate_limits (bucket_key,window_start,request_count)
    VALUES (?,?,1)
    ON CONFLICT(bucket_key) DO UPDATE SET
      request_count=CASE WHEN rate_limits.window_start=excluded.window_start THEN rate_limits.request_count+1 ELSE 1 END,
      window_start=excluded.window_start
    RETURNING request_count,window_start`)
    .bind(key, windowStart)
    .first<{ request_count: number; window_start: number }>();
  const count = Number(row?.request_count ?? limit + 1);
  return { allowed: count <= limit, retryAfter: Math.max(1, windowStart + periodSeconds - now) };
}
function errorResponse(c: AppContext, status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503, error: string, details?: unknown) {
  return c.json(details === undefined ? { error } : { error, details }, status);
}
function requireRole(admin: Admin, roles: Role[]): boolean { return roles.includes(admin.role); }
async function ensureIpExists(db: D1Database, ipId: string | null | undefined): Promise<boolean> {
  if (!ipId) return true;
  return Boolean(await db.prepare("SELECT id FROM proxy_ips WHERE id=?").bind(ipId).first());
}

// Reject browser origins that are not explicitly configured. Non-browser clients without Origin still use bearer sessions.
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin && !allowedOrigins(c.env).includes(origin.replace(/\/$/, ""))) {
    return errorResponse(c, 403, "ORIGIN_NOT_ALLOWED");
  }
  await next();
});
app.use("/api/*", cors({
  origin: (origin, c) => allowedOrigins(c.env).includes(origin.replace(/\/$/, "")) ? origin : undefined,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 600
}));
app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health" || c.req.method === "OPTIONS") return next();
  try {
    const key = await clientKey(c);
    const result = await consumeRateLimit(c.env.DB, `api:${key}`, 120, 60);
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfter));
      return errorResponse(c, 429, "RATE_LIMITED");
    }
    await next();
  } catch (error) {
    console.error("Rate limit check failed", error);
    return errorResponse(c, 503, "RATE_LIMIT_UNAVAILABLE");
  }
});

app.get("/api/health", (c) => c.json({
  ok: true,
  app: c.env.APP_NAME ?? "HESAM VPN OS",
  mode: "control-panel",
  vpnNodeConnected: false,
  auth: "session-based",
  corsConfigured: allowedOrigins(c.env).length > 0
}));

app.post("/api/auth/login", async (c) => {
  const client = await clientKey(c);
  const limit = await consumeRateLimit(c.env.DB, `login:${client}`, 8, 900);
  if (!limit.allowed) {
    c.header("Retry-After", String(limit.retryAfter));
    return errorResponse(c, 429, "LOGIN_RATE_LIMITED");
  }
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return errorResponse(c, 400, "INVALID_INPUT", parsed.error.flatten());

  let admin = await c.env.DB.prepare("SELECT id,username,password_hash,role,is_active FROM admins WHERE username=?")
    .bind(parsed.data.username)
    .first<{ id: string; username: string; password_hash: string; role: Role; is_active: number }>();

  if (!admin) {
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM admins").first<{ total: number }>();
    if (Number(count?.total ?? 0) === 0) {
      const bootstrapUsername = c.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin";
      const bootstrapPassword = c.env.BOOTSTRAP_ADMIN_PASSWORD;
      if (!bootstrapPassword) return errorResponse(c, 503, "BOOTSTRAP_ADMIN_NOT_CONFIGURED");
      if (parsed.data.username !== bootstrapUsername || parsed.data.password !== bootstrapPassword) {
        return errorResponse(c, 401, "INVALID_CREDENTIALS");
      }
      const adminId = id();
      const passwordHash = await hashPassword(bootstrapPassword);
      try {
        await c.env.DB.prepare("INSERT INTO admins (id,username,password_hash,role) VALUES (?,?,?,'owner')")
          .bind(adminId, bootstrapUsername, passwordHash).run();
      } catch {
        // A parallel first login may have created the bootstrap account; re-read it below.
      }
      admin = await c.env.DB.prepare("SELECT id,username,password_hash,role,is_active FROM admins WHERE username=?")
        .bind(bootstrapUsername)
        .first<{ id: string; username: string; password_hash: string; role: Role; is_active: number }>();
    }
  }

  if (!admin || admin.is_active !== 1 || !(await verifyPassword(parsed.data.password, admin.password_hash))) {
    return errorResponse(c, 401, "INVALID_CREDENTIALS");
  }

  const rawSession = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const sessionId = await sha256(rawSession);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  await c.env.DB.prepare("INSERT INTO admin_sessions (id,admin_id,expires_at) VALUES (?,?,?)")
    .bind(sessionId, admin.id, expiresAt).run();
  await audit(c.env.DB, { username: admin.username, role: admin.role }, "login", "admin", admin.id);
  return c.json({ token: rawSession, expiresAt, admin: { id: admin.id, username: admin.username, role: admin.role } });
});

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health" || c.req.path === "/api/auth/login") return next();
  const bearer = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return errorResponse(c, 401, "UNAUTHORIZED");
  const sessionId = await sha256(bearer);
  const row = await c.env.DB.prepare(`SELECT s.id AS session_id,a.id,a.username,a.role,a.is_active
    FROM admin_sessions s JOIN admins a ON a.id=s.admin_id
    WHERE s.id=? AND s.expires_at>?`)
    .bind(sessionId, new Date().toISOString())
    .first<{ session_id: string; id: string; username: string; role: Role; is_active: number }>();
  if (!row || row.is_active !== 1) return errorResponse(c, 401, "SESSION_INVALID");
  c.set("admin", { id: row.id, username: row.username, role: row.role, sessionId: row.session_id });
  await next();
});

app.use("/api/*", async (c, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method) || c.req.path === "/api/auth/logout") return next();
  const admin = c.get("admin");
  if (!requireRole(admin, ["owner", "admin", "operator"])) return errorResponse(c, 403, "ROLE_FORBIDDEN");
  await next();
});

app.get("/api/auth/me", (c) => {
  const admin = c.get("admin");
  return c.json({ admin: { id: admin.id, username: admin.username, role: admin.role } });
});

app.post("/api/auth/logout", async (c) => {
  const admin = c.get("admin");
  await c.env.DB.prepare("DELETE FROM admin_sessions WHERE id=?").bind(admin.sessionId).run();
  await audit(c.env.DB, admin, "logout", "admin", admin.id);
  return c.json({ ok: true });
});

// Admin account management is owner-only. Passwords are PBKDF2 hashes; raw passwords are never stored.
app.get("/api/admins", async (c) => {
  const admin = c.get("admin");
  if (!requireRole(admin, ["owner"])) return errorResponse(c, 403, "ROLE_FORBIDDEN");
  const { results } = await c.env.DB.prepare("SELECT id,username,role,is_active,created_at,updated_at FROM admins ORDER BY created_at ASC").all();
  return c.json(results);
});
app.post("/api/admins", async (c) => {
  const actor = c.get("admin");
  if (!requireRole(actor, ["owner"])) return errorResponse(c, 403, "ROLE_FORBIDDEN");
  const parsed = adminCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return errorResponse(c, 400, "INVALID_INPUT", parsed.error.flatten());
  const key = id();
  try {
    await c.env.DB.prepare("INSERT INTO admins (id,username,password_hash,role) VALUES (?,?,?,?)")
      .bind(key, parsed.data.username, await hashPassword(parsed.data.password), parsed.data.role).run();
  } catch {
    return errorResponse(c, 409, "USERNAME_ALREADY_EXISTS");
  }
  await audit(c.env.DB, actor, "create", "admin", key, { username: parsed.data.username, role: parsed.data.role });
  return c.json({ id: key, username: parsed.data.username, role: parsed.data.role, is_active: 1 }, 201);
});
app.patch("/api/admins/:id", async (c) => {
  const actor = c.get("admin");
  if (!requireRole(actor, ["owner"])) return errorResponse(c, 403, "ROLE_FORBIDDEN");
  const parsed = adminUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return errorResponse(c, 400, "INVALID_INPUT", parsed.error.flatten());
  const targetId = c.req.param("id");
  const target = await c.env.DB.prepare("SELECT id,username,role,is_active FROM admins WHERE id=?").bind(targetId)
    .first<{ id: string; username: string; role: Role; is_active: number }>();
  if (!target) return errorResponse(c, 404, "NOT_FOUND");
  if (target.id === actor.id && parsed.data.is_active === false) return errorResponse(c, 400, "CANNOT_DISABLE_SELF");
  if (target.role === "owner" && ((parsed.data.role && parsed.data.role !== "owner") || parsed.data.is_active === false)) {
    const owners = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM admins WHERE role='owner' AND is_active=1").first<{ total: number }>();
    if (Number(owners?.total ?? 0) <= 1) return errorResponse(c, 400, "LAST_OWNER_REQUIRED");
  }
  await c.env.DB.prepare("UPDATE admins SET role=COALESCE(?,role),is_active=COALESCE(?,is_active),updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(parsed.data.role ?? null, parsed.data.is_active === undefined ? null : Number(parsed.data.is_active), targetId).run();
  if (parsed.data.is_active === false) await c.env.DB.prepare("DELETE FROM admin_sessions WHERE admin_id=?").bind(targetId).run();
  await audit(c.env.DB, actor, "update", "admin", targetId, parsed.data);
  return c.json({ ok: true });
});

app.get("/api/audit-logs", async (c) => {
  const admin = c.get("admin");
  if (!requireRole(admin, ["owner", "admin"])) return errorResponse(c, 403, "ROLE_FORBIDDEN");
  const requested = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(requested) ? Math.min(200, Math.max(1, Math.trunc(requested))) : 50;
  const { results } = await c.env.DB.prepare(`SELECT id,action,entity_type,entity_id,details,actor_username,actor_role,created_at
    FROM audit_logs ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
  return c.json(results);
});

app.get("/api/ips", async (c) => {
  const filters = {
    country: c.req.query("country"),
    status: c.req.query("status"),
    ipVersion: c.req.query("ip_version"),
    query: c.req.query("q")
  };
  const where: string[] = [];
  const values: string[] = [];
  if (filters.country) { where.push("country=?"); values.push(filters.country); }
  if (filters.status) { where.push("status=?"); values.push(filters.status); }
  if (filters.ipVersion) { where.push("ip_version=?"); values.push(filters.ipVersion); }
  if (filters.query) { where.push("(label LIKE ? OR address LIKE ? OR domain LIKE ?)"); values.push(`%${filters.query}%`, `%${filters.query}%`, `%${filters.query}%`); }
  const sql = `SELECT * FROM proxy_ips ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  const { results } = await c.env.DB.prepare(sql).bind(...values).all<Record<string, unknown>>();
  return c.json(results.map((row) => ({ ...row, tags: parseStoredTags(row.tags) })));
});

app.post("/api/ips", async (c) => {
  const parsed = ipSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return errorResponse(c, 400, "INVALID_INPUT", parsed.error.flatten());
  const value = parsed.data;
  const key = id();
  await c.env.DB.prepare(`INSERT INTO proxy_ips
    (id,label,address,port,ip_version,country,domain,sni,network_type,ip_type,category,tags,notes,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(key, value.label, value.address, value.port ?? null, value.ip_version, value.country,
      value.domain || null, value.sni || null, value.network_type ?? null, value.ip_type,
      value.category, JSON.stringify(normalizeTags(value.tags)), value.notes ?? null, value.status).run();
  await audit(c.env.DB, c.get("admin"), "create", "ip", key, { address: value.address, country: value.country });
  return c.json({ id: key, ...value, tags: normalizeTags(value.tags) }, 201);
});

app.put("/api/ips/:id", async (c) => {
  const parsed = ipSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return errorResponse(c, 400, "INVALID_INPUT", parsed.error.flatten());
  const key = c.req.param("id");
  const current = await c.env.DB.prepare("SELECT * FROM proxy_ips WHERE id=?").bind(key).first<Record<string, unknown>>();
  if (!current) return errorResponse(c, 404, "NOT_FOUND");
  const merged = ipSchema.parse({ ...current, tags: parseStoredTags(current.tags), ...parsed.data });
  await c.env.DB.prepare(`UPDATE proxy_ips SET label=?,address=?,port=?,ip_version=?,country=?,domain=?,sni=?,network_type=?,ip_type=?,category=?,tags=?,notes=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(merged.label, merged.address, merged.port ?? null, merged.ip_version, merged.country,
      merged.domain || null, merged.sni || null, merged.network_type ?? null, merged.ip_type,
      merged.category, JSON.stringify(normalizeTags(merged.tags)), merged.notes ?? null, merged.status, key).run();
  await audit(c.env.DB, c.get("admin"), "update", "ip", key, { address: merged.address, country: merged.country });
  return c.json({ id: key, ...merged, tags: normalizeTags(merged.tags) });
});

app.delete("/api/ips/:id", async (c) => {
  const key = c.req.param("id");
  const current = await c.env.DB.prepare("SELECT id,address FROM proxy_ips WHERE id=?").bind(key).first<{ id: string; address: string }>();
  if (!current) return errorResponse(c, 404, "NOT_FOUND");
  await c.env.DB.prepare("DELETE FROM proxy_ips WHERE id=?").bind(key).run();
  await audit(c.env.DB, c.get("admin"), "delete", "ip", key, { address: current.address });
  return c.json({ ok: true });
});

app.get("/api/proxies", async (c) => {
  const filters = {
    country: c.req.query("country"),
    protocol: c.req.query("protocol"),
    status: c.req.query("status"),
    category: c.req.query("category"),
    tag: c.req.query("tag"),
    query: c.req.query("q")
  };
  const where: string[] = [];
  const values: string[] = [];
  if (filters.country) { where.push("pi.country=?"); values.push(filters.country); }
  if (filters.protocol) { where.push("p.protocol=?"); values.push(filters.protocol); }
  if (filters.status) { where.push("p.status=?"); values.push(filters.status); }
  if (filters.category) { where.push("p.category=?"); values.push(filters.category); }
  if (filters.tag) { where.push("EXISTS (SELECT 1 FROM json_each(p.tags) WHERE value=?)"); values.push(filters.tag); }
  if (filters.query) {
    where.push("(p.name LIKE ? OR p.server_address LIKE ? OR p.protocol LIKE ? OR p.category LIKE ?)");
    values.push(...Array(4).fill(`%${filters.query}%`));
  }
  const sql = `SELECT p.*,pi.country AS ip_country FROM proxies p LEFT JOIN proxy_ips pi ON pi.id=p.ip_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.priority ASC,p.created_at DESC`;
  const { results } = await c.env.DB.prepare(sql).bind(...values).all<Record<string, unknown>>();
  return c.json(results.map((row) => ({ ...row, tags: parseStoredTags(row.tags) })));
});

app.post("/api/proxies", async (c) => {
  const parsed = proxySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return errorResponse(c, 400, "INVALID_INPUT", parsed.error.flatten());
  const value = parsed.data;
  if (!(await ensureIpExists(c.env.DB, value.ip_id))) return errorResponse(c, 400, "IP_NOT_FOUND");
  const key = id();
  await c.env.DB.prepare(`INSERT INTO proxies
    (id,name,protocol,transport,ip_id,server_address,port,sni,priority,category,tags,status,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(key, value.name, value.protocol, value.transport, value.ip_id ?? null, value.server_address,
      value.port, value.sni || null, value.priority, value.category, JSON.stringify(normalizeTags(value.tags)), value.status, value.notes ?? null).run();
  await audit(c.env.DB, c.get("admin"), "create", "proxy", key, { name: value.name, protocol: value.protocol });
  return c.json({ id: key, ...value, tags: normalizeTags(value.tags) }, 201);
});

app.put("/api/proxies/:id", async (c) => {
  const parsed = proxySchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return errorResponse(c, 400, "INVALID_INPUT", parsed.error.flatten());
  const key = c.req.param("id");
  const current = await c.env.DB.prepare("SELECT * FROM proxies WHERE id=?").bind(key).first<Record<string, unknown>>();
  if (!current) return errorResponse(c, 404, "NOT_FOUND");
  const merged = proxySchema.parse({ ...current, tags: parseStoredTags(current.tags), ...parsed.data });
  if (!(await ensureIpExists(c.env.DB, merged.ip_id))) return errorResponse(c, 400, "IP_NOT_FOUND");
  await c.env.DB.prepare(`UPDATE proxies SET name=?,protocol=?,transport=?,ip_id=?,server_address=?,port=?,sni=?,priority=?,category=?,tags=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(merged.name, merged.protocol, merged.transport, merged.ip_id ?? null, merged.server_address,
      merged.port, merged.sni || null, merged.priority, merged.category, JSON.stringify(normalizeTags(merged.tags)),
      merged.status, merged.notes ?? null, key).run();
  await audit(c.env.DB, c.get("admin"), "update", "proxy", key, { name: merged.name, protocol: merged.protocol });
  return c.json({ id: key, ...merged, tags: normalizeTags(merged.tags) });
});

app.put("/api/proxies/:id/status", async (c) => {
  const body = z.object({ status: z.enum(["active", "inactive"]) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return errorResponse(c, 400, "INVALID_INPUT", body.error.flatten());
  const key = c.req.param("id");
  const current = await c.env.DB.prepare("SELECT id FROM proxies WHERE id=?").bind(key).first();
  if (!current) return errorResponse(c, 404, "NOT_FOUND");
  await c.env.DB.prepare("UPDATE proxies SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.data.status, key).run();
  await audit(c.env.DB, c.get("admin"), "status", "proxy", key, body.data);
  return c.json({ ok: true });
});

app.delete("/api/proxies/:id", async (c) => {
  const key = c.req.param("id");
  const current = await c.env.DB.prepare("SELECT id,name FROM proxies WHERE id=?").bind(key).first<{ id: string; name: string }>();
  if (!current) return errorResponse(c, 404, "NOT_FOUND");
  await c.env.DB.prepare("DELETE FROM proxies WHERE id=?").bind(key).run();
  await audit(c.env.DB, c.get("admin"), "delete", "proxy", key, { name: current.name });
  return c.json({ ok: true });
});

app.get("/api/export/proxies.json", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT p.name,p.protocol,p.transport,p.server_address,p.port,p.sni,p.priority,p.category,p.tags,p.status,pi.country
    FROM proxies p LEFT JOIN proxy_ips pi ON pi.id=p.ip_id ORDER BY p.priority`).all<Record<string, unknown>>();
  const payload = results.map((row) => ({ ...row, tags: parseStoredTags(row.tags) }));
  return c.json(payload, 200, { "Content-Disposition": "attachment; filename=hesam-proxies.json" });
});

app.notFound((c) => errorResponse(c, 404, "NOT_FOUND"));
app.onError((err, c) => {
  console.error("HESAM VPN OS API error", err);
  return errorResponse(c, 500, "INTERNAL_ERROR");
});

export { app };
export default app;
