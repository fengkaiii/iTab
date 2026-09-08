/* iTab · launchpad.js —— 网格渲染 / 分页 / 拖拽 / 搜索 / 编辑 */
(function (root) {
  "use strict";

  const $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  const $$ = function (sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); };

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

  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent("itab:" + name, { detail: detail }));
  }

  function rowsForState(state) {
    const stageH = window.innerHeight - 36 - 60 - 40;
    const rowH = state.settings.iconSize + state.settings.labelSize + 22 + 30;
    let rows = Math.floor(stageH / rowH);
    if (rows < 2) rows = 2;
    if (rows > 6) rows = 6;
    return rows;
  }

  function colsForState(state) {
    if (!state.settings.autoColumns) return state.settings.columns;
    const w = window.innerWidth;
    if (w < 520) return 4;
    if (w < 760) return 5;
    if (w < 960) return 6;
    if (w < 1200) return 7;
    if (w < 1600) return 8;
    return 9;
  }

  // 给一个 item + 图标上下文（settings.source）渲染其图标 DOM 子元素
  function renderIconInto(container, item, opts) {
    container.innerHTML = "";
    const host = itabIcon.safeHostname(item.url);
    if (item.icon && item.icon.type === "emoji" && item.icon.value) {
      container.appendChild(el("span", { class: "emoji", text: item.icon.value }));
      return;
    }
    if (item.icon && item.icon.type === "letter" && item.icon.value) {
      const [c1, c2] = item.icon.bg || ["#6366F1", "#22D3EE"];
      container.style.background = "linear-gradient(135deg," + c1 + "," + c2 + ")";
      container.appendChild(el("span", { class: "letter", text: item.icon.value }));
      return;
    }
    if (item.icon && item.icon.type === "upload" && item.icon.value) {
      const img = el("img", { src: item.icon.value, alt: item.title || "" });
      container.appendChild(img);
      return;
    }
    if (item.icon && item.icon.type === "url" && item.icon.value) {
      const img = el("img", { src: item.icon.value, alt: item.title || "" });
      container.appendChild(img);
      return;
    }
    // auto：使用回退链
    const img = el("img", { alt: item.title || "" });
    container.appendChild(img);
    const source = (opts && opts.source) || "auto";
    itabIcon.attachFallbacks(img, item.url, source, function () {
      // 全部失败 → 首字母兜底
      container.innerHTML = "";
      const [c1, c2] = itabIcon.pickColors(host);
      container.style.background = "linear-gradient(135deg," + c1 + "," + c2 + ")";
      container.appendChild(el("span", { class: "letter", text: itabIcon.firstChar(item.title, host) }));
    });
  }

  function buildTile(item, state) {
    const tile = el("div", { class: "tile", draggable: "true", "data-id": item.id });
    const icon = el("div", { class: "tile-icon" });
    renderIconInto(icon, item, { source: state.settings.iconSource });
    const label = el("div", { class: "tile-label", text: item.title || "" });
    tile.appendChild(icon);
    tile.appendChild(label);
    tile.addEventListener("click", function (e) {
      if (tile.classList.contains("dragging")) return;
      if (document.body.classList.contains("edit-mode")) {
        e.preventDefault();
        dispatch("request-edit", { id: item.id, remove: true });
        return;
      }
      if (state.settings.openIn === "current" && root.chrome && chrome.tabs) {
        // 当前页打开（仅扩展环境）
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs && tabs[0]) chrome.tabs.update(tabs[0].id, { url: item.url });
        });
      } else {
        root.open(item.url, "_blank", "noopener,noreferrer");
      }
    });
    tile.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      dispatch("request-edit", { id: item.id, remove: false });
    });
    return tile;
  }

  function buildAddSlot(group) {
    const tile = el("div", { class: "tile add-slot", "data-id": "__add" });
    const icon = el("div", { class: "add-ghost", text: "+" });
    tile.appendChild(icon);
    tile.appendChild(el("div", { class: "tile-label", text: "添加" }));
    tile.addEventListener("click", function () {
      dispatch("request-add", { group: group || "" });
    });
    return tile;
  }

  function buildEmptySlot() {
    return el("div", { class: "tile empty" });
  }

  // 主体：渲染当前页 + 翻页切换
  class Launchpad {
    constructor(state) {
      this.state = state;
      this.viewport = $("#pageViewport");
      this.pager = $("#pager");
      this.pageIndex = 0;
      this.pages = []; // [[items...], [items...]]
      this.drag = null;
      this.dragGhost = null;
      this._autoFlipTimer = null;
      this._sidebarDrag = null;
      this._wire();
    }

    setState(state) {
      this.state = state;
      this.render();
    }

    _wire() {
      // 滚轮翻页（分组模式下自然滚动，不拦截）
      let wheelLock = false;
      window.addEventListener("wheel", (e) => {
        if (this.state.settings.groupMode) return;
        if (wheelLock) return;
        if (e.target.closest(".modal")) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        if (Math.abs(e.deltaY) < 30) return;
        wheelLock = true;
        if (e.deltaY > 0) this.goPage(this.pageIndex + 1);
        else this.goPage(this.pageIndex - 1);
        setTimeout(() => { wheelLock = false; }, 600);
      }, { passive: true });

      // 键盘
      window.addEventListener("keydown", (e) => {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA")) return;
        if (e.key === "ArrowRight" && !this.state.settings.groupMode) this.goPage(this.pageIndex + 1);
        else if (e.key === "ArrowLeft" && !this.state.settings.groupMode) this.goPage(this.pageIndex - 1);
        else if (e.key === "Escape") {
          if (document.body.classList.contains("edit-mode")) {
            document.body.classList.remove("edit-mode");
          } else {
            const s = $("#searchInput"); if (s) s.focus();
          }
        } else if (e.key === "Enter" || e.key === " ") {
          // 在空白处按 Enter → 打开搜索
        }
      });

      // 拖拽
      window.addEventListener("dragover", (e) => this._onDragOver(e));
      window.addEventListener("drop", (e) => this._onDrop(e));
      window.addEventListener("dragend", (e) => this._onDragEnd(e));

      // 搜索过滤
      const sInput = $("#searchInput");
      if (sInput) {
        const clearBtn = $("#btnSearchClear");
        const syncClear = () => {
          if (clearBtn) clearBtn.hidden = sInput.value.length === 0;
        };
        const clearSearch = () => {
          sInput.value = "";
          syncClear();
          this._applyFilter("");
          sInput.focus();
        };
        sInput.addEventListener("input", () => {
          this._applyFilter(sInput.value);
          syncClear();
        });
        // 跟踪输入法组合状态：组合中按回车是「确认候选词」，不能触发搜索
        let composing = false;
        sInput.addEventListener("compositionstart", () => { composing = true; });
        sInput.addEventListener("compositionend", () => { composing = false; });
        if (clearBtn) {
          clearBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearSearch();
          });
          syncClear();
        }
        sInput.addEventListener("keydown", (e) => {
          const isComposing = composing || e.isComposing || e.keyCode === 229;
          if (e.key === "Escape") {
            if (isComposing) return; // 交给输入法取消候选
            e.preventDefault();
            clearSearch();
            return;
          }
          if (e.key === "Enter") {
            if (isComposing) return; // 输入法确认候选词，不搜索
            e.preventDefault();
            const q = sInput.value.trim();
            if (!q) return;
            // 找到第一个匹配项并打开
            const matched = this.state.items.find((it) => matches(it, q));
            if (matched) {
              if (this.state.settings.openIn === "current" && root.chrome && chrome.tabs) {
                chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                  if (tabs && tabs[0]) chrome.tabs.update(tabs[0].id, { url: matched.url });
                });
              } else {
                root.open(matched.url, "_blank", "noopener,noreferrer");
              }
              return;
            }
            // 否则走搜索引擎
            const engine = itabStore.ENGINES[this.state.settings.searchEngine] || itabStore.ENGINES.google;
            root.open(engine.url(q), "_blank", "noopener,noreferrer");
          }
        });
      }

      // 监听舞台空白右键 → 进入编辑模式；双击空白 → 添加
      const stage = $("#stage");
      stage.addEventListener("contextmenu", (e) => {
        if (e.target.closest(".tile")) return;
        e.preventDefault();
        document.body.classList.add("edit-mode");
        this.render();
      });
      stage.addEventListener("dblclick", (e) => {
        if (e.target.closest(".tile")) return;
        dispatch("request-add");
      });

      // 窗口尺寸变化重排
      let resizeT = null;
      window.addEventListener("resize", () => {
        clearTimeout(resizeT);
        resizeT = setTimeout(() => this.render(), 120);
      });
    }

    render() {
      const state = this.state;
      // 切列数变量
      const cols = colsForState(state);
      document.documentElement.style.setProperty("--cols", String(cols));
      document.documentElement.style.setProperty("--icon-size", state.settings.iconSize + "px");
      document.documentElement.style.setProperty("--label-size", state.settings.labelSize + "px");
      document.body.classList.toggle("no-labels", !state.settings.showLabels);
      document.body.classList.toggle("group-mode", !!state.settings.groupMode);
      const showSearch = !!state.settings.showSearch;
      $("#searchWrap").style.display = showSearch ? "" : "none";

      // 分组模式：按分组归类，垂直滚动展示
      if (state.settings.groupMode) {
        this._renderGrouped();
        return;
      }

      const rows = rowsForState(state);
      const pageSize = Math.max(1, cols * rows);
      // 计算分页：每页固定预留最后一个槽为添加按钮
      const usablePageSize = Math.max(1, pageSize - 1);
      const items = state.items.slice();
      const pages = [];
      for (let i = 0; i < items.length; i += usablePageSize) {
        const slice = items.slice(i, i + usablePageSize);
        // 不足的格子先放 add-slot，其余位置用 empty 补齐，保持网格整齐
        const arr = slice.slice();
        arr.push({ __add: true });
        while (arr.length < pageSize) arr.push(null);
        pages.push(arr);
      }
      // 如果完全为空，也要 1 页放 add
      if (pages.length === 0) {
        const arr = [{ __add: true }];
        while (arr.length < pageSize) arr.push(null);
        pages.push(arr);
      }
      // 确保当前页索引有效
      if (this.pageIndex >= pages.length) this.pageIndex = pages.length - 1;
      if (this.pageIndex < 0) this.pageIndex = 0;
      this.pages = pages;
      this._renderPage();
      this._renderPager();
    }

    // 把 items 按 group 聚合为有序分区：优先 settings.groupOrder，其余按首次出现，未分组固定最后
    _groupItems(items) {
      const order = (this.state.settings.groupOrder || []).slice();
      const map = new Map();
      const ungrouped = [];
      for (const it of items) {
        const g = (it.group || "").trim();
        if (!g) { ungrouped.push(it); continue; }
        if (!map.has(g)) map.set(g, []);
        map.get(g).push(it);
      }
      const sections = [];
      const seen = new Set();
      for (const name of order) {
        if (map.has(name) && !seen.has(name)) {
          sections.push({ header: name, items: map.get(name) });
          seen.add(name);
        }
      }
      map.forEach(function (arr, name) {
        if (!seen.has(name)) sections.push({ header: name, items: arr });
      });
      if (ungrouped.length) sections.push({ header: "", items: ungrouped });
      return sections;
    }

    _renderGrouped() {
      const state = this.state;
      this.pages = [];
      this.pager.innerHTML = "";

      const sections = this._groupItems(state.items);
      const view = this.viewport;
      view.innerHTML = "";
      const layout = el("div", { class: "group-layout" });
      const wrap = el("div", { class: "groups" });

      sections.forEach(function (sec) {
        const secEl = el("section", { class: "group-section", "data-group": sec.header });
        const header = el("div", { class: "group-header" });
        header.appendChild(el("span", { class: "group-name", text: sec.header || "未分组" }));
        header.appendChild(el("span", { class: "group-count", text: String(sec.items.length) }));
        const addBtn = el("button", { class: "group-add", title: "添加到此分组", html: "+" });
        addBtn.addEventListener("click", function () { dispatch("request-add", { group: sec.header || "" }); });
        header.appendChild(addBtn);
        secEl.appendChild(header);

        const grid = el("div", { class: "group-grid" });
        sec.items.forEach(function (it) {
          const tile = buildTile(it, state);
          tile.setAttribute("draggable", "false");
          grid.appendChild(tile);
        });
        // 每组末尾的添加槽：点击后预填该分组名
        const addTile = buildAddSlot(sec.header);
        grid.appendChild(addTile);
        secEl.appendChild(grid);
        wrap.appendChild(secEl);
      });

      layout.appendChild(wrap);
      layout.appendChild(this._buildGroupSidebar(sections));
      view.appendChild(layout);
      this._applyFilter($("#searchInput").value || "");
    }

    // 右侧纵向分组列表：拖拽排序（未分组固定最后，不参与排序）
    _buildGroupSidebar(sections) {
      const aside = el("aside", { class: "group-sidebar" });
      const list = el("div", { class: "group-sidebar-list" });
      const realGroups = sections.filter(function (s) { return s.header; }).map(function (s) { return s.header; });

      realGroups.forEach((name) => {
        list.appendChild(this._buildSidebarItem(name));
      });
      if (!realGroups.length) {
        list.appendChild(el("div", { class: "group-sidebar-empty", text: "暂无分组" }));
      }
      aside.appendChild(list);
      return aside;
    }

    _buildSidebarItem(name) {
      const item = el("div", { class: "group-sidebar-item", draggable: "true", "data-group": name });
      item.appendChild(el("span", { class: "gs-grip", html: "⠿" }));
      item.appendChild(el("span", { class: "gs-name", text: name }));

      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", name); } catch (_) {}
        this._sidebarDrag = name;
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        $$(".group-sidebar-item.drop-target").forEach((t) => t.classList.remove("drop-target"));
        this._sidebarDrag = null;
      });
      item.addEventListener("dragover", (e) => {
        if (!this._sidebarDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        $$(".group-sidebar-item").forEach((t) => t.classList.remove("drop-target"));
        if (name !== this._sidebarDrag) item.classList.add("drop-target");
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = this._sidebarDrag;
        if (!from || from === name) return;
        this._reorderGroup(from, name);
        this._sidebarDrag = null;
      });
      return item;
    }

    _reorderGroup(from, to) {
      // 以当前展示顺序为基准，保证顺序完整（含 groupOrder 之外的首次出现分组）
      const current = this._groupItems(this.state.items).filter(function (s) { return s.header; }).map(function (s) { return s.header; });
      const arr = current.slice();
      const fi = arr.indexOf(from);
      const ti = arr.indexOf(to);
      if (fi < 0 || ti < 0) return;
      const [moved] = arr.splice(fi, 1);
      arr.splice(ti, 0, moved);
      dispatch("group-reordered", { order: arr });
    }

    _pageHasAddSlot(pageIdx, total, pageSize) {
      // 在每个非最后一页的最后一个位置放 add-slot，留给用户下一页添加
      // 简化：始终让 add-slot 出现在每页的最后一个空位（如果不满）
      return false;
    }

    _renderPage() {
      const view = this.viewport;
      view.innerHTML = "";
      this.pages.forEach((arr, idx) => {
        const page = el("section", { class: "page" + (idx === this.pageIndex ? " is-active" : idx < this.pageIndex ? " is-left" : " is-right"), "data-page": String(idx) });
        arr.forEach((it) => {
          let tile;
          if (it && it.__add) tile = buildAddSlot();
          else if (it == null) tile = buildEmptySlot();
          else tile = buildTile(it, this.state);
          this._bindDrag(tile);
          page.appendChild(tile);
        });
        view.appendChild(page);
      });
    }

    _renderPager() {
      const pager = this.pager;
      pager.innerHTML = "";
      const total = this.pages.length;
      if (total <= 1) return;
      const prev = el("button", { class: "pager-arrow", html: "‹", title: "上一页" });
      prev.addEventListener("click", () => this.goPage(this.pageIndex - 1));
      const next = el("button", { class: "pager-arrow", html: "›", title: "下一页" });
      next.addEventListener("click", () => this.goPage(this.pageIndex + 1));
      pager.appendChild(prev);
      for (let i = 0; i < total; i++) {
        const dot = el("button", { class: "pager-dot" + (i === this.pageIndex ? " active" : ""), title: "第 " + (i + 1) + " 页" });
        dot.addEventListener("click", () => this.goPage(i));
        pager.appendChild(dot);
      }
      pager.appendChild(next);
    }

    goPage(idx) {
      if (idx < 0 || idx >= this.pages.length) return;
      if (idx === this.pageIndex) return;
      const dir = idx > this.pageIndex ? "right" : "left";
      this.pageIndex = idx;
      this._renderPage();
      this._renderPager();
      // 给切换加动画 class
      const cur = this.viewport.querySelector(".page[data-page='" + idx + "']");
      if (cur) {
        cur.classList.remove("is-left", "is-right");
        cur.classList.add("is-active");
      }
      void dir; // 未使用，保留
    }

    _applyFilter(q) {
      q = (q || "").trim().toLowerCase();
      $$(".tile").forEach((tile) => {
        const id = tile.getAttribute("data-id");
        if (!id || id === "__add") return;
        const item = this.state.items.find((it) => it.id === id);
        if (!item) return;
        const m = !q || matches(item, q);
        tile.classList.toggle("dimmed", !!q && !m);
        tile.classList.toggle("matched", !!q && m);
      });
      // 分组模式下：过滤后隐藏没有可见项的分组标题
      if (this.state.settings.groupMode && q) {
        $$(".group-section").forEach((sec) => {
          const visible = Array.from(sec.querySelectorAll(".tile")).some((t) => !t.classList.contains("dimmed") && t.getAttribute("data-id") !== "__add");
          sec.classList.toggle("filter-hidden", !visible);
        });
      } else {
        $$(".group-section").forEach((sec) => sec.classList.remove("filter-hidden"));
      }
    }

    _bindDrag(tile) {
      const id = tile.getAttribute("data-id");
      if (!id || id === "__add") {
        tile.setAttribute("draggable", "false");
        return;
      }
      tile.addEventListener("dragstart", (e) => {
        this.drag = { id: id, tile: tile };
        tile.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", id); } catch (_) {}
        // 自定义 ghost
        this._makeGhost(tile);
      });
      tile.addEventListener("dragend", () => {
        if (this.drag) this._onDragEnd();
      });
    }

    _makeGhost(tile) {
      const rect = tile.getBoundingClientRect();
      const g = document.createElement("div");
      g.className = "drag-ghost";
      g.style.left = (rect.left + rect.width / 2) + "px";
      g.style.top = (rect.top + rect.height / 2) + "px";
      // 复制图标内容
      const icon = tile.querySelector(".tile-icon");
      if (icon) g.appendChild(icon.cloneNode(true));
      document.body.appendChild(g);
      this.dragGhost = g;
    }

    _onDragOver(e) {
      if (!this.drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      // 边缘翻页
      const w = window.innerWidth;
      if (e.clientX < 60 && this.pageIndex > 0) {
        if (!this._autoFlipTimer) this._autoFlipTimer = setTimeout(() => { this.goPage(this.pageIndex - 1); this._autoFlipTimer = null; }, 500);
      } else if (e.clientX > w - 60 && this.pageIndex < this.pages.length - 1) {
        if (!this._autoFlipTimer) this._autoFlipTimer = setTimeout(() => { this.goPage(this.pageIndex + 1); this._autoFlipTimer = null; }, 500);
      } else {
        if (this._autoFlipTimer) { clearTimeout(this._autoFlipTimer); this._autoFlipTimer = null; }
      }
      // 移动 ghost
      if (this.dragGhost) {
        this.dragGhost.style.left = e.clientX + "px";
        this.dragGhost.style.top = e.clientY + "px";
      }
      // drop-target 高亮
      $$(".page .tile").forEach((t) => t.classList.remove("drop-target"));
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target && target.closest) {
        const t = target.closest(".tile");
        if (t && t !== this.drag.tile && t.getAttribute("data-id") !== "__add") t.classList.add("drop-target");
      }
    }

    _onDrop(e) {
      if (!this.drag) return;
      e.preventDefault();
      const draggedId = this.drag.id;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target && target.closest) {
        const t = target.closest(".tile");
        if (t && t !== this.drag.tile && t.getAttribute("data-id") !== "__add") {
          const targetId = t.getAttribute("data-id");
          this._reorderBefore(draggedId, targetId);
        } else {
          // 落到空白：移到当前页末尾
          this._reorderToEndOfPage(draggedId);
        }
      }
      this._onDragEnd();
    }

    _onDragEnd() {
      if (this.drag && this.drag.tile) this.drag.tile.classList.remove("dragging");
      $$(".tile.drop-target").forEach((t) => t.classList.remove("drop-target"));
      if (this.dragGhost) { this.dragGhost.remove(); this.dragGhost = null; }
      if (this._autoFlipTimer) { clearTimeout(this._autoFlipTimer); this._autoFlipTimer = null; }
      this.drag = null;
    }

    _reorderBefore(dragId, targetId) {
      const items = this.state.items.slice();
      const fromIdx = items.findIndex((it) => it.id === dragId);
      let toIdx = items.findIndex((it) => it.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = items.splice(fromIdx, 1);
      if (fromIdx < toIdx) toIdx--; // 取出后索引前移
      items.splice(toIdx, 0, moved);
      dispatch("items-reordered", { items: items });
    }

    _reorderToEndOfPage(id) {
      const items = this.state.items.slice();
      const fromIdx = items.findIndex((it) => it.id === id);
      if (fromIdx < 0) return;
      const [moved] = items.splice(fromIdx, 1);
      items.push(moved);
      dispatch("items-reordered", { items: items });
    }
  }

  function matches(item, q) {
    if (!item) return false;
    return (item.title || "").toLowerCase().indexOf(q) >= 0 ||
           (item.url || "").toLowerCase().indexOf(q) >= 0;
  }

  root.itabLaunchpad = Launchpad;
})(typeof window !== "undefined" ? window : this);
