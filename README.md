# iTab · 启动台起始页

把浏览器新标签页变成 **macOS 启动台** 风格的收藏夹：

- 圆角 squircle 图标网格 + 白色 favicon + 标签阴影
- **自动抓取** 网页 favicon（多源回退：`/favicon.ico` → DuckDuckGo → Google s2），离线/失败时用首字母 + 渐变色兜底
- **自定义图标**：上传本地图片 / Emoji / 字母 + 渐变色 / 直接填写图标 URL
- 顶部搜索框，跨页滚轮翻页、边缘悬停翻页、键盘左右箭头
- 拖拽重排（边缘自动翻页）、空白右键进入编辑模式（图标抖动 + 删除徽章）
- 7 套内置 macOS 风格壁纸（Sonoma / Monterey / Big Sur / Mojave / Ocean / Sakura / 深色），支持上传自定义背景，可调模糊与暗化
- 列数自适应 / 固定，图标大小、标签字号可调
- 多搜索引擎（Google / Bing / DuckDuckGo / 百度），可隐藏搜索框
- 导入 / 导出 JSON 备份，**从浏览器书签一键导入**（按需申请 `bookmarks` 权限）
- 数据本地存储（`chrome.storage.local`），不上传任何信息

零构建步骤，下载即用。

## 目录

```
itab/
├── manifest.json          # MV3 清单
├── newtab.html            # 起始页（chrome_url_overrides 入口）
├── css/launchpad.css      # 启动台样式
├── js/
│   ├── store.js           # 数据层（chrome.storage.local + localStorage 降级）
│   ├── favicon.js         # favicon 多源回退 / Emoji / 字母 / 上传 工具
│   ├── launchpad.js       # 网格渲染 / 分页 / 拖拽 / 搜索
│   ├── app.js             # 顶层交互（弹窗、设置、导入导出、背景）
│   └── bg.js              # service worker
├── img/                   # 扩展图标 (16/32/48/128)
├── tools/make_icons.py    # 重新生成图标（无依赖）
└── _locales/zh_CN/        # 中文 locale
```

## 安装（Chrome / Edge / Brave / Arc 等 Chromium 浏览器）

1. 打开浏览器扩展页：
   - Chrome：`chrome://extensions`
   - Edge：`edge://extensions`
   - Brave：`brave://extensions`
2. 打开右上角 **「开发者模式」**。
3. 点击左上角 **「加载已解压的扩展程序」**，选择本仓库根目录（包含 `manifest.json` 的目录）。
4. 打开新标签页即可看到启动台。

> Firefox：manifest 是 MV3，Firefox 121+ 已支持 MV3 起始页覆盖（`chrome_url_overrides.newtab`）。如不可用，可临时把 `manifest.json` 的 `manifest_version` 改为 Firefox 兼容写法。

## 交互速查

| 操作 | 效果 |
| --- | --- |
| 单击图标 | 打开站点（默认新标签，可在设置改） |
| 右键图标 | 编辑当前站点 |
| 右键空白 | 进入编辑模式（图标抖动 + 删除按钮） |
| 双击空白 | 快速添加站点 |
| 拖拽图标 | 重排；拖到屏幕左/右边缘 0.5s 自动翻页 |
| 滚轮 / 触摸板 | 翻页 |
| ← / → | 翻页 |
| 顶部搜索框 | 即时过滤；回车打开首个匹配或调用默认搜索引擎 |
| `Esc` | 退出编辑模式 / 关闭弹窗 |

## 数据格式

```json
{
  "version": 1,
  "items": [
    {
      "id": "iabc1234",
      "title": "GitHub",
      "url": "https://github.com",
      "icon": { "type": "auto", "value": "" },
      "openIn": "new",
      "group": "开发"
    },
    {
      "id": "iabc5678",
      "title": "我的博客",
      "url": "https://blog.example.com",
      "icon": { "type": "letter", "value": "M", "bg": ["#6366F1", "#22D3EE"] },
      "openIn": "new",
      "group": ""
    }
  ],
  "settings": {
    "background": "sonoma",
    "customBg": "",
    "bgBlur": 22,
    "bgDim": 18,
    "columns": 7,
    "autoColumns": true,
    "iconSize": 76,
    "labelSize": 13,
    "showLabels": true,
    "showSearch": true,
    "searchEngine": "google",
    "openIn": "new",
    "iconSource": "auto",
    "groupMode": false,
    "groupOrder": ["开发", "AI", "中文"]
  }
}
```

`icon.type` 可选值：

- `auto` — 多源 favicon 回退，失败时用首字母渐变
- `upload` — 自定义上传（`value` 为 dataURL）
- `emoji` — Emoji 图标（`value` 为 emoji 字符）
- `letter` — 字母 + 渐变（`value` 为字母，`bg: [c1, c2]`）
- `url` — 自定义图标 URL（`value` 为 https URL）

## 分组模式

在「设置 → 布局 → 分组模式」开启后，收藏会按 `item.group` 字段归类显示：

- 同一分组的图标聚在一个分区里，分区带标题、计数胶囊和 `+` 按钮
- 标题旁的 `+` 按钮会预填该分组名后弹出添加框
- 分组顺序 = `settings.groupOrder`，为空时按首次出现顺序；未分组的项归到「未分组」并固定放在最后
- **右侧「分组排序」侧边栏**：纵向列出所有分组，拖拽即可重排（`⠿` 手柄），顺序即时保存并重渲染
- 顶部搜索过滤时自动隐藏没有匹配的分组
- 分页器隐藏，整体改为垂直滚动
- 关闭后恢复原启动台平铺分页，`group` 字段保留

添加或编辑站点时，弹窗的「分组」字段支持自由输入；输入框带 datalist 自动补全已有的分组名。

> 当前版本在分组模式下禁用了图标拖拽重排（避免跨组语义混乱），分组排序统一在右侧侧边栏完成；编辑模式（删除、编辑）照常可用。

## URL 调试参数

| 参数 | 效果 |
| --- | --- |
| `?bg=sonoma\|monterey\|bigsur\|mojave\|ocean\|sakura\|dark` | 临时切换背景（不持久化） |
| `?blur=10&dim=20` | 临时调模糊与暗化 |
| `?edit=1` | 强制进入编辑模式 |
| `?demo=1` | 打开「添加站点」弹窗 |
| `?settings=1` | 打开「设置」弹窗 |
| `?group=1` | 临时开启分组模式 |
| `?fresh=1` | 把 items 重置为默认示例（含分组） |
| `?order=开发,AI,中文` | 临时指定分组显示顺序（逗号分隔，需 URL 编码中文） |

> 注意：在扩展环境下 URL 参数被 Chrome 忽略（`newtab` 没有 query string），仅作为本地 `file://` 或 HTTP 预览时调试用。

## 本地预览（不开浏览器扩展）

任一起一个静态文件 server，例如：

```bash
cd itab
python3 -m http.server 8090
# 浏览器打开 http://127.0.0.1:8090/newtab.html
```

预览模式下数据保存在 `localStorage`，与扩展的 `chrome.storage.local` 互不影响。

## 重新生成扩展图标

```bash
python3 tools/make_icons.py
```

生成 16/32/48/128 四张 PNG（无任何外部依赖）。

## 许可

MIT
