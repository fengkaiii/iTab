/* iTab · filestore.js —— 多浏览器共享数据
 * 通过 File System Access API 读写一个用户指定的 JSON 文件，实现「指定目录/文件存放」。
 * 手动按钮触发（顶栏同步图标 / 设置里加载、保存），避免 macOS 扩展环境下自动同步的权限坑。
 * 文件句柄持久化到 IndexedDB（同源，各浏览器各自保存；需在每个浏览器里分别指向同一文件）。
 */
(function (root) {
  "use strict";

  const DB_NAME = "itab-fs";
  const DB_STORE = "kv";
  const KEY = "sharedFile"; // 存 { handle: FileSystemFileHandle, name: string }

  function isSupported() {
    return !!(typeof window !== "undefined" && window.showOpenFilePicker);
  }

  // ---- IndexedDB 极简封装 ----
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB 不可用")); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(DB_STORE, "readonly");
        const rq = tx.objectStore(DB_STORE).get(KEY);
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { reject(rq.error); };
      });
    });
  }

  function idbPut(val) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(val, KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbDel() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function friendly(err) {
    if (!err) return "未知错误";
    if (err.name === "NotAllowedError") return "没有文件访问权限";
    if (err.name === "SecurityError") return "安全策略禁止访问该文件";
    if (err.name === "AbortError") return "已取消";
    return err.message || err.name || String(err);
  }

  // 确保句柄具备指定权限（read / readwrite），必要时弹授权
  async function ensurePermission(handle, mode) {
    if (!handle || typeof handle.queryPermission !== "function") return true;
    let state;
    try { state = await handle.queryPermission({ mode: mode }); }
    catch (e) { return false; }
    if (state === "granted") return true;
    if (state === "denied") return false;
    if (typeof handle.requestPermission === "function") {
      try { state = await handle.requestPermission({ mode: mode }); return state === "granted"; }
      catch (e) { return false; }
    }
    return false;
  }

  async function pick() {
    if (!isSupported()) throw new Error("当前浏览器不支持文件系统访问 API");
    const handles = await window.showOpenFilePicker({
      id: "itab-shared",
      multiple: false,
      types: [{ description: "JSON 文件", accept: { "application/json": [".json"] } }]
    });
    const handle = handles[0];
    const name = handle.name || "itab-data.json";
    await idbPut({ handle: handle, name: name });
    return { name: name };
  }

  async function getMeta() {
    if (!isSupported()) return null;
    return await idbGet();
  }

  async function load() {
    const rec = await getMeta();
    if (!rec) throw new Error("尚未指定共享文件");
    const ok = await ensurePermission(rec.handle, "read");
    if (!ok) throw new Error("未获得文件读取权限");
    const file = await rec.handle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  }

  async function save(data) {
    const rec = await getMeta();
    if (!rec) throw new Error("尚未指定共享文件");
    const ok = await ensurePermission(rec.handle, "readwrite");
    if (!ok) throw new Error("未获得文件写入权限");
    const writable = await rec.handle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }

  async function clear() {
    await idbDel();
  }

  root.itabFileStore = {
    isSupported: isSupported,
    pick: pick,
    get: getMeta,
    load: load,
    save: save,
    clear: clear,
    friendly: friendly
  };
})(typeof window !== "undefined" ? window : this);
