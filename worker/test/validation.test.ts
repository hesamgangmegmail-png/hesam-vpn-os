import { describe, expect, it } from "vitest";
import { adminCreateSchema, ipSchema, isValidHost, normalizeTags, parseStoredTags, proxySchema } from "../src/validation";

describe("host validation", () => {
  it("accepts IPv4, IPv6 and DNS hostnames", () => {
    expect(isValidHost("203.0.113.10")).toBe(true);
    expect(isValidHost("2001:db8::1")).toBe(true);
    expect(isValidHost("edge.example.net")).toBe(true);
  });

  it("rejects malformed hosts", () => {
    expect(isValidHost("999.999.999.999")).toBe(false);
    expect(isValidHost("bad host.example")).toBe(false);
    expect(isValidHost("https://example.net/path")).toBe(false);
  });
});

describe("IP schema", () => {
  it("applies safe defaults and accepts a valid IP record", () => {
    const parsed = ipSchema.safeParse({ label: "فنلاند ۱", address: "203.0.113.10" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("unknown");
      expect(parsed.data.category).toBe("عمومی");
      expect(parsed.data.tags).toEqual([]);
    }
  });

  it("rejects an out-of-range port", () => {
    expect(ipSchema.safeParse({ label: "x", address: "edge.example.net", port: 70000 }).success).toBe(false);
  });
});

describe("proxy schema", () => {
  it("accepts a valid proxy with metadata", () => {
    const parsed = proxySchema.safeParse({
      name: "VLESS test", protocol: "VLESS", transport: "REALITY",
      server_address: "edge.example.net", port: 443, category: "اروپا", tags: ["تست", "اولویت"]
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unsupported protocols and ports", () => {
    const base = { name: "x", protocol: "UNKNOWN", transport: "TCP", server_address: "edge.example.net", port: 443 };
    expect(proxySchema.safeParse(base).success).toBe(false);
    expect(proxySchema.safeParse({ ...base, protocol: "VLESS", port: 0 }).success).toBe(false);
  });
});

describe("admin and tag validation", () => {
  it("requires a strong enough password and safe username", () => {
    expect(adminCreateSchema.safeParse({ username: "operator_1", password: "a-strong-password", role: "operator" }).success).toBe(true);
    expect(adminCreateSchema.safeParse({ username: "x", password: "short", role: "owner" }).success).toBe(false);
  });

  it("normalizes duplicate tags and tolerates invalid stored JSON", () => {
    expect(normalizeTags([" edge ", "edge", "", "اروپا"])).toEqual(["edge", "اروپا"]);
    expect(parseStoredTags("not-json")).toEqual([]);
  });
});
