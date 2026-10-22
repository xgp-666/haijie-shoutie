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
      image: resolveImage(m.image || ''),
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

  /* ---- 照片独立存储：每张照片存成仓库里的独立文件，album.json 只留轻量路径 ----
     GitHub 单文件写入上限约 1MB，把照片 base64 塞进同一个 album.json 会超限被拒，
     所以改成「每张照片一个文件」，album.json 只记路径，保证多次上传都成功。 */
  const PHOTO_DIR = 'data/photos';
  /* 照片用 raw.githubusercontent.com 直接取仓库最新文件：提交后几秒即可见，
     不像 GitHub Pages 要等 1~3 分钟重新构建，避免另一台手机“看不到照片”。 */
  const RAW_BASE = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/';

  function parseDataUrl(dataUrl) {
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    const ext = m[1] === 'image/png' ? 'png' : (m[1] === 'image/webp' ? 'webp' : (m[1] === 'image/gif' ? 'gif' : 'jpg'));
    return { ext: ext, b64: m[2] };
  }
  /* 显示时把路径转成完整可访问的 URL（data: / http 原样返回） */
  function resolveImage(url) {
    if (!url) return url;
    if (url.indexOf('data:') === 0 || url.indexOf('http') === 0) return url;
    return RAW_BASE + url;
  }
  async function putPhotoFile(id, dataUrl) {
    const p = parseDataUrl(dataUrl);
    if (!p) return '';
    const path = PHOTO_DIR + '/' + id + '.' + p.ext;
    const payload = { message: 'photo ' + id, content: p.b64, branch: BRANCH };
    try { const ex = await ghJson('GET', '/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH); payload.sha = ex.sha; } catch (e) {}
    await ghJson('PUT', '/repos/' + REPO + '/contents/' + path, payload);
    return path;
  }
  async function deletePhotoFile(path) {
    try {
      const ex = await ghJson('GET', '/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH);
      await ghJson('DELETE', '/repos/' + REPO + '/contents/' + path, { message: 'del ' + path, sha: ex.sha, branch: BRANCH });
    } catch (e) {}
  }

  /* 统一写入：始终写整份对象（memories + settings + diag），避免互相覆盖 */
  async function commit(fullObj, sha, attempt) {
    attempt = attempt || 0;
    const payload = {
      message: '相册更新 ' + new Date().toISOString(),
      content: b64encodeUtf8(JSON.stringify(fullObj, null, 2)),
      branch: BRANCH
    };
    if (sha) payload.sha = sha;
    try {
      return await ghJson('PUT', '/repos/' + REPO + '/contents/' + DATA, payload);
    } catch (e) {
      if (attempt < 2 && /sha|409|changed/i.test(e.message)) {
        const f = await readData();
        return commit(fullObj, f.sha, attempt + 1);
      }
      throw e;
    }
  }
  async function readFull() {
    const d = await readData();
    return { sha: d.sha, obj: JSON.parse(b64decodeUtf8(d.content)) };
  }

  /* 一次拉取： memories + settings（封面/轮播/文字/主题） */
  async function load() {
    const d = await readData();
    const obj = JSON.parse(b64decodeUtf8(d.content));
    return { memories: (obj.memories || []).map(normalize), settings: obj.settings || null };
  }

  function nonEmpty(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }
  async function saveSettings(settings, merge) {
    if (!(await ensureToken())) throw new Error('NO_TOKEN');
    const f = await readFull();
    const obj = f.obj;
    if (merge) {
      const base = obj.settings || {};
      const out = Object.assign({}, base);
      Object.keys(settings || {}).forEach((k) => { if (nonEmpty(settings[k])) out[k] = settings[k]; });
      out.savedAt = (settings && settings.savedAt) ? settings.savedAt : (base.savedAt || 0);
      obj.settings = out;
    } else {
      obj.settings = settings;
    }
    await commit(obj, f.sha);
    return true;
  }

  async function list() {
    const d = await readData();
    const obj = JSON.parse(b64decodeUtf8(d.content));
    return (obj.memories || []).map(normalize);
  }

  async function insert(memory) {
    if (!(await ensureToken())) throw new Error('NO_TOKEN');
    const f = await readFull();
    const obj = f.obj;
    const arr = obj.memories || [];
    const item = toRow(memory);
    if (!item.id) item.id = newId();
    if (item.image && item.image.indexOf('data:') === 0) {
      const path = await putPhotoFile(item.id, item.image);
      if (path) item.image = path;   // 云端只存路径，照片本身是独立文件
    }
    const idx = arr.findIndex((m) => m.id === item.id);
    if (idx >= 0) arr[idx] = item; else arr.unshift(item);
    obj.memories = arr;
    await commit(obj, f.sha);
    return normalize(item);
  }

  async function update(id, patch) {
    if (!(await ensureToken())) throw new Error('NO_TOKEN');
    const f = await readFull();
    const obj = f.obj;
    const all = obj.memories || [];
    const prev = all.find((m) => m.id === id);
    const merged = prev ? Object.assign({}, prev, toRow(patch), { id }) : Object.assign(toRow(patch), { id });
    if (merged.image && merged.image.indexOf('data:') === 0) {
      const newPath = await putPhotoFile(id, merged.image);
      if (newPath) {
        if (prev && prev.image && prev.image.indexOf('data:') !== 0 && prev.image.indexOf('http') !== 0 && prev.image !== newPath) {
          await deletePhotoFile(prev.image);
        }
        merged.image = newPath;
      }
    }
    obj.memories = prev ? all.map((m) => (m.id === id ? merged : m)) : all.concat([merged]);
    await commit(obj, f.sha);
    return normalize(merged);
  }

  async function remove(id) {
    if (!(await ensureToken())) throw new Error('NO_TOKEN');
    const f = await readFull();
    const obj = f.obj;
    const all = obj.memories || [];
    const target = all.find((m) => m.id === id);
    obj.memories = all.filter((m) => m.id !== id);
    await commit(obj, f.sha);
    if (target && target.image && target.image.indexOf('data:') !== 0 && target.image.indexOf('http') !== 0) {
      await deletePhotoFile(target.image);
    }
    return true;
  }

  /* 兼容旧接口：照片已是 data URL，原样返回 */
  async function uploadImage(dataUrl) { return dataUrl; }

  /* 自动体检：把本机诊断信息写进云端（远程排查用，不含照片内容） */
  async function saveDiag(info) {
    if (!(await ensureToken())) return false;
    const d = await readData();
    const obj = JSON.parse(b64decodeUtf8(d.content));
    const stamped = Object.assign({}, info, { ts: Date.now() });
    obj.diag = stamped;
    // 按设备分别保存，方便分别查看两台手机各自的真实状态
    obj.diagDevices = obj.diagDevices || {};
    const dev = (info && info._dev) || 'unknown';
    obj.diagDevices[dev] = stamped;
    await writeObj(obj, d.sha);
    return true;
  }

  /* 把最近一次出错的原因写进云端，方便远程排查（不含照片内容） */
  async function saveLastErr(msg, where) {
    try {
      if (!(await ensureToken())) return false;
      let dev = '';
      try { dev = localStorage.getItem('album_dev_id') || ''; } catch (e) {}
      const d = await readData();
      const obj = JSON.parse(b64decodeUtf8(d.content));
      obj.lastErr = { ts: Date.now(), where: String(where || ''), msg: String(msg || ''), dev: dev };
      await writeObj(obj, d.sha);
      return true;
    } catch (e) { return false; }
  }

  window.AlbumCloud = { enabled, ensureToken, list, load, saveSettings, insert, update, remove, uploadImage, normalize, toRow, saveDiag, saveLastErr, resolveImage };
})();
