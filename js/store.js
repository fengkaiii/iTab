/* iTab storage layer
 * - 优先使用 chrome.storage.local（跨设备同步可后续改用 chrome.storage.sync）
 * - 在本地 file:// 预览时降级到 localStorage，方便开发与演示
 */
(function (root) {
  "use strict";

  const STORAGE_KEY = "itab.v1";
  const hasChromeStorage = !!(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local);

  // 默认站点（首次打开就有内容）
  const DEFAULT_ITEMS = [
    { title: "GitHub",    url: "https://github.com",         emoji: "", group: "开发" },
    { title: "MDN",       url: "https://developer.mozilla.org", emoji: "", group: "开发" },
    { title: "StackOverflow", url: "https://stackoverflow.com", emoji: "", group: "开发" },
    { title: "CanIUse",   url: "https://caniuse.com",        emoji: "✅", group: "开发" },
    { title: "YouTube",   url: "https://www.youtube.com",    emoji: "" },
    { title: "Wikipedia", url: "https://www.wikipedia.org",  emoji: "📚" },
    { title: "X",         url: "https://x.com",              emoji: "" },
    { title: "Reddit",    url: "https://www.reddit.com",     emoji: "" },
    { title: "Hacker News", url: "https://news.ycombinator.com", emoji: "🧡" },
    { title: "Bing",      url: "https://www.bing.com",       emoji: "" },
    { title: "ChatGPT",   url: "https://chat.openai.com",    emoji: "💬", group: "AI" },
    { title: "DeepSeek",  url: "https://chat.deepseek.com",  emoji: "🐋", group: "AI" },
    { title: "掘金",      url: "https://juejin.cn",          emoji: "⛏️", group: "中文" },
    { title: "知乎",      url: "https://www.zhihu.com",      emoji: "🤔", group: "中文" },
    { title: "Bilibili",  url: "https://www.bilibili.com",   emoji: "📺", group: "中文" },
    { title: "豆瓣",      url: "https://www.douban.com",     emoji: "🟢", group: "中文" }
  ].map((s, i) => ({
    id: "d" + (1000 + i),
    title: s.title,
    url: s.url,
    icon: { type: "auto", value: "" },
    emoji: s.emoji || "",
    openIn: "new",
    group: s.group || ""
  }));

  const DEFAULT_SETTINGS = {
    background: "sonoma",   // sonoma | monterey | bigsur | mojave | dark | ocean | sakura
    customBg: "",           // dataURL 自定义背景图
    bgBlur: 22,             // 背景模糊
    bgDim: 18,              // 背景暗化 %
    columns: 7,             // 网格列数（auto 时根据宽度）
    autoColumns: true,      // 自适应列数
    iconSize: 76,           // 图标 px
    labelSize: 13,          // 标签字号
    showLabels: true,
    showSearch: true,
    searchEngine: "google", // google | bing | duckduckgo | baidu
    openIn: "new",          // new | current
    iconSource: "auto",     // auto | duckduckgo | google | direct
    groupMode: false,       // 分组模式：开启后按 group 字段归类显示
    groupOrder: []          // 分组显示顺序（数组，不含「未分组」；空 = 首次出现顺序）
  };

  function uid() {
    return "i" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  // 搜索引擎（聚合搜索下拉与回车搜索共用）
  const ENGINES = {
    google: { name: "Google", short: "G", color: "#4285F4", url: function (q) { return "https://www.google.com/search?q=" + encodeURIComponent(q); } },
    bing:   { name: "Bing",   short: "B", color: "#008373", url: function (q) { return "https://www.bing.com/search?q=" + encodeURIComponent(q); } }
  };

  function blank() {
    return {
      version: 1,
      items: DEFAULT_ITEMS.slice(),
      settings: Object.assign({}, DEFAULT_SETTINGS)
    };
  }

  function migrate(data) {
    if (!data || typeof data !== "object") return blank();
    if (!data.version) data.version = 1;
    if (!Array.isArray(data.items)) data.items = [];
    if (!data.settings) data.settings = {};
    // fill missing settings
    for (const k in DEFAULT_SETTINGS) {
      if (!(k in data.settings)) data.settings[k] = DEFAULT_SETTINGS[k];
    }
    return data;
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("iTab: read local failed", e);
      return null;
    }
  }

  function writeLocal(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("iTab: write local failed", e);
    }
  }

  function load() {
    return new Promise(function (resolve) {
      if (hasChromeStorage) {
        chrome.storage.local.get([STORAGE_KEY], function (res) {
          const data = res && res[STORAGE_KEY] ? res[STORAGE_KEY] : blank();
          resolve(migrate(data));
        });
      } else {
        const data = readLocal() || blank();
        resolve(migrate(data));
      }
    });
  }

  function save(data) {
    return new Promise(function (resolve) {
      if (hasChromeStorage) {
        chrome.storage.local.set({ [STORAGE_KEY]: data }, function () { resolve(); });
      } else {
        writeLocal(data);
        resolve();
      }
    });
  }

  function onChange(cb) {
    if (hasChromeStorage && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === "local" && changes[STORAGE_KEY]) {
          cb(migrate(changes[STORAGE_KEY].newValue));
        }
      });
    }
  }

  function clearAll() {
    return new Promise(function (resolve) {
      if (hasChromeStorage) {
        chrome.storage.local.remove(STORAGE_KEY, function () { resolve(); });
      } else {
        localStorage.removeItem(STORAGE_KEY);
        resolve();
      }
    });
  }

  root.itabStore = {
    DEFAULT_ITEMS: DEFAULT_ITEMS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    ENGINES: ENGINES,
    uid: uid,
    load: load,
    save: save,
    onChange: onChange,
    clearAll: clearAll,
    hasChromeStorage: hasChromeStorage
  };
})(typeof window !== "undefined" ? window : this);
