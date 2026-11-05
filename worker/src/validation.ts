import { z } from "zod";

export function isValidHost(value: string): boolean {
  const host = value.trim();
  if (!host || host.length > 255 || /[\s/@?#]/.test(host)) return false;

  const unwrapped = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;

  if (unwrapped.includes(":")) {
    try {
      const parsed = new URL(`http://[${unwrapped}]/`);
      return parsed.hostname.length > 2;
    } catch {
      return false;
    }
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(unwrapped)) {
    return unwrapped.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
  }

  const domain = unwrapped.endsWith(".") ? unwrapped.slice(0, -1) : unwrapped;
  if (!domain || domain.length > 253) return false;
  return domain.split(".").every((label) =>
    label.length > 0 && label.length <= 63 &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)
  );
}

const hostField = z.string().trim().min(1).max(255).refine(isValidHost, "آدرس IP یا دامنه معتبر نیست");
const optionalHost = z.string().trim().max(255).nullable().optional().refine(
  (value) => value == null || value === "" || isValidHost(value),
  "دامنه معتبر نیست"
);
const tagsField = z.array(z.string().trim().min(1).max(30)).max(20).default([]);

export const ipSchema = z.object({
  label: z.string().trim().min(1).max(80),
  address: hostField,
  port: z.number().int().min(1).max(65535).nullable().optional(),
  ip_version: z.enum(["IPv4", "IPv6", "Dual Stack"]).default("IPv4"),
  country: z.string().trim().min(1).max(80).default("نامشخص"),
  domain: optionalHost,
  sni: optionalHost,
  network_type: z.string().trim().max(80).nullable().optional(),
  ip_type: z.enum(["اختصاصی", "اشتراکی"]).default("اختصاصی"),
  category: z.string().trim().min(1).max(80).default("عمومی"),
  tags: tagsField,
  notes: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["active", "inactive", "unknown"]).default("unknown")
});

export const proxySchema = z.object({
  name: z.string().trim().min(1).max(80),
  protocol: z.enum(["VLESS", "Trojan", "Shadowsocks", "HTTP", "HTTPS", "SOCKS5", "SSH Tunnel"]),
  transport: z.enum(["TCP", "WebSocket", "HTTP/2", "HTTP/3", "TCP + TLS", "REALITY", "TLS"]),
  ip_id: z.string().trim().min(1).nullable().optional(),
  server_address: hostField,
  port: z.number().int().min(1).max(65535),
  sni: optionalHost,
  priority: z.number().int().min(1).max(999).default(100),
  category: z.string().trim().min(1).max(80).default("عمومی"),
  tags: tagsField,
  status: z.enum(["active", "inactive"]).default("active"),
  notes: z.string().trim().max(1000).nullable().optional()
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(10).max(256)
});

export const adminCreateSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(12).max(256),
  role: z.enum(["admin", "operator", "viewer"])
});

export const adminUpdateSchema = z.object({
  role: z.enum(["owner", "admin", "operator", "viewer"]).optional(),
  is_active: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "حداقل یک فیلد برای تغییر لازم است");

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
}

export function parseStoredTags(value: unknown): string[] {
  if (Array.isArray(value)) return normalizeTags(value.filter((x): x is string => typeof x === "string"));
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed)
      ? normalizeTags(parsed.filter((x): x is string => typeof x === "string"))
      : [];
  } catch {
    return [];
  }
}
