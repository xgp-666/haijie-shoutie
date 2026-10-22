/* ==========================================================================
 *  拾光 · 手账风相册 逻辑
 *  ------------------------------------------------------------------------
 *  负责渲染页面、分类筛选、轮播、图片放大、深浅模式，以及——
 *  ★ 手机端「写一页」上传照片（IndexedDB 本地保存、自动压缩）
 *  ★ 备份导出 / 导入（把上传的照片打包成 JSON 文件带走）
 *
 *  日常维护不需要改这个文件；改照片文字请编辑 assets/js/data.js。
 * ========================================================================== */
(function () {
  'use strict';

  /* 全局报错捕获：页面任何报错都记下来，随「自动体检」上报云端，便于远程排查 */
  window.__albumErr = '';
  window.addEventListener('error', (e) => {
    window.__albumErr = String((e && e.message) || 'unknown').slice(0, 140) + ' @L' + ((e && e.lineno) || '?');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    window.__albumErr = 'promise: ' + String((r && r.message) || r || 'unknown').slice(0, 140);
  });

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 多巴胺色板（来自 data.js 的 PALETTE，改那里就能换整站配色） ---------- */
  const COLORS = (typeof PALETTE !== 'undefined' && PALETTE && PALETTE.length)
    ? PALETTE
    : ['#ff6f9c', '#ffd23f', '#5fe0c0', '#7fc7ff', '#b18cff', '#ff9f5a'];
  const ALPHA = (typeof TAPE_ALPHA !== 'undefined') ? TAPE_ALPHA : 0.62;
  const STICKER_ON = (typeof USE_STICKERS === 'undefined') ? true : USE_STICKERS;

  function hexToRgba(hex, a) {
    let h = String(hex).replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return 'rgba(255,111,156,' + a + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  const colorAt = (i) => COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];

  /* 手账装饰素材：胶带颜色 / 照片微倾角度 / 色卡配色，按色板循环使用 */
  const TAPES = COLORS.map((c) => hexToRgba(c, ALPHA));
  const TILTS = [-1.8, 1.4, -1.1, 1.8, -2.2, 1.2];

  /* ---------- 海街贴纸（电车 / 紫阳花 / 云 / 帆船 / 道口标志） ---------- */
  const INK = '#3f4a52';
  const SKY = '#dcedf6';
  function stickerSvg(kind, color) {
    const S = 'stroke="' + INK + '" stroke-width="1.5"';
    if (kind === 'train') {
      return '<svg viewBox="0 0 40 40">' +
        '<rect x="3" y="13" width="34" height="15" rx="3.5" fill="' + color + '" ' + S + '/>' +
        '<rect x="4.5" y="20" width="31" height="4.5" fill="' + SKY + '" opacity=".9"/>' +
        '<rect x="7" y="16" width="6" height="4" rx="1" fill="' + SKY + '"/>' +
        '<rect x="17" y="16" width="6" height="4" rx="1" fill="' + SKY + '"/>' +
        '<rect x="27" y="16" width="6" height="4" rx="1" fill="' + SKY + '"/>' +
        '<circle cx="11" cy="31" r="2.6" fill="' + INK + '"/><circle cx="29" cy="31" r="2.6" fill="' + INK + '"/>' +
        '<path d="M20 13V7M16 7h8" stroke="' + INK + '" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
        '</svg>';
    }
    if (kind === 'hydrangea') {
      let bloom = '';
      [[20, 10], [12, 17], [28, 17], [16, 26], [24, 26]].forEach((p) => {
        bloom += '<g fill="' + color + '">' +
          '<circle cx="' + (p[0] - 2.6) + '" cy="' + p[1] + '" r="2.6"/>' +
          '<circle cx="' + (p[0] + 2.6) + '" cy="' + p[1] + '" r="2.6"/>' +
          '<circle cx="' + p[0] + '" cy="' + (p[1] - 2.6) + '" r="2.6"/>' +
          '<circle cx="' + p[0] + '" cy="' + (p[1] + 2.6) + '" r="2.6"/>' +
          '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.6" fill="#fff" opacity=".85"/>' +
          '</g>';
      });
      return '<svg viewBox="0 0 40 40">' + bloom +
        '<path d="M20 30v7" stroke="#4a7043" stroke-width="1.8"/>' +
        '<path d="M20 34c-3-1-5-3-5-5M20 34c3-1 5-3 5-5" fill="none" stroke="#4a7043" stroke-width="1.6"/>' +
        '</svg>';
    }
    if (kind === 'cloud') {
      return '<svg viewBox="0 0 40 40">' +
        '<g fill="#fff" ' + S + '>' +
        '<ellipse cx="14" cy="24" rx="9" ry="6.5"/>' +
        '<ellipse cx="24" cy="20" rx="10" ry="8"/>' +
        '<ellipse cx="31" cy="26" rx="7" ry="5"/>' +
        '</g><ellipse cx="21" cy="27" rx="12" ry="4.5" fill="#fff"/></svg>';
    }
    if (kind === 'sailboat') {
      return '<svg viewBox="0 0 40 40">' +
        '<path d="M20 6v18" stroke="' + INK + '" stroke-width="1.4"/>' +
        '<path d="M20 7L31 23H20z" fill="#fff" ' + S + '/>' +
        '<path d="M18 11L8 23h10z" fill="' + color + '" ' + S + '/>' +
        '<path d="M6 26h28l-4 6H10z" fill="' + INK + '" opacity=".85"/>' +
        '<path d="M4 34c3-2 5 2 8 0s5 2 8 0 5 2 8 0 4 1 6 0" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round"/>' +
        '</svg>';
    }
    // crossing：铁路道口标志
    return '<svg viewBox="0 0 40 40">' +
      '<g transform="rotate(45 20 20)">' +
      '<rect x="6" y="14" width="28" height="12" rx="2" fill="#e5c85a" ' + S + '/>' +
      '<rect x="10" y="14" width="4" height="12" fill="' + INK + '"/>' +
      '<rect x="18" y="14" width="4" height="12" fill="' + INK + '"/>' +
      '<rect x="26" y="14" width="4" height="12" fill="' + INK + '"/>' +
      '</g>' +
      '<circle cx="20" cy="20" r="3.4" fill="' + INK + '"/>' +
      '<circle cx="18.8" cy="18.8" r="1" fill="#fff" opacity=".8"/>' +
      '</svg>';
  }
  const STICKER_KINDS = ['train', 'hydrangea', 'cloud', 'sailboat', 'crossing'];

  /* ======================================================================
   * 一、IndexedDB：手机上传的照片就存在这里（只在本机浏览器，不上传服务器）
   * ==================================================================== */
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        const req = indexedDB.open('shiguang-journal', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('memories', { keyPath: 'id', autoIncrement: true });
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    }
    return dbPromise;
  }
  function dbAll() {
    return db().then((d) => new Promise((res, rej) => {
      const r = d.transaction('memories', 'readonly').objectStore('memories').getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    }));
  }
  function dbAdd(m) {
    return db().then((d) => new Promise((res, rej) => {
      const r = d.transaction('memories', 'readwrite').objectStore('memories').add(m);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }
  function dbPut(m) {
    return db().then((d) => new Promise((res, rej) => {
      const r = d.transaction('memories', 'readwrite').objectStore('memories').put(m);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }
  function dbDelete(id) {
    return db().then((d) => new Promise((res, rej) => {
      const r = d.transaction('memories', 'readwrite').objectStore('memories').delete(id);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    }));
  }
  /* ---- 备用仓库：有些手机浏览器（微信内置、无痕模式）不让用 IndexedDB，
         这时自动改存 localStorage，保证照片照样能贴上去 ---- */
  const LS_KEY = 'shiguang-memories-ls';
  function loadLS() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch (e) { return []; } }
  function saveLS(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); return true; }
    catch (e) { alert('浏览器存储空间不够了，先「导出备份」，再删掉一些旧照片吧'); return false; }
  }

  async function storeAll() {
    let a = [];
    try { a = await dbAll(); } catch (e) {}
    return a.concat(loadLS());
  }
  async function storeAdd(m) {
    try { return await dbAdd(m); } catch (e) {}
    const list = loadLS();
    m.id = Date.now() + Math.random();
    list.push(m);
    saveLS(list);
    return m.id;
  }
  async function storePut(m) {
    const ls = loadLS();
    if (ls.some((x) => x.id === m.id)) { saveLS(ls.map((x) => (x.id === m.id ? m : x))); return; }
    try { await dbPut(m); } catch (e) {}
  }
  async function storeDelete(id) {
    saveLS(loadLS().filter((x) => x.id !== id));
    try { await dbDelete(id); } catch (e) {}
  }

  function dbReplaceAll(list) {
    return db().then((d) => new Promise((res, rej) => {
      const tx = d.transaction('memories', 'readwrite');
      const store = tx.objectStore('memories');
      store.clear();
      list.forEach((m) => store.put(m));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    }));
  }

  /* ======================================================================
   * 二、图片压缩：手机原图很大，先缩到 1200px 再转 JPEG，省空间加载快
   * ==================================================================== */
  function compressImage(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1200;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (Math.max(w, h) > MAX) {
          const k = MAX / Math.max(w, h);
          w = Math.round(w * k); h = Math.round(h * k);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('图片读取失败')); };
      img.src = url;
    });
  }

  /* ======================================================================
   * 三、数据组装：data.js 里的固定回忆 + 手机上传的回忆
   * ==================================================================== */
  let workingMemories = [];   // 渲染用的完整列表（上传的排最前面，新的在上）
  let customs = [];           // 上传的条目（开了云同步就是云端那份）

  /* ---- 云同步：所有设备共用一个云端相册 ---- */
  function cloudOn() { return !!(window.AlbumCloud && AlbumCloud.enabled); }

  async function loadCustoms() {
    if (cloudOn()) {
      try {
        const rows = await AlbumCloud.list();
        try { await dbReplaceAll(rows); } catch (e) {}   // 本机留一份，断网也能翻
        return rows;
      } catch (e) {
        console.warn('云端拉取失败，先用本机数据', e);
      }
    }
    return await storeAll();
  }

  /* ---- 云端同步「整本手账的设置」：封面 / 轮播 / 改过的文字 / 主题 ----
     这些之前只存在本机浏览器，所以两台设备不同步；现在一起放进云端。
     GitHub 写完立刻读会有秒级滞后，读回来的可能是旧版本。
     所以每份设置都带 savedAt 时间戳：只接受比本机新的云端设置，
     旧版本一律忽略，避免「刚改完一刷新又变回去」。 */
  const SETTINGS_AT_KEY = 'shiguang-settings-at';
  function getSettingsAt() {
    try { return parseInt(localStorage.getItem(SETTINGS_AT_KEY) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function setSettingsAt(t) {
    try { localStorage.setItem(SETTINGS_AT_KEY, String(t || 0)); } catch (e) {}
  }

  function collectSettings() {
    let cover = '';
    try { cover = localStorage.getItem(COVER_KEY) || ''; } catch (e) {}
    const savedAt = Date.now();
    setSettingsAt(savedAt);   // 本机也记一份，用来判断谁更新
    return {
      savedAt: savedAt,
      cover: cover,
      siteEdits: loadJSON(SITE_EDIT_KEY),
      memEdits: memEdits,
      slides: loadJSON(SLIDE_EDIT_KEY),
      theme: themeEdits
    };
  }

  function applyCloudSettings(s) {
    if (!s || typeof s !== 'object') return;
    /* 云端版本比本机旧（写后读滞后的旧数据）→ 直接忽略，保留本机较新的改动 */
    const cloudAt = parseInt(s.savedAt || 0, 10) || 0;
    if (cloudAt && cloudAt < getSettingsAt()) return;
    if (cloudAt) setSettingsAt(cloudAt);
    /* 逐项应用，且云端该项为空时不覆盖本机（防止被别的设备/旧数据清空） */
    const has = (v) => (v && typeof v === 'object') ? Object.keys(v).length > 0 : !!v;
    try { if (s.cover) localStorage.setItem(COVER_KEY, s.cover); } catch (e) {}
    if (has(s.siteEdits)) saveJSON(SITE_EDIT_KEY, s.siteEdits);
    if (has(s.memEdits)) { memEdits = s.memEdits; saveJSON(MEM_EDIT_KEY, memEdits); }
    if (s.slides && s.slides.slides && s.slides.slides.length) saveJSON(SLIDE_EDIT_KEY, s.slides);
    if (has(s.theme)) {
      themeEdits = s.theme;
      saveJSON(THEME_KEY, s.theme);
      if (s.theme.mode) { try { localStorage.setItem('album-theme', s.theme.mode); } catch (e) {} }
    }
  }

  let syncTimer = null;
  function syncSettings() {
    if (!cloudOn()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try { await AlbumCloud.saveSettings(collectSettings(), true); }   // true = 逐项合并，不抹掉别的设备
      catch (e) { if (e && e.message !== 'NO_TOKEN') console.warn('设置同步失败', e); }
    }, 800);
  }

  /* ---- 本机改过的文字（data.js 里的固定条目也能改，改完存在浏览器里） ---- */
  const MEM_EDIT_KEY = 'shiguang-mem-edits';
  const SITE_EDIT_KEY = 'shiguang-site-edits';
  const COVER_KEY = 'shiguang-cover';

  function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
  function saveJSON(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} }
  let memEdits = loadJSON(MEM_EDIT_KEY);

  function buildWorkingMemories() {
    // 上传的按 id 倒序（最新贴的排最上；兼容数字 id 和云端字符串 id）
    const rank = (m) => (typeof m.id === 'number' ? m.id : (parseInt(String(m.id).replace(/\D/g, ''), 36) || 0));
    const sorted = customs.slice().sort((a, b) => rank(b) - rank(a))
      .map((m) => ({ custom: true, id: m.id, date: m.date, title: m.title, text: m.text, image: m.image, alt: m.alt || m.title || '', tags: m.tags || [], script: m.script || '', jp: m.jp || '' }));

    // data.js 里的固定回忆：套用本机改过的文字 / 隐藏标记
    const fixed = MEMORIES.map((m, i) => {
      const ov = memEdits[String(i)] || {};
      return {
        custom: false, fixedIndex: i,
        date: m.date, title: m.title, text: m.text, image: m.image,
        alt: m.alt || '', tags: m.tags || [], script: m.script || '', jp: m.jp || '',
        date2: ov.date, title2: ov.title, text2: ov.text, image2: ov.image,
        tags2: ov.tags, script2: ov.script, jp2: ov.jp, hidden: !!ov.hidden
      };
    }).filter((m) => !m.hidden).map((m) => ({
      custom: false, fixedIndex: m.fixedIndex,
      date: m.date2 !== undefined ? m.date2 : m.date,
      title: m.title2 !== undefined ? m.title2 : m.title,
      text: m.text2 !== undefined ? m.text2 : m.text,
      image: m.image2 !== undefined ? m.image2 : m.image,
      alt: m.alt,
      tags: m.tags2 !== undefined ? m.tags2 : m.tags,
      script: m.script2 !== undefined ? m.script2 : m.script,
      jp: m.jp2 !== undefined ? m.jp2 : m.jp
    }));

    workingMemories = sorted.concat(fixed);
  }

  /* ======================================================================
   * 四、站点信息 + 字体
   * ==================================================================== */
  function initSite() {
    const set = (id, v) => { if ($(id) && v) $(id).textContent = v; };
    if ($('heroImg') && SITE.cover) $('heroImg').src = SITE.cover;
    set('heroScript', SITE.script);
    set('heroEyebrow', SITE.eyebrow);
    set('heroDesc', SITE.desc);
    set('topbarName', SITE.brand);
    set('galleryTitle', SITE.galleryTitle);
    set('galleryNote', SITE.galleryNote);
    set('footerLine', SITE.footer);
    set('footerTip', SITE.footerTip);
    if ($('heroTitle')) {
      const em = $('heroTitle').querySelector('em') || $('heroTitle');
      em.textContent = SITE.title;
    }
    document.title = SITE.title + ' · 回忆手账';

    // 应用色板：写到 CSS 变量 --c1 ~ --c6，时间轴彩虹线、阴影等都会跟着变
    COLORS.forEach((c, i) => document.documentElement.style.setProperty('--c' + (i + 1), c));

    if (typeof FONT !== 'undefined') {
      const s = document.documentElement.style;
      if (FONT.hand)          s.setProperty('--font-hand', FONT.hand);
      if (FONT.script)        s.setProperty('--font-script', FONT.script);
      if (FONT.size)          s.setProperty('--font-size', FONT.size);
      if (FONT.lineHeight)    s.setProperty('--line-height', FONT.lineHeight);
      if (FONT.letterSpacing) s.setProperty('--letter-spacing', FONT.letterSpacing);
    }
  }

  /* ======================================================================
   * 五、时间线渲染 + 分类筛选
   * ==================================================================== */
  let allItems = [];
  let currentList = [];

  function initTimeline() {
    const list = $('timeline');
    const filters = $('filters');
    if (!list) return;

    /* ---- 分类按钮 ---- */
    let cats = (CATEGORIES && CATEGORIES.length)
      ? CATEGORIES.slice()
      : Array.from(new Set(workingMemories.reduce((a, m) => a.concat(m.tags || []), [])));

    const buttons = [];
    const mkBtn = (label, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'filter' + (label === '全部' ? ' is-active' : '');
      b.textContent = label;
      b.style.setProperty('--tag-bg', colorAt(i === undefined ? 0 : i + 1));
      b.addEventListener('click', () => {
        buttons.forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
        applyFilter(label);
      });
      filters.appendChild(b);
      buttons.push(b);
    };
    if (cats.length) { mkBtn('全部'); cats.forEach(mkBtn); }
    else { filters.style.display = 'none'; }

    renderTimelineItems(list);
    currentList = allItems.slice();
  }

  function renderTimelineItems(list) {
    list.innerHTML = '';
    allItems = [];

    workingMemories.forEach((m, i) => {
      const li = document.createElement('li');
      li.className = 'memory';
      li.dataset.tags = (m.tags || []).join(',');

      const marker = document.createElement('span');
      marker.className = 'memory__marker';
      marker.style.setProperty('--dot-bg', colorAt(i));

      const card = document.createElement('article');
      card.className = 'memory__card';

      /* ---- 拍立得照片（点击放大） ---- */
      const photoBtn = document.createElement('button');
      photoBtn.type = 'button';
      photoBtn.className = 'memory__photo';
      photoBtn.style.setProperty('--tilt', TILTS[i % TILTS.length] + 'deg');
      photoBtn.style.setProperty('--photo-shadow', colorAt(i + 2));
      photoBtn.setAttribute('aria-label', '放大查看：' + (m.title || ''));

      const img = document.createElement('img');
      img.src = m.image;
      img.alt = m.alt || m.title || '';
      img.loading = i === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      photoBtn.appendChild(img);

      // 和纸胶带（两条，位置颜色循环）
      const t1 = document.createElement('span');
      t1.className = 'tape';
      t1.style.setProperty('--tape-color', TAPES[i % TAPES.length]);
      t1.style.setProperty('--tape-rot', (i % 2 ? 2.6 : -3) + 'deg');
      photoBtn.appendChild(t1);
      const t2 = document.createElement('span');
      t2.className = 'tape tape--corner';
      t2.style.setProperty('--tape-color', TAPES[(i + 2) % TAPES.length]);
      photoBtn.appendChild(t2);

      const pdate = document.createElement('span');
      pdate.className = 'memory__polaroid-date';
      pdate.textContent = m.date || '';
      photoBtn.appendChild(pdate);

      photoBtn.addEventListener('click', () => openLightbox(i));
      card.appendChild(photoBtn);

      /* ---- 文字区 ---- */
      const body = document.createElement('div');
      body.className = 'memory__body';

      const date = document.createElement('time');
      date.className = 'memory__date';
      date.textContent = m.date || '';
      date.style.setProperty('--tag-bg', colorAt(i));
      body.appendChild(date);

      if (m.title) {
        const title = document.createElement('h3');
        title.className = 'memory__title';
        title.textContent = m.title;
        body.appendChild(title);
      }

      if (m.text) {
        const text = document.createElement('p');
        text.className = 'memory__text';
        text.textContent = m.text;
        body.appendChild(text);
      }

      if (m.script) {
        const script = document.createElement('span');
        script.className = 'memory__script';
        script.textContent = m.script;
        script.style.setProperty('--script-color', colorAt(i + 1));
        body.appendChild(script);
      }

      // 日文行李牌（可选字段 jp，如 '海の近くのふみきり'）
      if (m.jp) {
        const jp = document.createElement('span');
        jp.className = 'memory__jp';
        jp.textContent = m.jp;
        jp.style.setProperty('--jp-color', colorAt(i + 4));
        body.appendChild(jp);
      }

      if ((m.tags || []).length) {
        const ul = document.createElement('ul');
        ul.className = 'memory__tags';
        m.tags.forEach((t, k) => {
          const li2 = document.createElement('li');
          li2.className = 'memory__tag';
          li2.textContent = t;
          li2.style.setProperty('--tag-bg', colorAt(i + k + 3));
          ul.appendChild(li2);
        });
        body.appendChild(ul);
      }
      card.appendChild(body);

      /* ---- 多巴胺贴纸 / 波点 / 色卡（部分条目自动出现，手机上隐藏） ---- */
      if (STICKER_ON && i % 3 === 0) {
        const st = document.createElement('span');
        st.className = 'sticker';
        st.setAttribute('aria-hidden', 'true');
        st.innerHTML = stickerSvg(STICKER_KINDS[Math.floor(i / 3) % STICKER_KINDS.length], colorAt(i));
        st.style.setProperty('--sticker-rot', (i % 2 ? 11 : -9) + 'deg');
        st.style.right = '8px';
        st.style.top = '-10px';
        card.appendChild(st);
      }

      if (i % 4 === 2) {
        const dp = document.createElement('span');
        dp.className = 'dots';
        dp.setAttribute('aria-hidden', 'true');
        dp.style.setProperty('--dot-color', colorAt(i + 3));
        dp.style.left = '-16px';
        dp.style.top = '22px';
        card.appendChild(dp);
      }

      if (i % 5 === 3) {
        const gh = document.createElement('span');
        gh.className = 'gingham';
        gh.setAttribute('aria-hidden', 'true');
        gh.style.setProperty('--gcolor', hexToRgba(colorAt(i + 1), 0.34));
        gh.style.right = '-18px';
        gh.style.bottom = '12px';
        card.appendChild(gh);
      }

      if (i % 3 === 1) {
        const sw = document.createElement('div');
        sw.className = 'swatch';
        sw.setAttribute('aria-hidden', 'true');
        [0, 2, 4, 1].forEach((k) => {
          const bar = document.createElement('i');
          bar.style.background = colorAt(i + k);
          sw.appendChild(bar);
        });
        sw.style.right = '6px';
        sw.style.top = '8px';
        card.appendChild(sw);
      }

      /* ---- 改字按钮：每一页都能改文字，也能换照片 ---- */
      const ed = document.createElement('button');
      ed.type = 'button';
      ed.className = 'memory__edit' + (m.custom ? '' : ' memory__edit--has-remove');
      ed.textContent = '改';
      ed.title = '改这一页的文字 / 照片';
      ed.setAttribute('aria-label', '修改这条回忆');
      ed.addEventListener('click', () => openSheet(m));
      card.appendChild(ed);

      /* ---- 撕下按钮：上传的删除，固定条目则在本机隐藏 ---- */
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'memory__remove';
      rm.textContent = '×';
      rm.title = '撕下这一页';
      rm.setAttribute('aria-label', '删除这条回忆');
      rm.addEventListener('click', async () => {
        if (m.custom) {
          if (!confirm(cloudOn()
            ? '撕下这一页？所有手机上这一页都会删掉。'
            : '撕下这一页？照片会从这台设备的收藏中删除。')) return;
          let useCloud = false;
          try { useCloud = cloudOn() && (await AlbumCloud.ensureToken()); } catch (e) { useCloud = false; }
          if (useCloud) {
            try { await AlbumCloud.remove(m.id); } catch (e) { alert('云端删除失败：' + e.message); return; }
          }
          await storeDelete(m.id);
          customs = customs.filter((x) => x.id !== m.id);
        } else {
          if (!confirm('撕下这一页？之后可在页脚「恢复默认」找回。')) return;
          memEdits[String(m.fixedIndex)] = Object.assign({}, memEdits[String(m.fixedIndex)], { hidden: true });
          saveJSON(MEM_EDIT_KEY, memEdits);
          syncSettings();
        }
        refresh();
      });
      card.appendChild(rm);

      li.appendChild(marker);
      li.appendChild(card);
      list.appendChild(li);
      allItems.push(li);
    });

    $('empty').hidden = workingMemories.length !== 0;
    initReveal();
    if (currentFilter && currentFilter !== '全部') applyFilter(currentFilter);
  }

  let currentFilter = '全部';
  function applyFilter(label) {
    currentFilter = label;
    let count = 0;
    currentList = [];
    allItems.forEach((li) => {
      const tags = (li.dataset.tags || '').split(',');
      const show = (label === '全部') || tags.indexOf(label) > -1;
      li.classList.toggle('is-filtered', !show);
      if (show) { currentList.push(li); count++; observe(li); }
    });
    $('empty').hidden = count > 0;
  }

  /* ======================================================================
   * 六、滚动渐显
   * ==================================================================== */
  let io = null;
  function initReveal() {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      allItems.forEach((li) => li.classList.add('is-visible'));
      return;
    }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
    }
    allItems.forEach((li) => { if (!li.classList.contains('is-visible')) io.observe(li); });
  }
  function observe(el) { if (io) io.observe(el); }

  /* ======================================================================
   * 七、轮播（图片可以在网页上直接换，见 initSlideEditor）
   * ==================================================================== */
  const SLIDE_EDIT_KEY = 'shiguang-slides';
  function getSlides() {
    const ed = loadJSON(SLIDE_EDIT_KEY);
    const arr = ed.slides || [];
    return (typeof SLIDES !== 'undefined' ? SLIDES : []).map((s, i) => Object.assign({}, s, arr[i] || {}));
  }

  /* 轮播可重复初始化：每次云端有更新时重建，而不重复绑定全局事件 */
  let __slideGo = null, __slidePause = null, __slideResume = null;
  function initSlideshow() {
    const viewport = $('slideViewport');
    if (!viewport) return;
    viewport.innerHTML = '';
    const dotsBox = $('slideDots'); if (dotsBox) dotsBox.innerHTML = '';
    const list = getSlides();
    const ss = $('slideshow');
    if (!list.length) { if (ss) ss.style.display = 'none'; return; }
    if (ss) ss.style.display = '';

    const caption = $('slideCaption');
    let index = 0, timer = null;
    const slides = [];

    list.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'slide' + (i === 0 ? ' is-active' : '');
      const img = document.createElement('img');
      img.src = item.image;
      img.alt = item.caption || '';
      img.loading = i === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      el.appendChild(img);
      viewport.appendChild(el);
      slides.push(el);

      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'slide-dot' + (i === 0 ? ' is-active' : '');
      dot.setAttribute('aria-label', '第 ' + (i + 1) + ' 张');
      dot.addEventListener('click', () => go(i, true));
      dotsBox.appendChild(dot);
    });

    const dots = dotsBox.querySelectorAll('.slide-dot');
    function go(next, manual) {
      index = (next + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
      if (caption) caption.textContent = list[index].caption || '';
      if (manual) restart();
    }
    function restart() {
      clearInterval(timer);
      if (typeof SLIDE_INTERVAL !== 'undefined' && SLIDE_INTERVAL > 0) timer = setInterval(() => go(index + 1), SLIDE_INTERVAL);
    }

    __slideGo = (delta) => go(index + delta, true);
    __slidePause = () => clearInterval(timer);
    __slideResume = restart;

    if (caption) caption.textContent = list[0].caption || '';
    const box = $('slideshow');
    if (!box.dataset.wired) {
      $('slidePrev').addEventListener('click', () => __slideGo && __slideGo(-1));
      $('slideNext').addEventListener('click', () => __slideGo && __slideGo(1));
      box.addEventListener('mouseenter', () => __slidePause && __slidePause());
      box.addEventListener('mouseleave', () => __slideResume && __slideResume());
      box.dataset.wired = '1';
    }
    if (!viewport.dataset.touchWired) {
      let startX = 0;
      viewport.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
      viewport.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40 && __slideGo) __slideGo(dx < 0 ? 1 : -1);
      }, { passive: true });
      viewport.dataset.touchWired = '1';
    }

    restart();
  }

  /* ======================================================================
   * 七·五、后台自动同步：每隔几秒拉一次云端，对方改了就自动更新本机
   *        （不用手动刷新，满足「一个人改了另一个人随时看到」）
   * ==================================================================== */
  let lastCloudSig = '';
  async function cloudPoll() {
    if (!cloudOn()) return;
    if (document.querySelector('.sheet.open') || document.body.classList.contains('is-locked')) return; // 正在编辑/预览时不打断
    try {
      const data = await AlbumCloud.load();
      const memIds = (data.memories || []).map((m) => String(m.id)).join(',');
      const sAt = data.settings ? (data.settings.savedAt || 0) : 0;
      const sig = memIds + '|' + sAt;
      if (sig === lastCloudSig) return;       // 没变化就不打扰
      lastCloudSig = sig;

      if (data.settings) applyCloudSettings(data.settings);

      // 合并：云端照片 + 本机独有（还没同步上去的）照片
      let localItems = [];
      try { localItems = await storeAll(); } catch (e) {}
      const byId = new Map();
      (data.memories || []).forEach((m) => byId.set(String(m.id), m));
      localItems.forEach((m) => { if (!byId.has(String(m.id))) byId.set(String(m.id), m); });
      customs = Array.from(byId.values());
      try { await dbReplaceAll(customs); } catch (e) {}

      buildWorkingMemories();
      initTimeline();
      // 轮播 / 封面 / 站点文字 / 主题：有变化就重建
      try {
        const vp = $('slideViewport'), db = $('slideDots');
        if (vp) vp.innerHTML = ''; if (db) db.innerHTML = '';
        initSlideshow();
        applySavedCover();
        initSite();
        applyThemeEdits();
      } catch (e) {}
    } catch (e) {}
  }

  /* ======================================================================
   * 八、图片放大预览
   * ==================================================================== */
  let lbIndex = 0;
  function openLightbox(idx) {
    const item = workingMemories[idx];
    if (!item) return;
    lbIndex = idx;
    $('lightboxImg').src = item.image;
    $('lightboxImg').alt = item.alt || item.title || '';
    $('lightboxDate').textContent = item.date || '';
    $('lightboxText').textContent = item.title || '';
    const box = $('lightbox');
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('is-open'));
    document.body.classList.add('is-locked');
  }
  function closeLightbox() {
    const box = $('lightbox');
    box.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(() => { box.hidden = true; }, 400);
  }
  function step(dir) {
    if (!currentList.length) return;
    const map = currentList.map((li) => allItems.indexOf(li));
    const pos = map.indexOf(lbIndex);
    if (pos === -1) return;
    openLightbox(map[(pos + dir + map.length) % map.length]);
  }
  function initLightbox() {
    $('lightboxClose').addEventListener('click', closeLightbox);
    $('lightboxPrev').addEventListener('click', () => step(-1));
    $('lightboxNext').addEventListener('click', () => step(1));
    $('lightbox').addEventListener('click', (e) => { if (e.target === $('lightbox')) closeLightbox(); });
    document.addEventListener('keydown', (e) => {
      if ($('lightbox').hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });
    let startX = 0;
    $('lightbox').addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    $('lightbox').addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  /* ======================================================================
   * 九、「写一页」上传弹层
   * ==================================================================== */
  let pickedFile = null;
  let editingItem = null;   // 非 null 表示正在改某一页

  function openSheet(item) {
    editingItem = item || null;
    resetSheet();

    if (item) {
      $('sheetTitle').textContent = '改这一页';
      $('sheetSave').textContent = '改好了';
      $('sheetHint').textContent = '改完点「改好了」；想换照片就重新选一张，不选就保持原来的照片。';
      $('fDate').value = item.date || '';
      $('fTitle').value = item.title || '';
      $('fText').value = item.text || '';
      $('fJp').value = item.jp || '';
      $('fTags').value = (item.tags || []).join(', ');
      $('fScript').value = item.script || '';
      const pv = $('pickPreview');
      pv.src = item.image;
      pv.hidden = false;
      $('pickText').hidden = true;
    } else {
      $('sheetTitle').textContent = '贴一页新回忆';
      $('sheetSave').textContent = '贴上去';
      $('sheetHint').textContent = '照片会自动压缩后保存在这台手机的浏览器里，可用「导出备份」生成文件带到别的设备';
    }

    $('sheet').hidden = false;
    requestAnimationFrame(() => $('sheet').classList.add('is-open'));
    document.body.classList.add('is-locked');
  }
  function closeSheet() {
    $('sheet').classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(() => { $('sheet').hidden = true; }, 380);
  }
  function resetSheet() {
    pickedFile = null;
    $('addForm').reset();
    const pv = $('pickPreview');
    pv.hidden = true;
    pv.removeAttribute('src');
    delete pv.dataset.compressed;      // 清掉上次的压缩结果
    $('pickText').hidden = false;
    $('sheetSave').disabled = false;
    $('sheetSave').textContent = '贴上去';
  }

  function initSheet() {
    $('fabAdd').addEventListener('click', () => openSheet(null));
    $('sheetCancel').addEventListener('click', closeSheet);
    $('sheetMask').addEventListener('click', closeSheet);

    $('fileInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      pickedFile = file;
      try {
        const dataUrl = await compressImage(file);
        const pv = $('pickPreview');
        pv.src = dataUrl;
        pv.hidden = false;
        $('pickText').hidden = true;
        pv.dataset.compressed = dataUrl;   // 先存好压缩结果
      } catch (err) {
        alert('这张图片读不出来，换一张试试？');
      }
    });

    $('addForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!editingItem && !pickedFile) { alert('先选一张照片吧'); return; }
      const saveBtn = $('sheetSave');
      saveBtn.disabled = true;
      saveBtn.textContent = editingItem ? '改着呢…' : '贴着呢…';

      let image = '';
      if (pickedFile) {
        image = $('pickPreview').dataset.compressed || '';
        if (!image) { try { image = await compressImage(pickedFile); } catch (err) {} }
      } else if (editingItem) {
        image = editingItem.image;   // 没重选照片就保持原图
      }

      const tags = $('fTags').value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      const now = new Date();
      const today = now.getFullYear() + ' · ' + (now.getMonth() + 1) + ' 月';

      const payload = {
        date: $('fDate').value.trim() || (editingItem ? editingItem.date : today),
        title: $('fTitle').value.trim(),
        text: $('fText').value.trim(),
        image: image,
        tags: tags,
        script: $('fScript').value.trim(),
        jp: $('fJp').value.trim()
      };

      // 是否有云同步令牌可用（没有会弹窗要一把，取消则退回本机）
      let useCloud = false;
      try { useCloud = cloudOn() && (await AlbumCloud.ensureToken()); } catch (e) { useCloud = false; }

      try {
        if (editingItem && editingItem.custom) {
          // 改的是自己贴的那页
          const old = customs.find((x) => x.id === editingItem.id) || {};
          const updated = Object.assign({}, old, payload);
          if (useCloud) {
            await AlbumCloud.update(editingItem.id, AlbumCloud.toRow(updated));
            try { await storePut(updated); } catch (e) {}   // 云端失败时本机也留底
            customs = customs.map((x) => (x.id === updated.id ? updated : x));
          } else {
            await storePut(updated);
            customs = customs.map((x) => (x.id === updated.id ? updated : x));
          }
        } else if (editingItem) {
          // 改的是 data.js 里的固定那页：改动存云端（有令牌时），本机也留一份
          memEdits[String(editingItem.fixedIndex)] = Object.assign({}, memEdits[String(editingItem.fixedIndex)], payload);
          saveJSON(MEM_EDIT_KEY, memEdits);
          syncSettings();
        } else {
          // 新贴一页：本机永远留底，云端再同步（云端失败也不丢）
          payload.id = payload.id || ('m' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
          await storeAdd(payload);
          let row = payload;
          if (useCloud) {
            try { row = await AlbumCloud.insert(AlbumCloud.toRow(payload)); }
            catch (e) { row = payload; }
          }
          customs.unshift(row);
        }
        refresh();
        closeSheet();
        resetSheet();
        if (!editingItem) {
          window.scrollTo({ top: $('gallery').offsetTop - 20, behavior: reduceMotion ? 'auto' : 'smooth' });
          if (useCloud) {
            alert('贴好啦～\n已经同步到云端，另一台手机打开这个网址（或刷新一下）就能看到。');
          } else {
            alert('贴好啦～\n注意：照片先存到了这台设备的浏览器里。\n要和对方共享，需要在弹窗里粘贴一把 GitHub 令牌（只作用于这个相册仓库）。\n只自己看也行，用页脚「固化到相册」可导出备份。');
          }
        }
      } catch (err) {
        alert('保存失败：' + (err && err.message ? err.message : err));
        saveBtn.disabled = false;
        saveBtn.textContent = editingItem ? '改好了' : '贴上去';
      }
    });
  }

  /* 重新渲染时间线（上传/删除后调用） */
  function refresh() {
    buildWorkingMemories();
    renderTimelineItems($('timeline'));
    currentList = allItems.slice();
    if (currentFilter !== '全部') applyFilter(currentFilter);
  }

  /* ======================================================================
   * 十、备份导出 / 导入（把上传的照片带去别的手机 / 电脑）
   * ==================================================================== */
  function initBackup() {
    /* 手动「同步到云端」：拉云端 + 把本机独有照片补传上去，并给明确结果 */
    async function doSync() {
      const status = $('syncStatus');
      if (!cloudOn()) { status.textContent = '未开启云同步'; return; }
      status.textContent = '同步中…';
      try {
        const data = await AlbumCloud.load();
        if (data.settings) applyCloudSettings(data.settings);
        let cloudList = data.memories;
        const localItems = await storeAll();
        const ids = new Set(cloudList.map((m) => String(m.id)));
        const missing = localItems.filter((m) => !ids.has(String(m.id))).slice(0, 30);
        for (const m of missing) {
          try { const row = await AlbumCloud.insert(AlbumCloud.toRow(m)); cloudList.unshift(row); }
          catch (e) { break; }
        }
        customs = cloudList;
        try { await dbReplaceAll(customs); } catch (e) {}
        buildWorkingMemories();
        initTimeline();
        status.textContent = '已同步 ✓ 云端 ' + cloudList.length + ' 张，本机补传 ' + missing.length + ' 张。另一台手机刷新即可看到。';
        if (missing.length) alert('已把本机 ' + missing.length + ' 张照片上传到云端，另一台手机刷新就能看到。');
      } catch (e) {
        status.textContent = '同步失败：' + (e && e.message ? e.message : e);
      }
    }
    const syncBtn = $('syncBtn');
    if (syncBtn) syncBtn.addEventListener('click', doSync);

    $('exportBtn').addEventListener('click', async () => {
      if (!customs.length) { alert('这台设备还没有上传过照片，无需备份。'); return; }
      const blob = new Blob([JSON.stringify({ app: 'shiguang-journal', version: 1, memories: customs }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'shiguang-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    });

    /* 把上传的照片固化成 data.js 片段：粘进 data.js 后，换任何设备打开都能看见 */
    $('exportJsBtn').addEventListener('click', () => {
      const parts = [];

      /* 1. 上传的回忆照片 */
      if (customs.length) {
        const rows = customs.slice().sort((a, b) => b.id - a.id).map((m) => (
          '  {\n' +
          '    date: ' + JSON.stringify(m.date || '') + ',\n' +
          '    title: ' + JSON.stringify(m.title || '') + ',\n' +
          '    text: ' + JSON.stringify(m.text || '') + ',\n' +
          '    image: ' + JSON.stringify(m.image || '') + ',\n' +
          '    script: ' + JSON.stringify(m.script || '') + ',\n' +
          '    jp: ' + JSON.stringify(m.jp || '') + ',\n' +
          '    tags: ' + JSON.stringify(m.tags || []) + '\n' +
          '  }'
        )).join(',\n');
        parts.push('/* ===== 1) 回忆照片：整段替换 data.js 里的 MEMORIES ===== */\n' +
          'const MEMORIES = [\n' + rows + '\n];\n');
      }

      /* 2. 封面照片 */
      let cover = null;
      try { cover = localStorage.getItem(COVER_KEY); } catch (e) {}
      if (cover) {
        parts.push('/* ===== 2) 封面照片：粘到 data.js 里 SITE = { ... }; 的后面 ===== */\n' +
          'SITE.cover = ' + JSON.stringify(cover) + ';\n');
      }

      /* 3. 轮播图 */
      const slideEd = loadJSON(SLIDE_EDIT_KEY);
      if (slideEd.slides && slideEd.slides.length) {
        parts.push('/* ===== 3) 轮播图：整段替换 data.js 里的 SLIDES ===== */\n' +
          'const SLIDES = ' + JSON.stringify(slideEd.slides, null, 2).replace(/"([a-zA-Z_]+)":/g, '$1: ') + ';\n');
      }

      /* 4. 配色 / 字体 / 明暗 */
      const th = loadJSON(THEME_KEY);
      if (th.palette && th.palette.length) {
        parts.push('/* ===== 4) 配色与字体：整段替换 data.js 里的 PALETTE / FONT ===== */\n' +
          'const PALETTE = ' + JSON.stringify(th.palette) + ';\n' +
          (th.font ? 'FONT.hand = ' + JSON.stringify(th.font) + ';\n' : '') +
          (th.mode === 'dark' ? '/* 当前是深色模式：想默认深色，把 index.html 第 11 行的 data-theme="light" 改成 data-theme="dark" */\n' : ''));
      }

      /* 5. 页面文字 */
      const siteEd = loadJSON(SITE_EDIT_KEY);
      const siteKeys = Object.keys(siteEd);
      if (siteKeys.length) {
        const kv = siteKeys.map((k) => '  ' + k + ': ' + JSON.stringify(siteEd[k])).join(',\n');
        parts.push('/* ===== 5) 页面文字：粘到 data.js 里 SITE = { ... }; 的后面 ===== */\n' +
          'Object.assign(SITE, {\n' + kv + '\n});\n');
      }

      if (!parts.length) { alert('这台设备还没有任何改动（照片 / 封面 / 轮播 / 配色 / 文字），暂时不用固化。'); return; }

      const text =
        '/* ============================================\n' +
        '   这台手机改好的内容 —— 粘进 assets/js/data.js\n' +
        '   把下面每一段粘到 data.js 里对应的位置，保存后\n' +
        '   重新部署，所有手机 / 电脑打开就都能看到了。\n' +
        '   生成时间：' + new Date().toLocaleString() + '\n' +
        '   ============================================ */\n\n' + parts.join('\n');

      const blob = new Blob([text], { type: 'text/javascript;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'memories-from-phone.js';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      alert('已生成 memories-from-phone.js（共 ' + parts.length + ' 段）\n\n' +
        '手机：在「文件 / 下载」里找到它，用微信 / QQ / 邮件发到电脑\n' +
        '电脑：按文件里的注释，把每段粘到 data.js 对应位置，保存后重新部署');
    });

    $('importBtn').addEventListener('click', () => $('importInput').click());
    $('importInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const list = Array.isArray(data) ? data : (data.memories || []);
        const clean = list
          .filter((m) => m && m.image)
          .map((m) => ({
            date: m.date || '', title: m.title || '', text: m.text || '',
            image: m.image, tags: m.tags || [], script: m.script || '', jp: m.jp || ''
          }));
        if (!clean.length) { alert('备份文件里没有可导入的照片。'); return; }
        if (!confirm('导入 ' + clean.length + ' 条回忆？将合并到这台设备（重复内容不会自动去重）。')) return;
        for (const m of clean) { m.id = await storeAdd(m); customs.push(m); }
        refresh();
        alert('导入完成，已贴到手账上。');
      } catch (err) {
        alert('备份文件读取失败。');
      } finally {
        e.target.value = '';
      }
    });
  }

  /* ======================================================================
   * 十一、页面文字直接点着改（封面、标题、页脚…）+ 换封面 + 恢复默认
   * ==================================================================== */
  function initEditableTexts() {
    const edits = loadJSON(SITE_EDIT_KEY);
    document.querySelectorAll('[data-editable]').forEach((el) => {
      const key = el.dataset.editable;
      if (edits[key] !== undefined) el.textContent = edits[key];
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');
      el.classList.add('is-editable');
      if (key === 'title') document.title = el.textContent + ' · 回忆手账';

      const save = () => {
        const o = loadJSON(SITE_EDIT_KEY);
        o[key] = el.textContent.replace(/\s+/g, ' ').trim();
        saveJSON(SITE_EDIT_KEY, o);
        if (key === 'title') document.title = o[key] + ' · 回忆手账';
        syncSettings();
      };
      el.addEventListener('blur', save);
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); el.blur(); }
      });
    });
  }

  function applySavedCover() {
    let saved = null;
    try { saved = localStorage.getItem(COVER_KEY); } catch (e) {}
    if (saved && $('heroImg')) $('heroImg').src = saved;
  }

  function initCoverAndReset() {
    $('coverBtn').addEventListener('click', () => $('coverInput').click());
    // 封面照片本身也能点着换（手机上更直观）
    $('heroPhoto').addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('[data-editable]')) return; // 点到手写英文时仍走改字
      $('coverInput').click();
    });
    $('coverInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file);
        try { localStorage.setItem(COVER_KEY, dataUrl); } catch (err) { alert('封面太大，浏览器存不下，换小一点的图试试'); return; }
        if ($('heroImg')) $('heroImg').src = dataUrl;
        if (cloudOn()) {
          syncSettings();
          alert('封面换好了～正在同步到云端，另一台设备刷新就能看到。');
        } else {
          alert('封面换好了～只在这台设备生效；想永久生效，用页脚「固化到相册」一起导出。');
        }
      } catch (err) {
        alert('这张图片读不出来，换一张试试？');
      } finally { e.target.value = ''; }
    });

    $('resetBtn').addEventListener('click', async () => {
      if (!confirm('恢复默认？会用 data.js 里的原始内容覆盖改过的文字、封面和撕下的页面，并同步到所有设备（上传的照片不受影响）。')) return;
      try {
        localStorage.removeItem(MEM_EDIT_KEY);
        localStorage.removeItem(SITE_EDIT_KEY);
        localStorage.removeItem(COVER_KEY);
        localStorage.removeItem(SLIDE_EDIT_KEY);
        setSettingsAt(0);   // 清掉时间戳，之后的云端设置才能正常应用
      } catch (e) {}
      if (cloudOn()) {
        try { await AlbumCloud.saveSettings(collectSettings()); } catch (e) {}   // 带最新 savedAt，避免被旧数据回滚
      }
      location.reload();
    });
  }

  /* ======================================================================
   * 十一之二、换轮播图：点缩略图换照片，小字直接打字改
   * ==================================================================== */
  let pendingSlideIndex = -1;
  let slideTemp = [];   // [{image, caption}] 的临时编辑

  function initSlideEditor() {
    const rows = $('slideRows');
    const input = $('slideInput');

    function buildRows() {
      rows.innerHTML = '';
      slideTemp = getSlides().map((s) => ({ image: s.image || '', caption: s.caption || '' }));
      slideTemp.forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'slide-row';

        const thumb = document.createElement('img');
        thumb.src = s.image;
        thumb.alt = '第 ' + (i + 1) + ' 张轮播图';
        thumb.title = '点这里换照片';
        thumb.addEventListener('click', () => { pendingSlideIndex = i; input.click(); });

        const cap = document.createElement('input');
        cap.type = 'text';
        cap.value = s.caption;
        cap.placeholder = '图片下的小字（可留空），如：the green train, 3:15 pm';
        cap.addEventListener('input', () => { slideTemp[i].caption = cap.value; });

        row.appendChild(thumb);
        row.appendChild(cap);
        rows.appendChild(row);
      });
    }

    $('slidesBtn').addEventListener('click', () => {
      buildRows();
      $('slideSheet').hidden = false;
      requestAnimationFrame(() => $('slideSheet').classList.add('is-open'));
      document.body.classList.add('is-locked');
    });
    function closeSlideSheet() {
      $('slideSheet').classList.remove('is-open');
      document.body.classList.remove('is-locked');
      setTimeout(() => { $('slideSheet').hidden = true; }, 380);
    }
    $('slideCancel').addEventListener('click', closeSlideSheet);
    $('slideMask').addEventListener('click', closeSlideSheet);

    input.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file || pendingSlideIndex < 0) return;
      try {
        const dataUrl = await compressImage(file);
        slideTemp[pendingSlideIndex].image = dataUrl;
        rows.children[pendingSlideIndex].querySelector('img').src = dataUrl;
      } catch (err) {
        alert('这张图片读不出来，换一张试试？');
      } finally { e.target.value = ''; }
    });

    $('slideForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      /* 显式检查保存是否成功（浏览器空间满时 setItem 会抛错，之前被静默吞掉，表现为「没反应」） */
      let saved = false;
      try { localStorage.setItem(SLIDE_EDIT_KEY, JSON.stringify({ slides: slideTemp })); saved = true; }
      catch (err) {}
      if (!saved) {
        alert('存不下：浏览器空间不够了。\n试着换小一点的图片，或先恢复默认清掉旧轮播图再换。');
        return;
      }
      closeSlideSheet();
      if (cloudOn()) { try { await AlbumCloud.saveSettings(collectSettings(), true); } catch (err) {} }
      setTimeout(() => location.reload(), 350);
    });
  }

  /* ======================================================================
   * 十二、换主题：配色 / 明暗 / 字体（手机上也能直接打字改）
   * ==================================================================== */
  const THEME_KEY = 'shiguang-theme';
  const FONT_PRESETS = {
    kai:  '"Kaiti SC", "STKaiti", "KaiTi", "DFKai-SB", serif',
    hei:  '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    song: '"Songti SC", "SimSun", "Noto Serif SC", Georgia, serif'
  };
  const THEME_PRESETS = [
    { name: '镰仓夏日', colors: ['#6ea8c9', '#4a7043', '#e5c85a', '#c9a3c4', '#4a7fa5', '#d98e73'] },
    { name: '黄昏列车', colors: ['#e8a468', '#5b7fa5', '#d9777f', '#8a9b68', '#c9b458', '#6ea8c9'] },
    { name: '雨后紫阳花', colors: ['#8fa8c9', '#c9a3c4', '#7d9b8a', '#6d84a8', '#b7c9a8', '#d9b0c4'] },
    { name: '动画黄昏', colors: ['#f2a65e', '#5d84b0', '#c96f6f', '#88a878', '#e8c97a', '#7a94b8'] },
    { name: '深夜站台', colors: ['#6d7f92', '#4f6b5c', '#c9a25c', '#8d6f8a', '#3f5a72', '#b3735f'] }
  ];

  let themeEdits = loadJSON(THEME_KEY);   // { palette:[], mode:'light'|'dark', font:'' }

  function applyThemeEdits() {
    const root = document.documentElement;
    const pal = (themeEdits.palette && themeEdits.palette.length === COLORS.length)
      ? themeEdits.palette
      : COLORS;
    pal.forEach((c, i) => root.style.setProperty('--c' + (i + 1), c));
    if (themeEdits.mode) root.setAttribute('data-theme', themeEdits.mode);
    if (themeEdits.font) root.style.setProperty('--font-hand', themeEdits.font);
    // 主题色同步到浏览器 UI（手机地址栏颜色）
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', (themeEdits.mode === 'dark') ? '#222b34' : '#f7f3e8');
    return pal;
  }

  function currentPalette() {
    return (themeEdits.palette && themeEdits.palette.length === COLORS.length) ? themeEdits.palette.slice() : COLORS.slice();
  }

  function initThemePanel() {
    let pal = currentPalette();
    const colorInputs = [];

    /* 预设整套配色 */
    const presetsBox = $('themePresets');
    const presetBtns = [];
    THEME_PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-preset';
      b.innerHTML = '<span>' + p.name + '</span>';
      b.addEventListener('click', () => {
        pal = p.colors.slice();
        syncColorInputs();
        liveApply();
        presetBtns.forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
      });
      presetsBox.appendChild(b);
      presetBtns.push(b);
    });

    /* 六个颜色：色块 + 手输色值 */
    const box = $('themeColors');
    const NAMES = ['色 1', '色 2', '色 3', '色 4', '色 5', '色 6'];
    function syncColorInputs() {
      colorInputs.forEach((row, i) => {
        row.picker.value = pal[i];
        row.text.value = pal[i];
        row.dots.forEach((d, k) => { d.style.background = colorAt(k + i); });
      });
    }
    function liveApply() {
      pal.forEach((c, i) => document.documentElement.style.setProperty('--c' + (i + 1), c));
    }

    pal.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'theme-row';

      const name = document.createElement('span');
      name.className = 'theme-row__name';
      name.textContent = NAMES[i];

      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = c;
      picker.addEventListener('input', () => { pal[i] = picker.value; row.text.value = picker.value; liveApply(); });

      const text = document.createElement('input');
      text.type = 'text';
      text.value = c;
      text.setAttribute('inputmode', 'text');
      text.addEventListener('input', () => {
        const v = text.value.trim();
        if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
          pal[i] = v.startsWith('#') ? v : '#' + v;
          picker.value = pal[i];
          liveApply();
        }
      });

      const dots = document.createElement('span');
      dots.className = 'theme-dots';
      const dotEls = [];
      for (let k = 0; k < 3; k++) { const d = document.createElement('i'); dots.appendChild(d); dotEls.push(d); }

      row.appendChild(name); row.appendChild(picker); row.appendChild(text); row.appendChild(dots);
      box.appendChild(row);
      colorInputs.push({ picker: picker, text: text, dots: dotEls });
    });
    syncColorInputs();

    /* 明暗 */
    const modeBtns = [$('modeLight'), $('modeDark')];
    function setMode(m) {
      document.documentElement.setAttribute('data-theme', m);
      themeEdits.mode = m;
      try { localStorage.setItem('album-theme', m); } catch (e) {}
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', m === 'dark' ? '#222b34' : '#f7f3e8');
      modeBtns.forEach((b) => b.classList.toggle('is-active', b.id === (m === 'dark' ? 'modeDark' : 'modeLight')));
    }
    modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.id === 'modeDark' ? 'dark' : 'light')));

    /* 字体：预设按钮 + 手输 */
    const fontBtns = document.querySelectorAll('[data-font]');
    fontBtns.forEach((b) => b.addEventListener('click', () => {
      $('fFont').value = FONT_PRESETS[b.dataset.font];
      document.documentElement.style.setProperty('--font-hand', FONT_PRESETS[b.dataset.font]);
      fontBtns.forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
    }));
    $('fFont').addEventListener('input', () => {
      const v = $('fFont').value.trim();
      if (v) document.documentElement.style.setProperty('--font-hand', v);
    });

    /* 打开 / 关闭 */
    function openTheme() {
      pal = currentPalette();
      themeEdits = loadJSON(THEME_KEY);
      syncColorInputs();
      const nowMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      modeBtns.forEach((b) => b.classList.toggle('is-active', b.id === (nowMode === 'dark' ? 'modeDark' : 'modeLight')));
      $('fFont').value = themeEdits.font || (typeof FONT !== 'undefined' && FONT.hand ? FONT.hand : '');
      $('themeSheet').hidden = false;
      requestAnimationFrame(() => $('themeSheet').classList.add('is-open'));
      document.body.classList.add('is-locked');
    }
    function closeTheme() {
      $('themeSheet').classList.remove('is-open');
      document.body.classList.remove('is-locked');
      setTimeout(() => { $('themeSheet').hidden = true; }, 380);
    }
    $('themeBtn').addEventListener('click', openTheme);
    $('themeCancel').addEventListener('click', () => { applyThemeEdits(); closeTheme(); });
    $('themeMask').addEventListener('click', () => { applyThemeEdits(); closeTheme(); });

    /* 保存 */
    $('themeForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const next = loadJSON(THEME_KEY);
      next.palette = pal.slice();
      next.mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const fv = $('fFont').value.trim();
      next.font = fv || '';
      themeEdits = next;
      saveJSON(THEME_KEY, next);
      applyThemeEdits();
      syncSettings();
      closeTheme();
    });

    /* 复制色板代码 / 恢复默认 */
    $('themeCopy').addEventListener('click', () => {
      const code = 'const PALETTE = ' + JSON.stringify(pal) + ';';
      const font = $('fFont').value.trim();
      const full = font ? code + '\nconst FONT = Object.assign({}, FONT, { hand: ' + JSON.stringify(font) + ' });' : code;
      const done = () => alert('已复制，粘到 data.js 里就永久生效了：\n\n' + full);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(full).then(done, () => prompt('手动复制：', full));
      } else {
        prompt('手动复制：', full);
      }
    });
    $('themeReset').addEventListener('click', () => {
      if (!confirm('恢复默认主题？会清掉这台设备改过的配色和字体。')) return;
      try { localStorage.removeItem(THEME_KEY); } catch (e) {}
      location.reload();
    });
  }

  /* ======================================================================
   * 十三、浅色 / 深色 & 顶部条
   * ==================================================================== */
  function initTheme() {
    $('themeToggle').addEventListener('click', () => {
      const now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', now);
      try { localStorage.setItem('album-theme', now); } catch (e) {}
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', now === 'dark' ? '#222b34' : '#f7f3e8');
      const t = loadJSON(THEME_KEY);
      t.mode = now;
      themeEdits = t;
      saveJSON(THEME_KEY, t);
      syncSettings();
    });
  }
  function initTopbar() {
    const bar = $('topbar');
    const onScroll = () => bar.classList.toggle('is-shown', window.scrollY > window.innerHeight * 0.55);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ======================================================================
   * 十四、装到手机桌面（PWA：全屏打开 + 离线可用）
   * ==================================================================== */
  function initInstall() {
    const btn = $('installBtn');
    const sep = $('installSep');
    if (!btn) return;

    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
      if (sep) sep.hidden = false;
    });

    btn.addEventListener('click', async () => {
      if (deferred) {
        deferred.prompt();
        const r = await deferred.userChoice;
        if (r && r.outcome === 'accepted') { btn.hidden = true; if (sep) sep.hidden = true; }
        deferred = null;
        return;
      }
      // iOS / 已经装好的情况：给出手动步骤
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua);
      alert('把这本手账放到手机桌面：\n\n' +
        (isIOS
          ? 'Safari 底部「分享」按钮 → 添加到主屏幕'
          : 'Chrome 右上角 ⋮ → 添加到主屏幕 / 安装应用') +
        '\n\n之后就能像 App 一样全屏打开，还能离线翻看。');
    });

    // 已经作为 App 打开时（standalone）就不需要这个按钮了
    if (window.matchMedia('(display-mode: standalone)').matches) { btn.hidden = true; if (sep) sep.hidden = true; }
  }

  /* ======================================================================
   * 启动
   * ==================================================================== */
  (async function start() {
    /* 先拉云端（照片 + 封面/轮播/文字/主题设置），再初始化页面 */
    let cloudData = null;
    if (cloudOn()) {
      try { cloudData = await AlbumCloud.load(); }
      catch (e) { console.warn('云端拉取失败，先用本机数据', e); }
    }
    if (cloudData) {
      applyCloudSettings(cloudData.settings);

      /* 先读出本机旧照片（必须在覆盖本机之前读，否则会丢） */
      let localItems = [];
      try { localItems = await storeAll(); } catch (e) {}
      customs = cloudData.memories;

      /* 一次性补传：本机有、云端还没有的照片，自动推上云端 */
      let hasToken = false;
      try { hasToken = !!(window.CLOUD && window.CLOUD.token) || !!localStorage.getItem('gh_album_token'); } catch (e) {}
      if (hasToken && localItems.length) {
        try {
          const ids = new Set(customs.map((m) => String(m.id)));
          const missing = localItems.filter((m) => !ids.has(String(m.id))).slice(0, 30);
          for (const m of missing) {
            try {
              const row = await AlbumCloud.insert(AlbumCloud.toRow(m));
              customs.unshift(row);
            } catch (e) { break; }
          }
        } catch (e) {}
      }
      try { await dbReplaceAll(customs); } catch (e) {}
    }

    initSite();
    applySavedCover();
    initEditableTexts();
    applyThemeEdits();     // 配色 / 明暗 / 字体（云端优先，其次本机）
    initThemePanel();
    initTheme();
    initTopbar();
    initSlideshow();
    initSlideEditor();
    initLightbox();
    initSheet();
    initBackup();
    initCoverAndReset();
    const stEl = $('syncStatus');
    if (stEl) {
      stEl.textContent = cloudOn()
        ? '☁ 云端已连接：上传 / 换封面会自动同步，点「☁ 同步到云端」可手动把本机旧照片推上去。'
        : '⚠ 未连接云端（本机模式）。';
    }
    if (!cloudData) {
      try { customs = await loadCustoms(); } catch (e) { customs = []; }
    }
    buildWorkingMemories();
    initTimeline();

    /* 注销旧 service worker：它缓存优先旧 JS，会挡住每次部署的新代码。
       注销后页面每次都从 GitHub Pages 拉最新，保证两台手机都跑同一份云同步代码。
       （代价：失去离线打开，换来可靠的跨设备同步，更划算） */
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) { try { await r.unregister(); } catch (e) {} }
      } catch (e) {}
    }

    /* 自动体检：把本机状态上报到云端（不含照片内容），每 3 分钟最多一次。
       这样不需要你在手机上描述，我直接读云端就能看到你手机的真实情况。 */
    if (cloudOn()) {
      try {
        const last = parseInt(sessionStorage.getItem('diagAt') || '0', 10) || 0;
        if (Date.now() - last > 180000) {
          sessionStorage.setItem('diagAt', String(Date.now()));
          let quotaOk = true;
          try { localStorage.setItem('__qtest', 'x'.repeat(50000)); localStorage.removeItem('__qtest'); }
          catch (e) { quotaOk = false; }
          let localMem = 0;
          try { localMem = (await storeAll()).length; } catch (e) {}
          AlbumCloud.saveDiag({
            v: 'h',
            swCtrl: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
            cloudOn: cloudOn(),
            token: !!(window.CLOUD && window.CLOUD.tokenParts) || !!localStorage.getItem('gh_album_token'),
            localMem: localMem,
            cloudMem: customs.length,
            slidesLocal: getSlides().length,
            slideSaved: !!localStorage.getItem(SLIDE_EDIT_KEY),
            quotaOk: quotaOk,
            ua: (navigator.userAgent || '').slice(0, 90),
            err: window.__albumErr || ''
          }).catch(() => {});
        }
      } catch (e) {}
    }
    /* 后台自动同步：对方改了内容/照片，本机每隔几秒自动拉取并刷新（无需手动刷新） */
    if (cloudOn()) {
      try {
        const memIds = (cloudData && cloudData.memories ? cloudData.memories : []).map((m) => String(m.id)).join(',');
        const sAt = cloudData && cloudData.settings ? (cloudData.settings.savedAt || 0) : 0;
        lastCloudSig = memIds + '|' + sAt;
      } catch (e) {}
      setInterval(cloudPoll, 12000);
    }

    initInstall();
  })();
})();
