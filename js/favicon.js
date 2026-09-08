/* iTab favicon resolver: multi-source fallback chain
 * 返回一个能在 <img> 上链式回退使用的 URL 列表与工具函数。
 *
 * 数据形态：
 *   icon = { type: "auto"|"url"|"emoji"|"letter"|"upload"|"color",
 *            value: <url|""|emoji|string|letter>,
 *            bg?: <css color> }
 */
(function (root) {
  "use strict";

  function safeHostname(input) {
    try {
      const u = new URL(input);
      return u.hostname;
    } catch (e) {
      return "";
    }
  }

  // 各源 URL 模板
  const SOURCES = {
    auto: function (host) {
      return [
        "https://" + host + "/favicon.ico",
        "https://www.google.com/s2/favicons?domain=" + host + "&sz=128",
        "https://icons.duckduckgo.com/ip3/" + host + ".ico"
      ];
    },
    duckduckgo: function (host) { return ["https://icons.duckduckgo.com/ip3/" + host + ".ico"]; },
    google: function (host) { return ["https://www.google.com/s2/favicons?domain=" + host + "&sz=128"]; },
    direct: function (host) { return ["https://" + host + "/favicon.ico"]; }
  };

  // 给一个 URL 字符串，链式回退地尝试加载图片，全部失败后由 onAllFail 触发。
  // 返回当前使用的 URL（先返回最优先）；调用方把 URL 放到 <img src>，再调用 attachFallbacks
  function candidateUrls(rawUrl, source) {
    const host = safeHostname(rawUrl);
    if (!host) return [];
    const fn = SOURCES[source] || SOURCES.auto;
    return fn(host);
  }

  // 给一个图片 DOM 元素，绑定链式回退；全部失败时调用 onAllFail。
  function attachFallbacks(img, rawUrl, source, onAllFail) {
    const urls = candidateUrls(rawUrl, source);
    if (!urls.length) {
      onAllFail && onAllFail();
      return;
    }
    let idx = 0;
    let stopped = false;
    function next() {
      if (stopped) return;
      if (idx >= urls.length) {
        stopped = true;
        onAllFail && onAllFail();
        return;
      }
      img.onload = function () {
        if (stopped) return;
        // 图标太小时（< 8 像素）也视为失败
        if (img.naturalWidth && img.naturalWidth < 8) {
          idx++;
          next();
        }
      };
      img.onerror = function () {
        if (stopped) return;
        idx++;
        next();
      };
      img.src = urls[idx];
    }
    next();
  }

  // 把 emoji 转成 dataURL（用于编辑预览/单色背景大图）
  function emojiToDataUrl(emoji, size) {
    size = size || 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.font = Math.floor(size * 0.72) + "px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji || "★", size / 2, size / 2 + 4);
    return c.toDataURL("image/png");
  }

  // 把首字母 + 渐变色生成 dataURL
  function letterToDataUrl(letter, bg1, bg2) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    // gradient bg
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, bg1 || "#6366F1");
    g.addColorStop(1, bg2 || "#22D3EE");
    ctx.fillStyle = g;
    const r = size * 0.22;
    roundRect(ctx, 0, 0, size, size, r);
    ctx.fill();
    // letter
    ctx.fillStyle = "#fff";
    ctx.font = "600 " + Math.floor(size * 0.5) + "px -apple-system, 'Helvetica Neue', 'PingFang SC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((letter || "?").toUpperCase(), size / 2, size / 2 + 6);
    return c.toDataURL("image/png");
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 文件转 dataURL（缩放到 <= 256px 以节省存储）
  function fileToIconDataUrl(file, maxSize) {
    maxSize = maxSize || 256;
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () {
        const img = new Image();
        img.onload = function () {
          const c = document.createElement("canvas");
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > h && w > maxSize) { h = h * maxSize / w; w = maxSize; }
          else if (h > maxSize) { w = w * maxSize / h; h = maxSize; }
          c.width = Math.max(1, Math.round(w));
          c.height = Math.max(1, Math.round(h));
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // 域名→首字母 + 选色（基于 hash）
  function pickColors(host) {
    let h = 0;
    for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
    const palette = [
      ["#6366F1", "#22D3EE"],
      ["#8B5CF6", "#EC4899"],
      ["#0EA5E9", "#10B981"],
      ["#F43F5E", "#F59E0B"],
      ["#14B8A6", "#3B82F6"],
      ["#A855F7", "#F472B6"],
      ["#06B6D4", "#84CC16"],
      ["#FB7185", "#FBBF24"],
      ["#475569", "#0EA5E9"]
    ];
    return palette[h % palette.length];
  }

  function firstChar(title, host) {
    if (title && title.trim()) return title.trim().charAt(0);
    if (host) {
      const parts = host.split(".");
      return parts.length >= 2 ? parts[parts.length - 2].charAt(0) : host.charAt(0);
    }
    return "?";
  }

  root.itabIcon = {
    candidateUrls: candidateUrls,
    attachFallbacks: attachFallbacks,
    safeHostname: safeHostname,
    emojiToDataUrl: emojiToDataUrl,
    letterToDataUrl: letterToDataUrl,
    fileToIconDataUrl: fileToIconDataUrl,
    pickColors: pickColors,
    firstChar: firstChar
  };
})(typeof window !== "undefined" ? window : this);
