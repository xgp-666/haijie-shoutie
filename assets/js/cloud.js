/* ======================================================================
 * 云同步（GitHub 版）：两台手机、不同设备看到同一批照片
 * ----------------------------------------------------------------------
 * 读取：公开仓库 → 任何手机打开网页就能读到（不需要令牌）
 * 写入：需要一把「只作用于本仓库」的 GitHub 令牌，存在本机浏览器里
 * 照片直接以 data URL 存进 album.json，保证对方一刷新就立刻能看到
 * ==================================================================== */
(function () {
  const C = window.CLOUD || {};
  const enabled = !!(C.enabled && C.repo && C.dataPath);
  const REPO = C.repo;
  const BRANCH = C.branch || 'main';
  const DATA = C.dataPath;
  const TOKEN_KEY = 'gh_album_token';
  const API = 'https://api.github.com';
  const UA = { 'User-Agent': 'codebuddy-album', 'Accept': 'application/vnd.github+json' };

  function getToken() {
    const fromLS = (localStorage.getItem(TOKEN_KEY) || '').trim();
    if (fromLS) return fromLS;
    const emb = (C.tokenParts && Array.isArray(C.tokenParts)) ? C.tokenParts.join('') : (C.token || '');
    return (emb || '').trim();   // 已内嵌则直接用，无需手动粘贴
  }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }

  function b64encodeUtf8(str) {
    return btoa(String.fromCharCode.apply(null, new TextEncoder().encode(str)));
  }
  function b64decodeUtf8(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* 写入前确认有令牌；没有就弹窗要一把（只存本机） */
  async function ensureToken() {
    let t = getToken();
    if (t) return true;
    t = prompt(
      '要和对方共享照片，需要一把 GitHub 令牌（只写进这个相册仓库，存在你手机里，不公开展示）：\n\n' +
      'GitHub → Settings → Developer settings → Personal access tokens\n' +
      '→ Fine-grained tokens → 新建，只选本仓库「xgp-666/haijie-shoutie」，权限给 Contents: Read and write\n' +
      '生成后把令牌粘贴到这里。\n\n（也可以直接粘贴之前那把经典令牌，用完在 GitHub 删掉即可）'
    );
    if (!t) return false;
    t = t.trim();
    setToken(t);
    return true;
  }

  function authHeaders(extra) {
    const h = Object.assign({}, UA, extra || {});
    const t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  async function ghJson(method, path, payload) {
    const data = payload == null ? undefined : JSON.stringify(payload);
    const r = await fetch(API + path, { method, headers: authHeaders({ 'Content-Type': 'application/json' }), body: data });
    const txt = await r.text();
    let body = {};
    try { body = txt ? JSON.parse(txt) : {}; } catch (e) { body = { _raw: txt }; }
    if (!r.ok) throw new Error((body && body.message) || (r.status + ' ' + txt.slice(0, 120)));
    return body;
  }

  function normalize(m) {
    return {
      custom: true,
      id: m.id,
      date: m.date || '',
      title: m.title || '',
      text: m.text || '',
      image: m.image || '',
      alt: m.title || '',
      tags: m.tags || [],
      script: m.script || '',
      jp: m.jp || ''
    };
  }
  function toRow(m) {
    return {
      id: m.id,
      date: m.date || '',
      title: m.title || '',
      text: m.text || '',
      image: m.image || '',
      tags: m.tags || [],
      script: m.script || '',
      jp: m.jp || ''
    };
  }
  function newId() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  async function readData() {
    const r = await fetch(API + '/repos/' + REPO + '/contents/' + DATA + '?ref=' + BRANCH, { headers: UA, cache: 'no-store' });
    if (!r.ok) throw new Error('读取相册失败 ' + r.status);
    return await r.json(); // 含 sha 与 content
  }

  async function writeObj(obj, sha, attempt) {
    attempt = attempt || 0;
    const payload = {
      message: '相册更新 ' + new Date().toISOString(),
      content: b64encodeUtf8(JSON.stringify(obj, null, 2)),
      branch: BRANCH
    };
    if (sha) payload.sha = sha;
    try {
      return await ghJson('PUT', '/repos/' + REPO + '/contents/' + DATA, payload);
    } catch (e) {
      if (attempt < 2 && /sha|409|changed/i.test(e.message)) {
        const fresh = await readData();
        return writeObj(obj, fresh.sha, attempt + 1);
      }
      throw e;
    }
  }

  async function writeData(memories, sha, attempt) {
    return writeObj({ memories: memories }, sha, attempt);
  }

  /* 一次拉取： memories + settings（封面/轮播/文字/主题） */
  async function load() {
    const d = await readData();
    const obj = JSON.parse(b64decodeUtf8(d.content));
    return { memories: (obj.memories || []).map(normalize), settings: obj.settings || null };
  }

  /* 保存整本手账的设置（保留 memories 不动）
     默认「逐项合并」：本机有值才覆盖云端，本机为空则保留云端现有的，
     避免一台设备把另一台设备的设置（轮播、封面、主题）整份抹掉。 */
  function nonEmpty(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }
  async function saveSettings(settings, merge) {
    if (!(await ensureToken())) throw new Error('NO_TOKEN');
    const d = await readData();
    const obj = JSON.parse(b64decodeUtf8(d.content));
    if (merge) {
      const base = obj.settings || {};
      const out = Object.assign({}, base);
      Object.keys(settings || {}).forEach((k) => { if (nonEmpty(settings[k])) out[k] = settings[k]; });
      out.savedAt = (settings && settings.savedAt) ? settings.savedAt : (base.savedAt || 0);
      obj.settings = out;
    } else {
      obj.settings = settings;
    }
    await writeObj(obj, d.sha);
    return true;
  }

  async function list() {
    const d = await readData();
    const obj = JSON.parse(b64decodeUtf8(d.content));
    return (obj.memories || []).map(normalize);
  }

  async function insert(memory) {
    if (!(await ensureToken())) throw new Error('NO_TOKEN');
    const d = await readData();
    const arr = (JSON.parse(b64decodeUtf8(d.content)).memories) || [];
    const item = toRow(memory);
    if (!item.id) item.id = newId();
    arr.unshift(item);
    await writeData(arr, d.sha);
    return normalize(item);
  }

  async function update(id, patch) {
    if (!(await ensureToken())) throw new Error('NO_TOKEN');
    const d = await readData();
    const all = (JSON.parse(b64decodeUtf8(d.content)).memories) || [];
    let found = false;
    const next = all.map((m) => {
      if (m.id === id) { found = true; return Object.assign({}, m, toRow(patch), { id }); }
      return m;
    });
    if (!found) next.unshift(Object.assign(toRow(patch), { id }));
    await writeData(next, d.sha);
    return normalize(Object.assign({}, patch, { id }));
  }

  async function remove(id) {
    if (!(await ensureToken())) throw new Error('NO_TOKEN');
    const d = await readData();
    const all = (JSON.parse(b64decodeUtf8(d.content)).memories) || [];
    const next = all.filter((m) => m.id !== id);
    await writeData(next, d.sha);
    return true;
  }

  /* 兼容旧接口：照片已是 data URL，原样返回 */
  async function uploadImage(dataUrl) { return dataUrl; }

  /* 自动体检：把本机诊断信息写进云端（远程排查用，不含照片内容） */
  async function saveDiag(info) {
    if (!(await ensureToken())) return false;
    const d = await readData();
    const obj = JSON.parse(b64decodeUtf8(d.content));
    obj.diag = Object.assign({}, info, { ts: Date.now() });
    await writeObj(obj, d.sha);
    return true;
  }

  window.AlbumCloud = { enabled, ensureToken, list, load, saveSettings, insert, update, remove, uploadImage, normalize, toRow, saveDiag };
})();
