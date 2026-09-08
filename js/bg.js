// iTab service worker —— 简单保留扩展运行环境
self.addEventListener("install", (e) => { /* noop */ });
chrome.runtime.onInstalled.addListener(() => {
  // 后续可以加 migration / 通知 / 一键导入
});
