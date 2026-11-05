import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity, ArrowDownToLine, Boxes, Cable, Globe2, KeyRound, LayoutDashboard,
  LogOut, Pencil, Plus, RefreshCw, Search, Server, ShieldCheck, Trash2, Wifi
} from "lucide-react";

type Role = "owner" | "admin" | "operator" | "viewer";
type Admin = { id: string; username: string; role: Role };
type ProxyItem = {
  id: string; name: string; protocol: string; transport: string; ip_id?: string | null;
  server_address: string; port: number; priority: number; category: string; tags: string[];
  status: "active" | "inactive"; sni?: string | null; notes?: string | null; ip_country?: string | null;
};
type IpItem = {
  id: string; label: string; address: string; port?: number | null; country: string;
  ip_version: string; ip_type: string; status: string; domain?: string | null; sni?: string | null;
  network_type?: string | null; category: string; tags: string[]; notes?: string | null;
};
type ProxyFormState = {
  name: string; protocol: string; transport: string; ip_id: string; server_address: string;
  port: string; priority: string; category: string; tags: string; sni: string; status: string; notes: string;
};
type IpFormState = {
  label: string; address: string; port: string; country: string; ip_version: string; ip_type: string;
  status: string; domain: string; sni: string; network_type: string; category: string; tags: string; notes: string;
};

const API = (import.meta as any).env.VITE_API_BASE || "";
const countries = ["آلمان", "فنلاند", "هلند", "سوئیس", "آمریکا", "انگلستان", "سوئد", "کانادا", "ژاپن", "سنگاپور", "ترکیه", "امارات", "لهستان", "ایتالیا"];
const protocols = ["VLESS", "Trojan", "Shadowsocks", "HTTP", "HTTPS", "SOCKS5", "SSH Tunnel"];
const transports = ["TCP", "WebSocket", "HTTP/2", "HTTP/3", "TLS", "TCP + TLS", "REALITY"];
const newProxyForm = (): ProxyFormState => ({ name: "", protocol: "VLESS", transport: "TCP", ip_id: "", server_address: "", port: "443", priority: "100", category: "عمومی", tags: "", sni: "", status: "active", notes: "" });
const newIpForm = (): IpFormState => ({ label: "", address: "", port: "", country: "آلمان", ip_version: "IPv4", ip_type: "اختصاصی", status: "unknown", domain: "", sni: "", network_type: "", category: "عمومی", tags: "", notes: "" });
const toTags = (value: string) => [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);

