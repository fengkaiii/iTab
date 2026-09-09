/* iTab · app.js —— 顶层交互（弹窗、设置、背景、导入导出） */
(function () {
  "use strict";

  const $ = function (s, c) { return (c || document).querySelector(s); };
  const $$ = function (s, c) { return Array.from((c || document).querySelectorAll(s)); };

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "style") e.setAttribute("style", attrs[k]);
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (children) for (const c of children) if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return e;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    t.style.animation = "none";
    void t.offsetWidth;
    t.style.animation = "";
    clearTimeout(t._tm);
    t._tm = setTimeout(() => { t.hidden = true; }, 2400);
  }

  function normalizeUrl(u) {
    u = (u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) {
      // 看起来像域名就补 https；否则原样
      if (/^[\w-]+(\.[\w-]+)+/.test(u)) return "https://" + u;
      // 搜索词 → 保留原样
      return u;
    }
    return u;
  }

  // 背景主题
  const BACKGROUNDS = {
    sonoma:  ["#f5634d", "#f7b955", "#ff5e62", "#ff1e56", "#5e2078"],
    monterey:["#1a237e", "#5e35b1", "#bf5af2", "#ff375f", "#0a84ff"],
    bigsur:  ["#0093E9", "#80D0C7", "#5ee7df", "#b490ca", "#2c3e50"],
    mojave:  ["#232526", "#414345", "#c2a26a", "#5b3a29", "#232526"],
    ocean:   ["#0f2027", "#203a43", "#2c5364", "#0a84ff", "#001a23"],
    sakura:  ["#fbc2eb", "#a6c1ee", "#f6d365", "#fda085", "#fbc2eb"],
    dark:    ["#0a0a0a", "#1c1c1e", "#2c2c2e", "#3a3a3c", "#0a0a0a"]
  };

  function applyBackground(settings) {
    const layer = $("#bgLayer");
    const bg = settings.background;
    if (bg === "custom" && settings.customBg) {
      layer.classList.add("has-image");
      layer.style.backgroundImage = "url('" + settings.customBg + "')";
    } else {
      layer.classList.remove("has-image");
      layer.style.backgroundImage = "";
      const c = BACKGROUNDS[bg] || BACKGROUNDS.sonoma;
      layer.style.setProperty("--bg-1", c[0]);
      layer.style.setProperty("--bg-2", c[1]);
      layer.style.setProperty("--bg-3", c[2]);
      layer.style.setProperty("--bg-4", c[3]);
      layer.style.setProperty("--bg-5", c[4]);
    }
    document.body.setAttribute("data-bg", bg);
    layer.style.setProperty("--bg-blur", settings.bgBlur + "px");
    layer.style.setProperty("--bg-dim", String(settings.bgDim));
    document.documentElement.style.setProperty("--bg-blur", settings.bgBlur + "px");
  }

  // ---- App ----
  class App {
    constructor() {
      this.state = null;
      this.lp = null;
      this.editingId = null;
    }

    async init() {
      this.state = await itabStore.load();
      // URL ?bg= & ?edit=1 & ?demo=1 调试入口
      const url = new URL(location.href);
      if (url.searchParams.get("bg")) this.state.settings.background = url.searchParams.get("bg");
      if (url.searchParams.get("blur")) this.state.settings.bgBlur = +url.searchParams.get("blur");
      if (url.searchParams.get("dim")) this.state.settings.bgDim = +url.searchParams.get("dim");
      if (url.searchParams.get("edit") === "1") document.body.classList.add("edit-mode");
      if (url.searchParams.get("group") === "1") this.state.settings.groupMode = true;
      if (url.searchParams.get("fresh") === "1") this.state.items = itabStore.DEFAULT_ITEMS.slice();
      if (url.searchParams.get("order")) this.state.settings.groupOrder = url.searchParams.get("order").split(",");
      // 数据初始化
      this._normalize();
      this.lp = new itabLaunchpad(this.state);
      applyBackground(this.state.settings);
      this._wire();
      this.lp.render();
      this._syncGroupToggle();
      itabStore.onChange((data) => { this.state = data; this._normalize(); applyBackground(this.state.settings); this.lp.setState(this.state); this._syncGroupToggle(); });
      // 监听来自启动台的事件
      window.addEventListener("itab:request-add", (e) => this.openAdd((e.detail && e.detail.group) || ""));
      window.addEventListener("itab:request-edit", (e) => {
        const { id, remove } = e.detail || {};
        if (remove) {
          this._removeItem(id);
        } else {
          this.openEdit(id);
        }
      });
      window.addEventListener("itab:items-reordered", (e) => {
        this.state.items = e.detail.items;
        this._persist();
      });
      window.addEventListener("itab:group-reordered", (e) => {
        this.state.settings.groupOrder = e.detail.order;
        this._persist();
      });

      // URL 调试入口
      if (url.searchParams.get("demo") === "1") this.openAdd();
      if (url.searchParams.get("settings") === "1") this.openSettings();
      if (url.searchParams.get("se") === "1") this._toggleEngineMenu();
    }

    _normalize() {
      // 保证字段齐全
      this.state.settings = Object.assign({}, itabStore.DEFAULT_SETTINGS, this.state.settings);
      // 搜索引擎若已被移除（如旧数据的 baidu/duckduckgo），回退到 google
      if (!itabStore.ENGINES[this.state.settings.searchEngine]) {
        this.state.settings.searchEngine = "google";
      }
      for (const it of this.state.items) {
        if (!it.id) it.id = itabStore.uid();
        if (!it.icon) it.icon = { type: "auto", value: "" };
        if (typeof it.openIn !== "string") it.openIn = "new";
        if (typeof it.group !== "string") it.group = "";
      }
    }

    async _persist() {
      await itabStore.save(this.state);
    }

    _toggleGroupMode() {
      this.state.settings.groupMode = !this.state.settings.groupMode;
      this._persist().then(() => {
        this._syncGroupToggle();
        this.lp.render();
        toast(this.state.settings.groupMode ? "已开启分组模式" : "已关闭分组模式");
      });
    }

    // 同步顶栏分组按钮与设置面板 checkbox 的激活态
    _syncGroupToggle() {
      const on = !!this.state.settings.groupMode;
      const btn = $("#btnGroupToggle");
      if (btn) {
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.title = on ? "分组模式：开（点击关闭）" : "分组模式：关（点击开启）";
      }
      const cb = $("#fGroupMode");
      if (cb) cb.checked = on;
    }

    // === 搜索引擎切换（聚合搜索下拉）===
    _renderEngineMenu() {
      const menu = $("#searchEngineMenu");
      if (!menu) return;
      menu.innerHTML = "";
      const cur = this.state.settings.searchEngine;
      Object.keys(itabStore.ENGINES).forEach((key) => {
        const eng = itabStore.ENGINES[key];
        const item = el("div", { class: "se-item" + (key === cur ? " active" : ""), "data-engine": key });
        item.appendChild(el("span", { class: "se-badge", style: "background:" + eng.color, text: eng.short }));
        item.appendChild(el("span", { class: "se-name", text: eng.name }));
        if (key === cur) item.appendChild(el("span", { class: "se-check", html: "✓" }));
        item.addEventListener("click", () => this._selectEngine(key));
        menu.appendChild(item);
      });
    }

    _toggleEngineMenu() {
      const menu = $("#searchEngineMenu");
      if (!menu) return;
      menu.hidden = !menu.hidden;
      this._syncEngineBtn();
    }

    _syncEngineBtn() {
      const menu = $("#searchEngineMenu");
      const btn = $("#btnSearchEngine");
      const open = !!(menu && !menu.hidden);
      if (btn) {
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.classList.toggle("open", open);
      }
    }

    _selectEngine(key) {
      if (!itabStore.ENGINES[key]) return;
      this.state.settings.searchEngine = key;
      this._persist().then(() => {
        this._renderEngineMenu();
        $("#searchEngineMenu").hidden = true;
        this._syncEngineBtn();
        toast("已切换到 " + itabStore.ENGINES[key].name);
        // 搜索框已有内容时，直接改用新引擎搜索
        const q = ($("#searchInput").value || "").trim();
        if (q) root.open(itabStore.ENGINES[key].url(q), "_blank", "noopener,noreferrer");
      });
    }

    _wire() {
      // 顶栏按钮
      $("#btnAdd").addEventListener("click", () => this.openAdd());
      $("#btnSettings").addEventListener("click", () => this.openSettings());
      $("#btnGroupToggle").addEventListener("click", () => this._toggleGroupMode());
      $("#btnSync").addEventListener("click", () => this._syncNow());
      $("#btnSaveSharedBar").addEventListener("click", () => this._saveSharedQuick());

      // 搜索引擎切换（聚合搜索下拉）
      $("#btnSearchEngine").addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggleEngineMenu();
      });
      this._renderEngineMenu();
      document.addEventListener("click", (e) => {
        const menu = $("#searchEngineMenu");
        if (menu && !menu.hidden && !e.target.closest("#searchWrap")) {
          menu.hidden = true;
          this._syncEngineBtn();
        }
      });

      // 弹窗遮罩关闭
      $$(".modal-mask").forEach((m) => m.addEventListener("click", () => this._closeAllModals()));
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const open = $$(".modal:not([hidden])");
          if (open.length) this._closeAllModals();
        }
      });

      // 站点弹窗
      this._wireItemModal();
      // 设置弹窗
      this._wireSettingsModal();
    }

    _closeAllModals() {
      $$(".modal").forEach((m) => m.hidden = true);
    }

    // ============ 站点弹窗 ============
    _wireItemModal() {
      const tabs = $$(".icon-tab", $("#iconPicker"));
      tabs.forEach((t) => t.addEventListener("click", () => {
        tabs.forEach((x) => x.classList.toggle("active", x === t));
        const target = t.getAttribute("data-tab");
        $$(".icon-tab-panel", $("#iconPicker")).forEach((p) => {
          p.hidden = p.getAttribute("data-panel") !== target;
        });
      }));

      $("#btnUploadIcon").addEventListener("click", () => {
        const input = $("#hiddenFile");
        input.value = "";
        input.onchange = async () => {
          const f = input.files && input.files[0];
          if (!f) return;
          try {
            const dataUrl = await itabIcon.fileToIconDataUrl(f);
            this._editDraft.icon = { type: "upload", value: dataUrl };
            this._renderIconPreview();
          } catch (e) {
            toast("读取图片失败");
          }
        };
        input.click();
      });

      // emoji / letter / 颜色 实时更新
      $("#fEmoji").addEventListener("input", (e) => {
        if (!this._editDraft) return;
        this._editDraft.icon = { type: "emoji", value: e.target.value };
        this._renderIconPreview();
      });
      $("#fLetter").addEventListener("input", (e) => {
        if (!this._editDraft) return;
        const v = (e.target.value || "").toUpperCase();
        e.target.value = v;
        this._editDraft.icon = { type: "letter", value: v, bg: this._editDraft.icon && this._editDraft.icon.bg || ["#6366F1", "#22D3EE"] };
        this._renderIconPreview();
      });
      ["fBg1", "fBg2"].forEach((id) => {
        $("#" + id).addEventListener("input", (e) => {
          if (!this._editDraft) return;
          if (this._editDraft.icon && this._editDraft.icon.type === "letter") {
            this._editDraft.icon.bg = [$("#fBg1").value, $("#fBg2").value];
            this._renderIconPreview();
          }
        });
      });

      $("#btnCancel").addEventListener("click", () => $("#modalItem").hidden = true);
      $("#btnDelete").addEventListener("click", () => {
        if (this.editingId) {
          this._removeItem(this.editingId);
          $("#modalItem").hidden = true;
        }
      });
      $("#btnSave").addEventListener("click", () => this._saveItem());
    }

    openAdd(group) {
      this.editingId = null;
      this._editDraft = {
        title: "",
        url: "",
        icon: { type: "auto", value: "" },
        openIn: this.state.settings.openIn,
        iconSource: this.state.settings.iconSource,
        group: group || ""
      };
      $("#modalItemTitle").textContent = "添加站点";
      $("#btnDelete").hidden = true;
      this._fillItemForm();
      $("#modalItem").hidden = false;
      setTimeout(() => $("#fUrl").focus(), 50);
    }

    openEdit(id) {
      const it = this.state.items.find((x) => x.id === id);
      if (!it) return;
      this.editingId = id;
      this._editDraft = {
        title: it.title,
        url: it.url,
        icon: JSON.parse(JSON.stringify(it.icon || { type: "auto", value: "" })),
        openIn: it.openIn || "new",
        iconSource: it.iconSource || this.state.settings.iconSource,
        group: it.group || ""
      };
      $("#modalItemTitle").textContent = "编辑站点";
      $("#btnDelete").hidden = false;
      this._fillItemForm();
      $("#modalItem").hidden = false;
    }

    _fillItemForm() {
      const d = this._editDraft;
      $("#fTitle").value = d.title || "";
      $("#fUrl").value = d.url || "";
      $("#fOpenIn").value = d.openIn || "new";
      $("#fIconSource").value = d.iconSource || "auto";
      $("#fGroup").value = d.group || "";
      this._updateGroupDatalist();
      // icon tabs
      const type = d.icon && d.icon.type || "auto";
      const valid = ["auto", "upload", "emoji", "letter", "url"];
      const t = valid.indexOf(type) >= 0 ? type : "auto";
      $$(".icon-tab", $("#iconPicker")).forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === t));
      $$(".icon-tab-panel", $("#iconPicker")).forEach((p) => p.hidden = p.getAttribute("data-panel") !== t);
      // pre-fill letter / emoji
      if (d.icon && d.icon.type === "letter") {
        $("#fLetter").value = d.icon.value || "";
        if (d.icon.bg && d.icon.bg.length === 2) {
          $("#fBg1").value = d.icon.bg[0]; $("#fBg2").value = d.icon.bg[1];
        }
      } else {
        $("#fLetter").value = "";
        $("#fBg1").value = "#6366F1"; $("#fBg2").value = "#22D3EE";
      }
      $("#fEmoji").value = (d.icon && d.icon.type === "emoji") ? d.icon.value : "";
      this._renderIconPreview();
    }

    _renderIconPreview() {
      const preview = $("#iconPreview");
      const draft = { url: $("#fUrl").value || "https://example.com", title: $("#fTitle").value || "?", icon: this._editDraft.icon };
      const source = $("#fIconSource").value;
      // 模拟一个 item
      const fakeItem = { title: draft.title, url: draft.url, icon: draft.icon };
      itabLaunchpad.prototype && void 0; // unused
      // 直接复用 renderIconInto
      // 由于 launchpad.js 没导出 renderIconInto，我们用本地等价：
      preview.innerHTML = "";
      const icon = el("div", { class: "tile-icon", style: "width:100px;height:100px;border-radius:22%;box-shadow:0 6px 18px rgba(0,0,0,0.22);" });
      preview.appendChild(icon);
      if (fakeItem.icon && fakeItem.icon.type === "emoji" && fakeItem.icon.value) {
        icon.style.background = "#fff";
        icon.appendChild(el("span", { class: "emoji", text: fakeItem.icon.value }));
      } else if (fakeItem.icon && fakeItem.icon.type === "letter" && fakeItem.icon.value) {
        const [c1, c2] = fakeItem.icon.bg || ["#6366F1", "#22D3EE"];
        icon.style.background = "linear-gradient(135deg," + c1 + "," + c2 + ")";
        icon.appendChild(el("span", { class: "letter", text: fakeItem.icon.value }));
      } else if (fakeItem.icon && (fakeItem.icon.type === "upload" || fakeItem.icon.type === "url") && fakeItem.icon.value) {
        icon.style.background = "#fff";
        const img = el("img", { src: fakeItem.icon.value });
        icon.appendChild(img);
      } else {
        icon.style.background = "#fff";
        const img = el("img");
        icon.appendChild(img);
        itabIcon.attachFallbacks(img, draft.url, source, function () {
          icon.innerHTML = "";
          const host = itabIcon.safeHostname(draft.url);
          const [c1, c2] = itabIcon.pickColors(host);
          icon.style.background = "linear-gradient(135deg," + c1 + "," + c2 + ")";
          icon.appendChild(el("span", { class: "letter", text: itabIcon.firstChar(draft.title, host) }));
        });
      }
    }

    _saveItem() {
      const title = $("#fTitle").value.trim() || (itabIcon.safeHostname($("#fUrl").value) || "未命名");
      const url = normalizeUrl($("#fUrl").value);
      if (!url) { toast("请填写网址"); return; }
      const data = {
        title,
        url,
        icon: this._editDraft.icon,
        openIn: $("#fOpenIn").value,
        iconSource: $("#fIconSource").value,
        group: ($("#fGroup").value || "").trim(),
        addedAt: Date.now()
      };
      if (this.editingId) {
        const idx = this.state.items.findIndex((x) => x.id === this.editingId);
        if (idx >= 0) this.state.items[idx] = Object.assign({}, this.state.items[idx], data);
      } else {
        data.id = itabStore.uid();
        this.state.items.push(data);
      }
      this._persist().then(() => {
        $("#modalItem").hidden = true;
        toast(this.editingId ? "已更新" : "已添加");
      });
    }

    _removeItem(id) {
      const idx = this.state.items.findIndex((x) => x.id === id);
      if (idx < 0) return;
      this.state.items.splice(idx, 1);
      this._persist().then(() => toast("已删除"));
    }

    // 收集所有已有分组名，填充到弹窗的 datalist 自动补全
    _updateGroupDatalist() {
      const dl = $("#groupOptions");
      if (!dl) return;
      const groups = new Set();
      this.state.items.forEach((it) => {
        const g = (it.group || "").trim();
        if (g) groups.add(g);
      });
      dl.innerHTML = "";
      Array.from(groups).sort(function (a, b) {
        return a.localeCompare(b, "zh-Hans-CN");
      }).forEach((g) => {
        const o = document.createElement("option");
        o.value = g;
        dl.appendChild(o);
      });
    }

    // ============ 设置弹窗 ============
    _wireSettingsModal() {
      // 背景点击
      $("#bgGrid").addEventListener("click", (e) => {
        const btn = e.target.closest(".bg-swatch");
        if (!btn) return;
        const name = btn.getAttribute("data-bg");
        if (name === "custom") {
          const input = $("#hiddenFile");
          input.value = "";
          input.onchange = () => {
            const f = input.files && input.files[0];
            if (!f) return;
            const fr = new FileReader();
            fr.onload = () => {
              this.state.settings.background = "custom";
              this.state.settings.customBg = fr.result;
              this._persist().then(() => { applyBackground(this.state.settings); this._syncBgActive(); toast("已设置自定义背景"); });
            };
            fr.readAsDataURL(f);
          };
          input.click();
        } else {
          this.state.settings.background = name;
          this._persist().then(() => { applyBackground(this.state.settings); this._syncBgActive(); });
        }
      });

      // ranges
      const blur = $("#fBlur");
      blur.addEventListener("input", () => {
        $("#lblBlur").textContent = blur.value;
        this.state.settings.bgBlur = +blur.value;
        applyBackground(this.state.settings);
      });
      blur.addEventListener("change", () => this._persist());

      const dim = $("#fDim");
      dim.addEventListener("input", () => {
        $("#lblDim").textContent = dim.value;
        this.state.settings.bgDim = +dim.value;
        applyBackground(this.state.settings);
      });
      dim.addEventListener("change", () => this._persist());

      const iconSize = $("#fIconSize");
      iconSize.addEventListener("input", () => {
        $("#lblIconSize").textContent = iconSize.value;
        this.state.settings.iconSize = +iconSize.value;
        this.lp.render();
      });
      iconSize.addEventListener("change", () => this._persist());

      const labelSize = $("#fLabelSize");
      labelSize.addEventListener("input", () => {
        $("#lblLabelSize").textContent = labelSize.value;
        this.state.settings.labelSize = +labelSize.value;
        this.lp.render();
      });
      labelSize.addEventListener("change", () => this._persist());

      // selects
      $("#fColumns").addEventListener("change", (e) => {
        const v = e.target.value;
        if (v === "auto") { this.state.settings.autoColumns = true; }
        else { this.state.settings.autoColumns = false; this.state.settings.columns = +v; }
        this._persist().then(() => this.lp.render());
      });
      $("#fShowLabels").addEventListener("change", (e) => {
        this.state.settings.showLabels = e.target.checked;
        this._persist().then(() => this.lp.render());
      });
      $("#fGroupMode").addEventListener("change", (e) => {
        this.state.settings.groupMode = e.target.checked;
        this._persist().then(() => {
          this._syncGroupToggle();
          this.lp.render();
          toast(e.target.checked ? "已开启分组模式" : "已关闭分组模式");
        });
      });
      $("#fShowSearch").addEventListener("change", (e) => {
        this.state.settings.showSearch = e.target.checked;
        this._persist().then(() => { $("#searchWrap").style.display = e.target.checked ? "" : "none"; this.lp.render(); });
      });
      $("#fSearchEngine").addEventListener("change", (e) => {
        this.state.settings.searchEngine = e.target.value;
        this._persist();
      });
      $("#fOpenIn").addEventListener("change", (e) => {
        this.state.settings.openIn = e.target.value;
        this._persist();
      });
      $("#fDefaultIconSource").addEventListener("change", (e) => {
        this.state.settings.iconSource = e.target.value;
        this._persist().then(() => this.lp.render());
      });

      // data
      $("#btnExportJson").addEventListener("click", () => this._exportJson());
      $("#btnImportJson").addEventListener("click", () => {
        const input = $("#hiddenJson");
        input.value = "";
        input.onchange = () => {
          const f = input.files && input.files[0];
          if (!f) return;
          const fr = new FileReader();
          fr.onload = () => {
            try {
              const data = JSON.parse(fr.result);
              if (!data || !Array.isArray(data.items)) throw new Error("格式不正确");
              this.state.items = data.items;
              if (data.settings) this.state.settings = Object.assign({}, itabStore.DEFAULT_SETTINGS, data.settings);
              this._normalize();
              this._persist().then(() => { applyBackground(this.state.settings); this.lp.setState(this.state); toast("已导入 " + this.state.items.length + " 项"); });
            } catch (e) { toast("JSON 解析失败"); }
          };
          fr.readAsText(f);
        };
        input.click();
      });
      $("#btnImportBookmarks").addEventListener("click", () => this._importBookmarks());

      // 多浏览器共享（指定文件存放）
      $("#btnPickShared").addEventListener("click", () => this._pickShared());
      $("#btnLoadShared").addEventListener("click", () => this._loadShared());
      $("#btnSaveShared").addEventListener("click", () => this._saveShared());
      $("#btnClearShared").addEventListener("click", () => this._clearShared());

      $("#btnReset").addEventListener("click", () => {
        if (!confirm("恢复为默认示例？将清空你当前的站点。")) return;
        this.state.items = itabStore.DEFAULT_ITEMS.slice();
        this._persist().then(() => { this.lp.setState(this.state); toast("已恢复默认"); });
      });
      $("#btnClear").addEventListener("click", () => {
        if (!confirm("清空所有收藏？此操作不可撤销。")) return;
        this.state.items = [];
        this._persist().then(() => { this.lp.setState(this.state); toast("已清空"); });
      });
      $("#btnCloseSettings").addEventListener("click", () => $("#modalSettings").hidden = true);
    }

    openSettings() {
      const s = this.state.settings;
      $("#fBlur").value = s.bgBlur; $("#lblBlur").textContent = s.bgBlur;
      $("#fDim").value = s.bgDim; $("#lblDim").textContent = s.bgDim;
      $("#fIconSize").value = s.iconSize; $("#lblIconSize").textContent = s.iconSize;
      $("#fLabelSize").value = s.labelSize; $("#lblLabelSize").textContent = s.labelSize;
      $("#fColumns").value = s.autoColumns ? "auto" : String(s.columns);
      $("#fShowLabels").checked = s.showLabels;
      $("#fGroupMode").checked = !!s.groupMode;
      $("#fShowSearch").checked = s.showSearch;
      $("#fSearchEngine").value = s.searchEngine;
      $("#fOpenIn").value = s.openIn;
      $("#fDefaultIconSource").value = s.iconSource;
      this._syncBgActive();
      this._syncFileStatus();
      $("#modalSettings").hidden = false;
    }

    _syncBgActive() {
      $$(".bg-swatch").forEach((b) => b.classList.toggle("active", b.getAttribute("data-bg") === this.state.settings.background));
    }

    _exportJson() {
      const data = { version: 1, items: this.state.items, settings: this.state.settings };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "itab-export-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("已导出 JSON");
    }

    // ============ 多浏览器共享（指定文件存放） ============
    _syncFileStatus() {
      const el = $("#fsStatus");
      if (!el) return;
      el.classList.remove("has-file", "error");
      if (!itabFileStore.isSupported()) {
        el.textContent = "当前浏览器不支持直接读写本地文件，请改用下方「导入 / 导出 JSON」手动同步。";
        el.classList.add("error");
        return;
      }
      itabFileStore.get().then((rec) => {
        if (rec && rec.name) {
          el.textContent = "共享文件：" + rec.name;
          el.classList.add("has-file");
        } else {
          el.textContent = "未指定共享文件。";
        }
      });
    }

    async _syncNow() {
      if (!itabFileStore.isSupported()) {
        toast("当前浏览器不支持直接读写本地文件");
        return;
      }
      const rec = await itabFileStore.get();
      if (!rec) {
        // 未指定共享文件 → 先选择再加载
        try { await itabFileStore.pick(); }
        catch (e) {
          if (e && e.name === "AbortError") return;
          toast("选择失败：" + itabFileStore.friendly(e));
          return;
        }
        this._syncFileStatus();
      }
      await this._loadShared();
    }

    async _saveSharedQuick() {
      if (!itabFileStore.isSupported()) {
        toast("当前浏览器不支持直接读写本地文件");
        return;
      }
      const rec = await itabFileStore.get();
      if (!rec) {
        // 未指定共享文件 → 先选择再保存
        try { await itabFileStore.pick(); }
        catch (e) {
          if (e && e.name === "AbortError") return;
          toast("选择失败：" + itabFileStore.friendly(e));
          return;
        }
        this._syncFileStatus();
      }
      await this._saveShared();
    }

    async _pickShared() {
      try {
        const meta = await itabFileStore.pick();
        this._syncFileStatus();
        toast("已指定共享文件：" + meta.name);
      } catch (e) {
        if (e && e.name === "AbortError") return;
        toast("选择失败：" + itabFileStore.friendly(e));
      }
    }

    async _loadShared() {
      try {
        const data = await itabFileStore.load();
        if (!data || !Array.isArray(data.items)) throw new Error("文件格式不正确");
        this.state.items = data.items;
        if (data.settings) this.state.settings = Object.assign({}, itabStore.DEFAULT_SETTINGS, data.settings);
        this._normalize();
        await this._persist();
        applyBackground(this.state.settings);
        this.lp.setState(this.state);
        this._syncGroupToggle();
        this._syncFileStatus();
        toast("已同步 " + this.state.items.length + " 项");
      } catch (e) {
        if (e && e.name === "AbortError") return;
        toast("同步失败：" + itabFileStore.friendly(e));
      }
    }

    async _saveShared() {
      try {
        const data = { version: 1, items: this.state.items, settings: this.state.settings };
        await itabFileStore.save(data);
        this._syncFileStatus();
        toast("已保存到共享文件");
      } catch (e) {
        if (e && e.name === "AbortError") return;
        toast("保存失败：" + itabFileStore.friendly(e));
      }
    }

    async _clearShared() {
      try {
        await itabFileStore.clear();
        this._syncFileStatus();
        toast("已清除共享文件指定");
      } catch (e) {
        toast("清除失败：" + itabFileStore.friendly(e));
      }
    }

    _importBookmarks() {
      const tryImport = function () {
        chrome.bookmarks.getTree(function (tree) {
          const out = [];
          function walk(node, inBookBar) {
            if (!node.children) {
              if (node.url) out.push({ title: node.title || itabIcon.safeHostname(node.url) || "书签", url: node.url, bookmark: true });
              return;
            }
            node.children.forEach((c) => walk(c, inBookBar || node.title === "Bookmarks bar" || node.title === "书签栏"));
          }
          tree.forEach((root) => walk(root, false));
          if (!out.length) { toast("未找到书签"); return; }
          // 去重
          const existing = new Set(this.state.items.map((i) => i.url));
          let added = 0;
          out.forEach((b) => {
            if (!existing.has(b.url)) {
              this.state.items.push({
                id: itabStore.uid(),
                title: b.title,
                url: b.url,
                icon: { type: "auto", value: "" },
                openIn: "new"
              });
              added++;
            }
          });
          this._persist().then(() => { this.lp.setState(this.state); toast("已导入 " + added + " 个书签"); });
        }.bind(this));
      }.bind(this);

      if (typeof chrome === "undefined" || !chrome.bookmarks) { toast("书签 API 不可用（需安装为扩展）"); return; }
      chrome.permissions && chrome.permissions.contains
        ? chrome.permissions.contains({ permissions: ["bookmarks"] }, (ok) => {
            if (ok) tryImport();
            else chrome.permissions.request({ permissions: ["bookmarks"] }, (granted) => {
              if (granted) tryImport();
              else toast("未授权书签权限");
            });
          })
        : tryImport();
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const app = new App();
    window.__itabApp = app;
    app.init().catch((err) => {
      console.error("iTab init failed:", err);
      toast("初始化失败：" + (err && err.message || err));
    });
  });
})();