export default function App() {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [currentAdmin, setCurrentAdmin] = useState<Admin | null>(null);
  const [tab, setTab] = useState("dashboard");
  const [proxies, setProxies] = useState<ProxyItem[]>([]);
  const [ips, setIps] = useState<IpItem[]>([]);
  const [query, setQuery] = useState("");
  const [proxyCountryFilter, setProxyCountryFilter] = useState("");
  const [proxyProtocolFilter, setProxyProtocolFilter] = useState("");
  const [proxyStatusFilter, setProxyStatusFilter] = useState("");
  const [ipCountryFilter, setIpCountryFilter] = useState("");
  const [ipStatusFilter, setIpStatusFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showProxy, setShowProxy] = useState(false);
  const [showIp, setShowIp] = useState(false);
  const [editingProxyId, setEditingProxyId] = useState<string | null>(null);
  const [editingIpId, setEditingIpId] = useState<string | null>(null);
  const [proxyForm, setProxyForm] = useState<ProxyFormState>(newProxyForm());
  const [ipForm, setIpForm] = useState<IpFormState>(newIpForm());

  async function request(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API}/api${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
    return body;
  }

  async function load() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const [proxyRows, ipRows] = await Promise.all([request("/proxies"), request("/ips")]);
      setProxies(proxyRows);
      setIps(ipRows);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "خطای نامشخص";
      setError(message === "SESSION_INVALID" || message === "UNAUTHORIZED" ? "نشست مدیر معتبر نیست؛ دوباره وارد شو." : message);
      if (message === "SESSION_INVALID" || message === "UNAUTHORIZED") {
        setToken("");
        setCurrentAdmin(null);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { if (token) void load(); }, [token]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      setCurrentAdmin(body.admin);
      setToken(body.token);
      setPassword("");
      setNotice("ورود موفق بود؛ نشست تا ۱۲ ساعت اعتبار دارد.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "خطای نامشخص";
      setError(message === "INVALID_CREDENTIALS" ? "نام کاربری یا رمز عبور درست نیست." : message === "BOOTSTRAP_ADMIN_NOT_CONFIGURED" ? "رمز اولیه مدیر در Cloudflare تنظیم نشده است." : message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try { await request("/auth/logout", { method: "POST", body: "{}" }); } catch { /* نشست ممکن است قبلاً منقضی شده باشد */ }
    setToken("");
    setCurrentAdmin(null);
    setProxies([]);
    setIps([]);
    setNotice("از پنل خارج شدی.");
  }

  const canWrite = currentAdmin ? ["owner", "admin", "operator"].includes(currentAdmin.role) : false;
  const canDelete = currentAdmin ? ["owner", "admin"].includes(currentAdmin.role) : false;
  const active = proxies.filter((proxy) => proxy.status === "active").length;

  const filteredProxies = useMemo(() => proxies.filter((proxy) => {
    const linkedCountry = proxy.ip_country || ips.find((ip) => ip.id === proxy.ip_id)?.country || "";
    const haystack = `${proxy.name} ${proxy.protocol} ${proxy.server_address} ${proxy.category} ${proxy.tags.join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase())
      && (!proxyCountryFilter || linkedCountry === proxyCountryFilter)
      && (!proxyProtocolFilter || proxy.protocol === proxyProtocolFilter)
      && (!proxyStatusFilter || proxy.status === proxyStatusFilter);
  }), [proxies, ips, query, proxyCountryFilter, proxyProtocolFilter, proxyStatusFilter]);

  const filteredIps = useMemo(() => ips.filter((ip) =>
    (!ipCountryFilter || ip.country === ipCountryFilter) && (!ipStatusFilter || ip.status === ipStatusFilter)
  ), [ips, ipCountryFilter, ipStatusFilter]);

  function openNewProxy() { setEditingProxyId(null); setProxyForm(newProxyForm()); setShowProxy(true); }
  function openEditProxy(proxy: ProxyItem) {
    setEditingProxyId(proxy.id);
    setProxyForm({
      name: proxy.name, protocol: proxy.protocol, transport: proxy.transport, ip_id: proxy.ip_id || "",
      server_address: proxy.server_address, port: String(proxy.port), priority: String(proxy.priority),
      category: proxy.category || "عمومی", tags: (proxy.tags || []).join(", "), sni: proxy.sni || "",
      status: proxy.status, notes: proxy.notes || ""
    });
    setShowProxy(true);
  }
  function openNewIp() { setEditingIpId(null); setIpForm(newIpForm()); setShowIp(true); }
  function openEditIp(ip: IpItem) {
    setEditingIpId(ip.id);
    setIpForm({
      label: ip.label, address: ip.address, port: ip.port == null ? "" : String(ip.port), country: ip.country,
      ip_version: ip.ip_version, ip_type: ip.ip_type, status: ip.status, domain: ip.domain || "", sni: ip.sni || "",
      network_type: ip.network_type || "", category: ip.category || "عمومی", tags: (ip.tags || []).join(", "), notes: ip.notes || ""
    });
    setShowIp(true);
  }

  async function saveProxy(event: FormEvent) {
    event.preventDefault();
    const payload = {
      ...proxyForm,
      ip_id: proxyForm.ip_id || null,
      port: Number(proxyForm.port),
      priority: Number(proxyForm.priority),
      sni: proxyForm.sni.trim() || null,
      notes: proxyForm.notes.trim() || null,
      tags: toTags(proxyForm.tags)
    };
    try {
      await request(editingProxyId ? `/proxies/${editingProxyId}` : "/proxies", {
        method: editingProxyId ? "PUT" : "POST", body: JSON.stringify(payload)
      });
      setShowProxy(false);
      setNotice(editingProxyId ? "اطلاعات پروکسی ویرایش شد." : "پروکسی ثبت شد.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "خطا در ذخیره پروکسی"); }
  }

  async function saveIp(event: FormEvent) {
    event.preventDefault();
    const payload = {
      ...ipForm,
      port: ipForm.port ? Number(ipForm.port) : null,
      domain: ipForm.domain.trim() || null,
      sni: ipForm.sni.trim() || null,
      network_type: ipForm.network_type.trim() || null,
      notes: ipForm.notes.trim() || null,
      tags: toTags(ipForm.tags)
    };
    try {
      await request(editingIpId ? `/ips/${editingIpId}` : "/ips", {
        method: editingIpId ? "PUT" : "POST", body: JSON.stringify(payload)
      });
      setShowIp(false);
      setNotice(editingIpId ? "اطلاعات IP ویرایش شد." : "IP ثبت شد.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "خطا در ذخیره IP"); }
  }

  async function toggleProxy(proxy: ProxyItem) {
    try {
      await request(`/proxies/${proxy.id}/status`, { method: "PUT", body: JSON.stringify({ status: proxy.status === "active" ? "inactive" : "active" }) });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "خطا در تغییر وضعیت"); }
  }

  async function removeProxy(proxy: ProxyItem) {
    if (!confirm(`پروکسی «${proxy.name}» حذف شود؟`)) return;
    try { await request(`/proxies/${proxy.id}`, { method: "DELETE" }); setNotice("پروکسی حذف شد."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "خطا در حذف پروکسی"); }
  }

  async function removeIp(ip: IpItem) {
    if (!confirm(`IP «${ip.address}» حذف شود؟ پروکسی‌های متصل به آن بدون IP باقی می‌مانند.`)) return;
    try { await request(`/ips/${ip.id}`, { method: "DELETE" }); setNotice("IP حذف شد."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "خطا در حذف IP"); }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(proxies, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "hesam-proxies.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!token) return <main className="login-wrap">
    <section className="login-card">
      <div className="brand-mark"><ShieldCheck size={34}/></div>
      <p className="eyebrow">SECURE CONTROL PANEL / V0.2</p>
      <h1>HESAM VPN OS</h1>
      <p className="muted">با حساب مدیر وارد شو. نشست ورود فقط در حافظه همین صفحه نگهداری می‌شود.</p>
      {error && <div className="alert error">{error}</div>}
      <form onSubmit={login}>
        <label>نام کاربری</label>
        <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required/>
        <label>رمز عبور</label>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required/>
        <button className="primary wide" disabled={busy}><KeyRound size={17}/> {busy ? "در حال ورود..." : "ورود امن"}</button>
      </form>
      <p className="hint">اجرای واقعی VPN هنوز به اتصال VPN Node مستقل نیاز دارد.</p>
    </section>
  </main>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark small"><ShieldCheck/></div><div><b>HESAM VPN OS</b><small>CYBER EDITION / V0.2</small></div></div>
      <div className="side-label">مدیریت اصلی</div>
      <button className={tab === "dashboard" ? "nav active" : "nav"} onClick={() => setTab("dashboard")}><LayoutDashboard/>داشبورد</button>
      <button className={tab === "proxies" ? "nav active" : "nav"} onClick={() => setTab("proxies")}><Cable/>مدیریت پروکسی</button>
      <button className={tab === "ips" ? "nav active" : "nav"} onClick={() => setTab("ips")}><Globe2/>مدیریت IP</button>
      <button className={tab === "servers" ? "nav active" : "nav"} onClick={() => setTab("servers")}><Server/>سرورها</button>
      <div className="sidebar-bottom">
        <span className="status-dot"></span> نشست امن فعال
        <div className="admin-chip">{currentAdmin?.username} · {roleLabel(currentAdmin?.role)}</div>
        <button className="logout-btn" onClick={logout}><LogOut size={15}/> خروج امن</button>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><p className="eyebrow">CONTROL CENTER / {tab.toUpperCase()}</p><h2>{tab === "dashboard" ? "داشبورد مدیریتی" : tab === "proxies" ? "مدیریت پروکسی‌ها" : tab === "ips" ? "مدیریت IPها" : "سرورهای VPN"}</h2></div>
        <div className="top-actions"><span className="pill"><span className="status-dot"/> پنل مدیریتی</span><button className="icon-btn" onClick={load} title="به‌روزرسانی" disabled={busy}><RefreshCw size={18}/></button></div>
      </header>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success" onClick={() => setNotice("")}>{notice} ×</div>}

      {tab === "dashboard" && <>
        <div className="hero"><div><span className="eyebrow">PROXY CENTER / V0.2</span><h1>مدیریت هوشمند پروکسی‌ها</h1><p>مدیریت اطلاعات IP، پروتکل‌ها، دسته‌ها و برچسب‌ها</p></div><div className="hero-icon"><Activity size={54}/></div></div>
        <div className="stats"><Stat icon={<Boxes/>} label="کل پروکسی‌ها" value={proxies.length}/><Stat icon={<Wifi/>} label="پروکسی فعال" value={active}/><Stat icon={<Globe2/>} label="IP ثبت‌شده" value={ips.length}/><Stat icon={<Server/>} label="نود متصل" value="۰"/></div>
        <div className="panel"><div className="panel-head"><h3>آخرین پروکسی‌ها</h3><button className="text-btn" onClick={() => setTab("proxies")}>مشاهده همه</button></div><ProxyTable items={proxies.slice(0, 5)} onToggle={toggleProxy} onEdit={openEditProxy} onDelete={removeProxy} canWrite={canWrite} canDelete={canDelete}/></div>
        <div className="notice-box"><ShieldCheck/><div><b>وضعیت زیرساخت</b><p>مدیریت داده‌ها و احراز هویت فعال است. اجرای واقعی پروتکل‌ها تا اتصال VPN Node فعال نیست.</p></div></div>
      </>}

      {tab === "proxies" && <div className="panel">
        <div className="panel-head"><div><h3>فهرست پروکسی‌ها</h3><p className="muted">ویرایش کامل، فیلتر و برچسب‌گذاری</p></div><div className="actions"><button className="secondary" onClick={downloadJson}><ArrowDownToLine size={16}/> JSON</button>{canWrite && <button className="primary" onClick={openNewProxy}><Plus size={17}/> افزودن پروکسی</button>}</div></div>
        <div className="search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجو بر اساس نام، IP، پروتکل، دسته یا برچسب..."/></div>
        <div className="filter-row">
          <Field label="کشور"><select value={proxyCountryFilter} onChange={(event) => setProxyCountryFilter(event.target.value)}><option value="">همه کشورها</option>{countries.map((country) => <option key={country} value={country}>{country}</option>)}</select></Field>
          <Field label="پروتکل"><select value={proxyProtocolFilter} onChange={(event) => setProxyProtocolFilter(event.target.value)}><option value="">همه پروتکل‌ها</option>{protocols.map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}</select></Field>
          <Field label="وضعیت"><select value={proxyStatusFilter} onChange={(event) => setProxyStatusFilter(event.target.value)}><option value="">همه وضعیت‌ها</option><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></Field>
        </div>
        <ProxyTable items={filteredProxies} onToggle={toggleProxy} onEdit={openEditProxy} onDelete={removeProxy} canWrite={canWrite} canDelete={canDelete}/>
      </div>}

      {tab === "ips" && <div className="panel">
        <div className="panel-head"><div><h3>مدیریت IP</h3><p className="muted">اطلاعات کامل آدرس‌ها، دسته‌ها و برچسب‌ها</p></div>{canWrite && <button className="primary" onClick={openNewIp}><Plus size={17}/> افزودن IP</button>}</div>
        <div className="filter-row compact">
          <Field label="کشور"><select value={ipCountryFilter} onChange={(event) => setIpCountryFilter(event.target.value)}><option value="">همه کشورها</option>{countries.map((country) => <option key={country} value={country}>{country}</option>)}</select></Field>
          <Field label="وضعیت"><select value={ipStatusFilter} onChange={(event) => setIpStatusFilter(event.target.value)}><option value="">همه وضعیت‌ها</option><option value="active">فعال</option><option value="inactive">غیرفعال</option><option value="unknown">نامشخص</option></select></Field>
        </div>
        <div className="table-wrap"><table><thead><tr><th>عنوان</th><th>آدرس</th><th>کشور</th><th>نسخه</th><th>دسته / برچسب</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>
          {filteredIps.map((ip) => <tr key={ip.id}><td>{ip.label}</td><td className="mono">{ip.address}{ip.port ? `:${ip.port}` : ""}</td><td>{ip.country}</td><td>{ip.ip_version}</td><td><b>{ip.category}</b><small className="tag-line">{(ip.tags || []).join("، ")}</small></td><td><span className={ip.status === "active" ? "badge green" : "badge"}>{statusLabel(ip.status)}</span></td><td><div className="actions">{canWrite && <button className="icon-btn" title="ویرایش" onClick={() => openEditIp(ip)}><Pencil size={15}/></button>}{canDelete && <button className="danger icon-btn" title="حذف" onClick={() => removeIp(ip)}><Trash2 size={15}/></button>}</div></td></tr>)}
        </tbody></table>{filteredIps.length === 0 && <Empty text="IP مطابق فیلترها پیدا نشد."/>}</div>
      </div>}

      {tab === "servers" && <div className="empty-state"><Server size={38}/><h3>هنوز VPN Node متصل نشده است</h3><p>این بخش در وضعیت «بعداً اضافه می‌شود» است؛ هیچ اتصال VPN واقعی شبیه‌سازی نشده است.</p></div>}
    </main>

    {showProxy && <Modal title={editingProxyId ? "ویرایش پروکسی" : "افزودن پروکسی"} close={() => setShowProxy(false)}>
      <form onSubmit={saveProxy}>
        <Field label="نام پروکسی"><input required maxLength={80} value={proxyForm.name} onChange={(event) => setProxyForm({ ...proxyForm, name: event.target.value })}/></Field>
        <div className="form-grid">
          <Field label="پروتکل"><select value={proxyForm.protocol} onChange={(event) => setProxyForm({ ...proxyForm, protocol: event.target.value })}>{protocols.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="انتقال"><select value={proxyForm.transport} onChange={(event) => setProxyForm({ ...proxyForm, transport: event.target.value })}>{transports.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="آدرس سرور"><input required maxLength={255} value={proxyForm.server_address} onChange={(event) => setProxyForm({ ...proxyForm, server_address: event.target.value })}/></Field>
          <Field label="پورت"><input required type="number" min="1" max="65535" value={proxyForm.port} onChange={(event) => setProxyForm({ ...proxyForm, port: event.target.value })}/></Field>
          <Field label="اولویت (۱ تا ۹۹۹)"><input required type="number" min="1" max="999" value={proxyForm.priority} onChange={(event) => setProxyForm({ ...proxyForm, priority: event.target.value })}/></Field>
          <Field label="دسته"><input required maxLength={80} value={proxyForm.category} onChange={(event) => setProxyForm({ ...proxyForm, category: event.target.value })}/></Field>
          <Field label="IP مرتبط"><select value={proxyForm.ip_id} onChange={(event) => setProxyForm({ ...proxyForm, ip_id: event.target.value })}><option value="">بدون اتصال به IP</option>{ips.map((ip) => <option key={ip.id} value={ip.id}>{ip.label} — {ip.address}</option>)}</select></Field>
          <Field label="وضعیت"><select value={proxyForm.status} onChange={(event) => setProxyForm({ ...proxyForm, status: event.target.value })}><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></Field>
        </div>
        <Field label="SNI (اختیاری)"><input maxLength={255} value={proxyForm.sni} onChange={(event) => setProxyForm({ ...proxyForm, sni: event.target.value })}/></Field>
        <Field label="برچسب‌ها (با ویرگول جدا کن)"><input maxLength={600} value={proxyForm.tags} onChange={(event) => setProxyForm({ ...proxyForm, tags: event.target.value })} placeholder="مثلاً تست، اروپا، اولویت‌دار"/></Field>
        <Field label="یادداشت"><textarea maxLength={1000} rows={3} value={proxyForm.notes} onChange={(event) => setProxyForm({ ...proxyForm, notes: event.target.value })}/></Field>
        <button className="primary wide" disabled={busy}>{editingProxyId ? "ذخیره تغییرات" : "ثبت پروکسی"}</button>
      </form>
    </Modal>}

    {showIp && <Modal title={editingIpId ? "ویرایش IP" : "افزودن IP"} close={() => setShowIp(false)}>
      <form onSubmit={saveIp}>
        <Field label="عنوان"><input required maxLength={80} value={ipForm.label} onChange={(event) => setIpForm({ ...ipForm, label: event.target.value })}/></Field>
        <Field label="آدرس IP یا دامنه"><input required maxLength={255} value={ipForm.address} onChange={(event) => setIpForm({ ...ipForm, address: event.target.value })}/></Field>
        <div className="form-grid">
          <Field label="کشور"><select value={ipForm.country} onChange={(event) => setIpForm({ ...ipForm, country: event.target.value })}>{countries.map((value) => <option key={value}>{value}</option>)}<option>نامشخص</option></select></Field>
          <Field label="نسخه IP"><select value={ipForm.ip_version} onChange={(event) => setIpForm({ ...ipForm, ip_version: event.target.value })}><option>IPv4</option><option>IPv6</option><option>Dual Stack</option></select></Field>
          <Field label="نوع IP"><select value={ipForm.ip_type} onChange={(event) => setIpForm({ ...ipForm, ip_type: event.target.value })}><option>اختصاصی</option><option>اشتراکی</option></select></Field>
          <Field label="پورت اختیاری"><input type="number" min="1" max="65535" value={ipForm.port} onChange={(event) => setIpForm({ ...ipForm, port: event.target.value })}/></Field>
          <Field label="وضعیت"><select value={ipForm.status} onChange={(event) => setIpForm({ ...ipForm, status: event.target.value })}><option value="unknown">نامشخص</option><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></Field>
          <Field label="نوع شبکه"><input maxLength={80} value={ipForm.network_type} onChange={(event) => setIpForm({ ...ipForm, network_type: event.target.value })}/></Field>
          <Field label="دسته"><input required maxLength={80} value={ipForm.category} onChange={(event) => setIpForm({ ...ipForm, category: event.target.value })}/></Field>
          <Field label="دامنه"><input maxLength={255} value={ipForm.domain} onChange={(event) => setIpForm({ ...ipForm, domain: event.target.value })}/></Field>
        </div>
        <Field label="SNI (اختیاری)"><input maxLength={255} value={ipForm.sni} onChange={(event) => setIpForm({ ...ipForm, sni: event.target.value })}/></Field>
        <Field label="برچسب‌ها (با ویرگول جدا کن)"><input maxLength={600} value={ipForm.tags} onChange={(event) => setIpForm({ ...ipForm, tags: event.target.value })}/></Field>
        <Field label="یادداشت"><textarea maxLength={1000} rows={3} value={ipForm.notes} onChange={(event) => setIpForm({ ...ipForm, notes: event.target.value })}/></Field>
        <button className="primary wide" disabled={busy}>{editingIpId ? "ذخیره تغییرات" : "ثبت IP"}</button>
      </form>
    </Modal>}
  </div>;
}

function roleLabel(role?: Role) { return role === "owner" ? "مالک" : role === "admin" ? "مدیر" : role === "operator" ? "اپراتور" : "مشاهده‌گر"; }
function statusLabel(status: string) { return status === "active" ? "فعال" : status === "inactive" ? "غیرفعال" : "نامشخص"; }
function Stat({ icon, label, value }: { icon: any; label: string; value: any }) { return <div className="stat-card"><div className="stat-icon">{icon}</div><span>{label}</span><b>{value}</b></div>; }
function Field({ label, children }: { label: string; children: any }) { return <label className="field">{label}{children}</label>; }
function Modal({ title, close, children }: { title: string; close: () => void; children: any }) { return <div className="modal-backdrop" onMouseDown={close}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="panel-head"><h3>{title}</h3><button type="button" className="icon-btn" onClick={close}>×</button></div>{children}</div></div>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function ProxyTable({ items, onToggle, onEdit, onDelete, canWrite, canDelete }: {
  items: ProxyItem[]; onToggle: (proxy: ProxyItem) => void; onEdit: (proxy: ProxyItem) => void;
  onDelete: (proxy: ProxyItem) => void; canWrite: boolean; canDelete: boolean;
}) {
  return <div className="table-wrap"><table><thead><tr><th>نام</th><th>پروتکل</th><th>آدرس</th><th>کشور</th><th>دسته / برچسب</th><th>پورت</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>
    {items.map((proxy) => <tr key={proxy.id}><td>{proxy.name}</td><td><span className="protocol">{proxy.protocol}</span></td><td className="mono">{proxy.server_address}</td><td>{proxy.ip_country || "—"}</td><td><b>{proxy.category}</b><small className="tag-line">{(proxy.tags || []).join("، ")}</small></td><td>{proxy.port}</td><td><span className={proxy.status === "active" ? "badge green" : "badge"}>{statusLabel(proxy.status)}</span></td><td><div className="actions">
      {canWrite && <><button className="icon-btn" title="ویرایش" onClick={() => onEdit(proxy)}><Pencil size={15}/></button><button className="secondary mini" onClick={() => onToggle(proxy)}>{proxy.status === "active" ? "غیرفعال" : "فعال"}</button></>}
      {canDelete && <button className="danger icon-btn" title="حذف" onClick={() => onDelete(proxy)}><Trash2 size={15}/></button>}
    </div></td></tr>)}
  </tbody></table>{items.length === 0 && <Empty text="پروکسی مطابق فیلترها پیدا نشد."/>}</div>;
}
