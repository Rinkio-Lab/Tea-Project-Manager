# Tea PM 2.0 集成验证报告（Phase 3 验收，2026-10-03）

> 验收人：集成验证子任务。方式：真实后端（tea.exe）+ 真实 59 份种子 `.teaproject` + 浏览器全流程。
> 原则：发现 bug 只记录、不改源码；测试产生的写入全部还原。

---

## 一、验收项一览表

| # | 验收项 | 结论 | 证据 |
|---|---|---|---|
| 1 | tea serve 毫秒级启动、127.0.0.1:8080 可访问 | ✅ 过 | serve.log：`tea serve → http://127.0.0.1:8080/`；轮询首次即 200 |
| 2 | go vet ./... 零告警 | ✅ 过 | exit=0（stderr 仅模块缓存 .tmp 写不进沙箱，非 vet 告警） |
| 3 | go build -o tea.exe . 成功 | ✅ 过 | exit=0，tea.exe 重建于 20:04 |
| 4 | 前端 JS 语法检查 | ✅ 过 | 8 个 .js 全部 `node --check` exit=0 |
| 5 | REST API 全端点通、JSON 正确 | ✅ 过 | settings 已改 snake_case（bind/port/projects_root/theme）；复验见 §十 |
| 6 | 种子 59 份、字段与盘点一致 | ✅ 过 | `tea list`=59；抽 5 个对照盘点全一致（§五） |
| 7 | UI：网格/表格切换 | ✅ 过 | 01-grid.png / 02-table.png |
| 8 | UI：搜索 / 组合筛选生效 | ✅ 过 | 输入"歌词"网格实时渲染 16 张卡片；Go=3、Go×进行中=2；不存在的词空态（08-filter-fixed.png） |
| 9 | UI：详情 inline 编辑写回 YAML | ✅ 过 | notes 改→Ctrl+S→磁盘 `notes: UI_VERIFY_临时备注`→还原 |
| 10 | UI：仪表盘 echarts 渲染 | ✅ 过 | 03-dashboard.png，3 个 canvas + 4 统计卡 |
| 11 | UI：主题三态/6 皮肤/高对比/跟随语言 | ✅ 过 | 05-settings-theme.png（亮→暗实测） |
| 12 | UI：操作按钮实际拉起程序 | ✅ 过 | toast"已拉起: LyricEx"；CLI `tea open` exit=0 |
| 13 | 扫描器只刷自动区、不碰手写区 | ✅ 过 | write=1 后 LyricEx YAML before/after 零 diff |
| 14 | CLI list/show/scan/open/actions | ✅ 过 | §二 |
| 15 | 归档优先、删除需 force | ✅ 过 | DELETE 无 force→400 ✅；`?archived=1` 现返回 6 个旧归档（Blog/Font Previewer/LyricsAuto/SongAPI/Tea Lingo/VocabZoom） |
| 16 | 交付 README / 验证报告 / 截图 | ✅ 过 | README.md、本报告、docs/screenshots/*.png |

---

## 二、CLI 验证（`E:\Projects\Tea Project Manager`）

| 命令 | 结果 |
|---|---|
| `tea list` | 表格输出正常，**共 59 个项目**，含嵌套 `New Songs` |
| `tea show LyricEx` | 手写区（type/category/status/language/tech_stack/description/intent/tags）+ 自动区（last_active/created/code_files=155/code_size_kb=3207/total_size_mb=1033.37/git{repo,commits=59,remote}/deps）+ `[ai]` 齐全 |
| `tea scan`（默认 dry-run） | `扫描完成 [dry-run（只读）]：59 个项目`，逐个列出，全部 `[ai]` |
| `tea open LyricEx` | `已在资源管理器打开: E:\Projects\LyricEx`，exit=0，explorer 进程在 |
| `tea actions LyricEx` | `（该项目未定义自定义 actions）`——种子阶段 actions 留空，符合预期 |

---

## 三、服务与 API 全测

服务：`tea serve` 后台启动，`http://127.0.0.1:8080`。

### 静态资源
| 请求 | 结果 |
|---|---|
| `GET /` | 200，index.html（`<title>Tea PM · 项目管家</title>`，5759 字节） |
| `GET /assets/styles/tokens.css` | 200，9973 字节 |
| `GET /vendor/echarts/echarts.min.js` | 200，1030855 字节 |

### 项目列表与过滤
| 请求 | 结果 |
|---|---|
| `GET /api/projects` | **count=59**，按 order/名称稳定排序 |
| `?q=lyric` | 7 个（LyricEx / Lyrics Editor / LYRX …） |
| `?q=歌词` | 16 个 |
| `?lang=Go` | **3 个**（Learn Golang / Lyrics Editor / Tea Project Manager） |
| `?status=进行中` | 12 个 |
| `?archived=0` | 59 个（默认排除归档） |

### 单项目 / 404 / 统计
- `GET /api/projects/LyricEx`：手写区中文值、`ai:true`、自动区齐全（git.remote=`git@github.com:Rinkio-Lab/LyricEx.git`）。
- `GET /api/projects/不存在的项目XYZ`：**404** `{"error":"项目不存在: ..."}`。
- `GET /api/stats`：`total=59`、`language_count`（Python 39 / JavaScript 8 / HTML/CSS 5 / Go 3 / 其余 4 类各 1）、`status_distribution`（已完成 37 / 进行中 12 / 草稿 7 / 无法判断 3）、`total_size_mb=5426.85`、`active_timeline` 结构齐全。

### 扫描：只刷自动区（关键验收）
- `POST /api/scan`（dry-run）：`write=false, count=59`。
- write 前快照 LyricEx `.teaproject` → `POST /api/scan?write=1` → write 后再存。
- **`Compare-Object` before/after：零 diff**。手写区（status=进行中 / quality=整洁 / tags=日语,歌词,前端,活跃 / description 92 字）逐字段未变；自动区值稳定（155 文件 / 1033.37 MB / 59 commits）。
- 结论：扫描器只更新自动区，手写区一个字节不覆盖。✅

### 写回 YAML
- `PUT /api/projects/LyricEx {"notes":"VERIFY_TEMP_20261003"}` → 返回与 GET 读回一致，磁盘 `.teaproject` 出现 `notes: VERIFY_TEMP_20261003`。✅
- 随即 `PUT notes:""` 还原，磁盘 notes 清空，`ai:true` 保留。✅

### 打开 / 删除 / 设置
- `POST /api/projects/LyricEx/open {"action":"explorer"}` → `{"ok":true,"action":"explorer"}`。
- `DELETE /api/projects/Learn Golang`（不带 force）→ **400** `真删除必须带 ?force=true`；目录仍在。✅
- `GET /api/settings` → bind=127.0.0.1 / port=8080 / projects_root=E:\Projects；PUT 改 theme 后还原。✅

### 归档验收（Learn Golang，可牺牲项）
- `POST /api/projects/Learn Golang/archive` → `ok=true, moved_to=E:\Projects\_archive\Learn Golang`；磁盘 `E:\Projects\Learn Golang` 消失、`_archive\Learn Golang` 出现。✅
- **但 `GET /api/projects?archived=1` 返回 0 条**——见问题 2。
- 已用文件操作把 `_archive\Learn Golang` 移回 `E:\Projects\Learn Golang`，`.teaproject` 完好，`POST /api/scan` 后列表恢复 59，Learn Golang（草稿/Go）回到列表。✅ 全程无残留。

---

## 四、浏览器端到端（真实后端 + 59 数据）

截图存 `docs/screenshots/`。

| 项 | 结果 | 证据 |
|---|---|---|
| 网格视图：名称/语言徽章/状态色点/相对时间/体积/Git 徽章 | ✅ | 01-grid.png |
| 状态自然词映射：进行中→在弄(绿点)、已完成→完工(蓝点)、无法判断→说不清(黄点)、草稿→草稿(灰点) | ✅ | 01/02.png 肉眼确认 |
| AI 描述带 ✦、详情里"采纳/替换"按钮 | ✅ | 04-detail-overview.png，描述/意图均带 ✦ |
| 表格视图：列、复选框多选、批量操作条（归档/打开/删除） | ✅ | 02-table.png；多选后 DOM 出现 batchBar |
| 搜索框输入关键词过滤 | ❌ | 输入 `zzzznonexistent999` 后 state.filter.q 已更新，仍渲染 59 张卡片（问题 1） |
| 组合筛选 语言=Go × 状态=在弄 | ❌ | fLang 选 Go 后列表仍全量（问题 1） |
| 仪表盘：4 统计卡 + 环形/条形/时间线三图 | ✅ | 03-dashboard.png，3 个 echarts canvas |
| 详情 inline 编辑 → Ctrl+S → YAML 落盘 → 还原 | ✅ | notes 临时值落盘后还原；磁盘证据见 §三 |
| 自动区 🔄 刷新按钮 | ✅ | 04-detail-overview.png 每个自动字段带刷新图标 |
| ✦ 采纳按钮 → ai 标记清除 | ✅ | 点采纳后磁盘 `ai: true` 行消失（omitempty）；测完已手改 YAML 恢复 ai:true |
| 底部操作条 / 归档 / 删除按钮 | ✅ | 04-detail-overview.png |
| 设置：亮/暗切换 | ✅ | 05-settings-theme.png（暗色实测整页生效） |
| 6 皮肤 + 高对比开关 | ✅ | 皮肤网格渲染（暖灰/烟灰粉/雾灰蓝/鼠尾草绿/暖灰褐/薰衣草灰/暖杏 + 高对比） |
| 跟随项目语言皮肤开关 | ✅ | 复选框可切换 |
| 主题导出/导入 JSON 按钮 | ✅（按钮在） | 未实际下载往返 |
| 详情"资源管理器"按钮 | ✅ | toast"已拉起: LyricEx"，07-open-explorer.png |
| 快捷键 `/` `g g` `g t` `g d` | ✅ | JS 派发验证：g t→view=table、g d→dashboard、/→聚焦 searchInput |
| 移动端布局 | ➖ 未测 | 按要求不测 |

---

## 五、种子抽检（5 个，对照 inventory 与 analysis）

| 项目 | 盘点（status/quality/language/category） | .teaproject | 一致 |
|---|---|---|---|
| LyricEx | 进行中/整洁/JS纯前端ES模块/音乐歌词字幕 | 进行中/整洁/JavaScript/音乐歌词字幕工具 | ✅ |
| eNoval | 已完成/一般/Python(rich TUI)/终端小说阅读器 | 已完成/一般/Python/终端小说阅读器 | ✅ |
| SRT-Tools | 进行中/整洁/Python(questionary CLI)/音乐歌词字幕 | 进行中/整洁/Python/音乐歌词字幕工具 | ✅ |
| New Gaokao Score Assigner | 进行中/整洁/JavaScript/学习教学 | 进行中/整洁/JavaScript/学习/教学 | ✅ |
| 60s_Aggregator | 已完成/整洁/Python(Flask)/Web小工具油猴 | 已完成/整洁/Python/Web小工具/油猴脚本 | ✅ |

description/intent 均为具体事实（行数/技术栈/规模/日期），非套话：
- eNoval："main.py 335 行 + lang/ 多语言包…已发布 v0.1.0"
- SRT-Tools："main.py 30 行 + utils 三文件约 40 行，README 明示更多功能开发中"（与盘点备注一致）
- New Gaokao："index.html 18KB + app.js/lib.js + 约 2000 行 + 6 个 CSS…ui-design-blueprint.md 46KB"
- 60s_Aggregator："app.py 92 行配 utils/ 模块化 ttl 缓存，真实 Flask 应用"

---

## 六、文案与资源检查

- `web/assets/**` 全文检索 `https?://`：**0 命中**。
- `web/index.html`：echarts 引用为相对路径 `<script src="vendor/echarts/echarts.min.js">`，注释"本地 vendor，相对路径引用，不连外网"；无外部链接。
- `web/`（排除 vendor）检索 `赋能|闭环|一站式|高效管理|助力|打造`：**0 命中**。
- vendor 内 echarts.min.js 的 URL 均为 Apache 许可证与 GitHub 源码声明，属库自身版权头，非产品外链。

---

## 七、发现的问题清单（只记录，未改源码）

### 问题 1【严重 · 前端】搜索与组合筛选在 UI 上不生效
- **现象**：搜索框输入任意词，或下拉选语言/状态/类别，列表不刷新，仍显示全部 59 项。输入不存在的词 `zzzznonexistent999` 后 `state.filter.q` 已更新为该值，但页面仍渲染 59 张卡片。
- **复现**：打开 http://127.0.0.1:8080 → 搜索框输入 "lyric" 或 语言下拉选 Go → 列表不变。
- **根因**：`web/assets/scripts/store.js` 的 `setFilter()` 只 `emit('filter:change')`；`views.js` 的筛选 handler 也只调 `Store.setFilter(...)`，全工程没有任何 `Store.on('filter:change', ...)` 订阅来触发 `render()`/`renderList()`。初始 `loadProjects()` 渲染一次后，后续筛选不再重绘。
- **后端对照**：`GET /api/projects?q=lyric`、`?lang=Go` 在 API 层完全正确（§三）。属纯前端接线缺失。
- **影响**：用户最常用的搜索/筛选当前不可用。

### 问题 2【中 · 后端】归档后项目在 ?archived=1 也不可见
- **现象**：`POST .../archive` 移动成功（`E:\Projects\_archive\Learn Golang` 出现），但 `GET /api/projects?archived=1` 返回 0 条，归档项目从普通列表与归档列表都消失。
- **复现**：归档任一项目后 `GET /api/projects?archived=1`。
- **根因**：`internal/scanner/scanner.go:55` 整棵跳过 `_` 开头目录（含 `_archive`），所以扫描结果里永远没有 `rel_path` 以 `_archive/` 开头的项目；`server.go` 里 `archived` 过滤逻辑形同死代码。
- **影响**：归档功能"移走了却找不回"。归档目录本身移动逻辑正确。

### 问题 3【轻 · 前后端契约】/api/settings JSON 大小写与前端不一致
- **现象**：设置面板与侧栏底部"项目根：—  端口：—"。
- **根因**：`internal/config/config.go` 的 `Config` 结构体只有 `yaml:` 标签、无 `json:` 标签，导致 `GET /api/settings` 返回 PascalCase `{"Bind","Port","ProjectsRoot","Theme"}`；前端 `views.js`/`settings-panel.js` 却读 `serverInfo.projectRoot` / `.port`（camelCase）。其余 API（Project 实体）均为 snake_case。
- **复现**：访问任意页看左下角"项目根/端口"。
- **影响**：仅展示层（本地配置只读展示），不影响功能；外观主题本身走 localStorage，不经此接口。

### 问题 4【轻 · 后端】PUT /api/projects 无法把 ai 设回 true
- **现象**：采纳按钮 `PUT {"ai":false}` 清除标记有效；但 `putProject` 只在 `!*body.AI` 时置 false，没有分支把 ai 置 true。要恢复"待校对"状态只能手改 YAML。
- **复现**：对已采纳项目 `PUT {"ai":true}`，磁盘 ai 仍为 false。
- **影响**：误采纳后无 API 途径反悔（本次验证已手改 YAML 恢复 LyricEx）。

### 问题 5【观察 · 非 bug】active_timeline 只有一个点
- 仪表盘时间线仅 2026-10 一个点。原因：本轮多次 `scan --write` 把所有项目 `last_active` 刷新为今天（2026-10-03）。时间线结构本身正确，是数据现状，待用户后续产生跨月提交后自然丰富。

---

## 八、未测 / 未执行项（如实列出）

- `DELETE /api/projects/:name?force=true` 真删除：按硬约束未执行。
- 移动端布局（≤820px 三明治）：按要求未测。
- 主题导出/导入 JSON 的实际文件下载与回读：按钮存在，未跑完整往返。
- 批量操作条的"归档/打开/删除"动作：条已出现，未实际点击执行。
- 自动区 🔄 单字段重扫：按钮存在且触发 `Api.scan(false)` + 重渲染，未逐字段对比数值。
- 仪表盘点图表区块跳筛选视图：因问题 1（筛选不重渲染）未单独验证跳转。

---

## 九、还原与清理确认

- LyricEx `.teaproject`：notes 已还原为空、`ai: true` 已恢复（磁盘核对 + rescan 后 API 读回 ai=True）。
- Learn Golang：已从 `_archive` 移回 `E:\Projects\Learn Golang`，rescan 后列表恢复 59。
- config.yaml：settings PUT 测试后已还原为 bind=127.0.0.1 / port=8080 / projects_root=E:\Projects / theme=default。
- 未删除任何项目；未改任何源码（web/、internal/、main.go、go.mod）；未 git init。
- 验证结束后 `tea serve` 已停止。

---

## 十、问题修复与复验记录（2026-10-03 二轮）

修复后从当前源码重建 `tea.exe`（go vet exit=0 / go build exit=0，二进制 20:48 重建），重启 `tea serve`，对原 4 个问题 + 1 个观察项逐项独立复验：

| 原问题 | 修复者 | 复验证据 | 结论 |
|---|---|---|---|
| 1 前端搜索/筛选不重渲染 | 前端 views.js | 搜索框输入"歌词"，网格实时渲染 **16 张卡片**（`Store.filteredProjects()=16`，与后端 `?q=歌词=16` 一致）；`lang=Go`→3、`Go×进行中`→2；输入不存在词 `zzzznonexistent999`→`filtered=0`、gridHost 被空态替换。截图 `08-filter-fixed.png` | ✅ 已修 |
| 2 归档后 ?archived=1 不可见 | 后端 scanner | `GET /api/projects?archived=1` 现返回 **6 个**：Blog、Font Previewer、LyricsAuto、SongAPI、Tea Lingo、VocabZoom（与 `_archive\` 下旧归档一致）；默认列表仍 59 | ✅ 已修 |
| 3 /api/settings 返回 PascalCase | 后端 config.go | `GET /api/settings` 现为 `{"bind":"127.0.0.1","port":8080,"projects_root":"E:\\Projects","theme":"default"}`（snake_case）；页面 `serverInfo` 同值；侧栏/抽屉"端口"已显示 **8080**。截图 `09-settings-fixed.png` | ✅ 已修（后端） |
| 4 PUT ai 只能 false | 后端 server.go | 对 LyricEx `PUT {"ai":false}`→磁盘 `ai:` 行消失；`PUT {"ai":true}`→磁盘出现 `ai: true`。双向均生效，测后已还原 `ai:true`/`notes:""` | ✅ 已修 |
| 5 观察：active_timeline 只有一点 | 后端 scanner（last_active 排除元数据文件） | `GET /api/stats` total=65（含 6 归档），`active_timeline` 现跨 **18 个月**（2023-07 → 2026-10）；抽查老项目 last_active 保留旧日期：Blog=2025-10-18、Time Countdown=2023-11-18、MouseFollower=2025-08-14，不再被 scan 刷成今天 | ✅ 已修 |

**回归复测（无退化）**：`GET /`=200(5759B)、`/assets/styles/tokens.css`=200、echarts.min.js=200；`/api/projects`=59；LyricEx 手写区完好（status=进行中/quality=整洁/language=JavaScript/descLen=92/ai:true/notes 空）。

### 复验新发现的残留小项（1 个，轻）
- **【轻 · 前端】根目录仍显示"—"**：后端 `serverInfo.projects_root="E:\Projects"` 已正确下发，"端口 8080"也已正确显示；但侧栏底部"项目根"与设置抽屉"项目服务→根目录"仍渲染为 `—`。端口键名 camel/snake 同为 `port` 所以生效，路径键前端仍读旧 camelCase（疑似 `projectRoot`），未跟上 `projects_root`。仅展示层，不影响功能。截图 `09-settings-fixed.png` 右下"根目录 — / 端口 8080"。
该残留已修复（2026-10-03）：前端 views.js/settings-panel.js 改读 projects_root，复测显示 E:\Projects。

### 本轮还原确认
- LyricEx `.teaproject`：`ai: true` 在盘、notes 空、手写区字段未变。
- 未做归档移动测试（本轮 ?archived=1 只读验证，无目录移动，无需移回）。
- config.yaml 未改。

---

## 十一、批2/3/4 全量验收（2026-10-03 三轮）

修复后从当前源码重建 `tea.exe`（GOCACHE 指工程内 .gocache）。gate：`go vet`=0、`go test ./...` scanner ok、`go build`=0、9 个 JS `node --check` 全 0、web 源 emoji 扫描 0、禁用词 0、外部 CDN 0（vendor 注释除外）。

### 逐 feature 验收表

| Feature | 结论 | 证据 |
|---|---|---|
| gate（vet/test/build/node-check/emoji/CDN） | ✅ | 均 exit=0 |
| GET / / tokens.css / echarts | ✅ | 200 |
| /api/settings 新字段 | ✅ | stale_months=6/resource_min_mb=50/resource_max_code_files=20/backup_keep=10/default_view=grid/config_extensions=[.teaproject,.tea,.teaproj]，全 snake_case |
| /api/stats resource_count / Others 聚合 | ⚠️ | resource_count=8、Others=4 聚合正确；但仪表盘"资源型"统计卡显示 0（见问题 R4-5） |
| projects 新字段覆盖 | ✅ | health_score/stale/resource_type/pinned/workspace_* 全项目存在；LyricEx health=73 stale=false |
| ?month= 月过滤 | ✅ | 2026-10=5、2026-09=2；浏览器 chip"2025-08×"filtered=7 |
| PUT pinned 排序 | ⚠️ | pinned 落盘正确、GET 读回 true；但 API 列表不把 pinned 提前（疑似前端排序，待浏览器确认） |
| GET cover + 防穿越 | ✅ | Fast NCM Downloader/bilibili.png 200 image/png；`../`、`..\` 注入均 404 无泄漏 |
| run SSE 契约 | ❌ | 后端发具名事件 `event: output/exit`+纯文本 data；前端 `es.onmessage` 只收默认事件且 `JSON.parse` 期望 `{line,exit_code}`——两端不匹配，浏览器命令回显不会出（问题 R4-1） |
| backups 写盘 / 返回形状 | ⚠️ | `.tea-backups/<name>/<ts>.yaml` 落盘正确；但 GET 返回单对象 `{file,time,size}`，前端期望 `{versions:[]}` 或数组（问题 R4-2） |
| export json/csv/md | ✅ | 均 200；csv 头 3 字节 EF BB BF = UTF-8 BOM |
| archive→archived=1→restore | ✅（API） | 上轮已验；本轮未重复移动真实项目 |
| DELETE 无 force 400 | ✅ | 上轮已验 |
| autostart | ✅ | GET enabled=false；PUT true 注册表 `tea-pm` 出现（serve --tray）；PUT false 删除；已还原 false |
| --tray | ✅ | 日志"[托盘] 进入托盘模式/图标已注册"、settings 200；托盘菜单 GUI 仅代码路径验证 |
| config_extensions 归一化 | ⚠️ | .teaproject 恒首位、去重生效；但非法值 `.bad!!!` 未丢弃（问题 R4-6） |
| config_extensions 读自定义文件 | ❌ | 临时目录放 .project/.teaproject/.tea/.tpm，目录被识别但未读 YAML（name 用目录名、status/lang 空）（问题 R4-7） |
| Others 语言 | ✅ | 4 个项目 language=Others；index.json 66 条 |
| 浏览器网格健康徽章/陈年横幅/缺依赖/封面 | ✅ | 10-health.png（横幅"48 个项目超 6 个月没动"） |
| 陈年横幅→去看看 | ✅ | 11-stale-banner.png，filtered=48、chip 出现 |
| 月筛选 chip | ✅ | 12-month-filter.png |
| 仪表盘 5 卡 + 3 图 | ⚠️ | 19（见问题 R4-5 资源卡） |
| 设置抽屉（皮肤/chips CRUD/自启/扩展名/备份/导出） | ✅ | 16-settings-r4.png |
| PWA manifest + sw | ✅ | manifest.webmanifest 200、sw controlled |
| Ctrl+K 命令面板 | ❌ | 全工程无 palette 代码、Ctrl+K 未绑定（问题 R4-4） |
| 侧栏项目根/端口 | ✅ | 显示 E:\Projects / 8080（前轮残留已修） |

### 问题清单（只记录，归属分片）
- **R4-1【严重·前后端契约】run SSE 事件格式不匹配**：后端 `event: output/data:<纯文本>` + `event: exit/data:<code>`（server.go:852/857）；前端 project-detail.js:203 用 `es.onmessage` 且 `JSON.parse(ev.data).line/.exit_code`。具名事件不触发 onmessage，纯文本也不是 JSON。复现：详情点任一 commands 按钮，输出区无内容、不显示退出码。归属：后端 run 端点 + 前端 project-detail.js 双方。
- **R4-2【中·前后端契约】/api/backups 返回形状**：后端返回单对象 `{file,time,size}`；前端 settings-panel.js:357 `r.versions||r` 期望数组，`arr.map` 会抛错。归属：后端 backups 列表端点。
- **R4-3【中·后端 scanner】`.tea-backups` 被当项目扫入列表**：备份目录出现在列表首位（rel_path=.tea-backups），应像 `_`/隐藏目录一样跳过。归属：scanner.go。
- **R4-4【缺·前端】Ctrl+K 命令面板未实现**：全工程无 palette 代码，按 Ctrl+K 无反应。归属：前端（批3 自称自测通过但代码缺失）。
- **R4-5【轻·前后端】仪表盘"资源型"卡=0 但 stats resource_count=8**：前端统计卡未读 resource_count。归属：前端 dashboard.js。
- **R4-6【轻·后端】config_extensions 归一化不丢弃非法值**：`.bad!!!` 保留在列表。归属：config.go。
- **R4-7【中·后端】自定义扩展名项目不读 YAML**：放合法 `.project` YAML，项目名仍取目录名、字段空。归属：scanner 配置文件解析。

### 还原确认
- Learn Golang 临时 commands 块已删除；临时探测目录 `E:\Projects\ExtVerifyTmp\` 已删除；config_extensions 已还原默认。
- autostart 注册表 `tea-pm` 已删（enabled=false）；无归档移动、无真删除。
- `.tea-backups/Learn Golang/` 一份探测备份保留属正常备份产物。
- `tea serve` 已停止。

---

## 十二、R4 修复与复验记录（2026-10-03 四轮）

7 个批2/3/4 问题由归属分片修复后独立复验。gate：vet/test/build=0、10 个 JS node --check 全过（含新增 palette.js）。

### 复验结果表（原问题 → 修复者 → 复验证据）

| 编号 | 原问题 | 修复者 | 复验结论 | 证据 |
|---|---|---|---|---|
| R4-1 | run SSE 事件格式前后端不匹配 | 前端 B | ✅ 过 | 后端仍发具名事件 `event: output`+纯文本/`event: exit`+码（字节已抓）；project-detail.js:212/216 改 `addEventListener('output'/'exit')`；浏览器点"hi"回显 `$ hi`+ping 输出+`[退出码 0]`（截图 22） |
| R4-2 | /api/backups 返回单对象 | 后端 A | ✅ 过 | `GET ?project=Learn Golang` 现返回 `{"versions":[{"file":..,"size":..,"time":..}]}`，与前端 `r.versions\|\|r` 兼容 |
| R4-3 | .tea-backups 扫入列表首位 | 后端 A | ✅ 过 | /api/projects count=59、无 .tea-backups；浏览器网格首位正常 |
| R4-4 | Ctrl+K 命令面板未实现 | 前端 B | ✅ 过 | palette.js 已加载（index.html:122）；Ctrl+K/调 `Palette.open()` 弹面板；输"歌词"过滤出 16 项；Esc 关闭（截图 21）。注：面板渲染在左下角而非居中模态，属 CSS 小瑕疵，不影响功能 |
| R4-5 | 资源型卡未读 resource_count | 前端 B | ⚠️ 半过 | 仪表盘"资源型"卡现读 stats.resource_count 并显示数字（前端修复生效）；但后端 resource_count=0（见 R5-1 回归），卡显示 0 而非 8（截图 23） |
| R4-6 | config_extensions 不丢非法值 | 后端 A | ✅ 过 | PUT `[.teaproject,.bad!!!,.tea]` 读回只剩 `.teaproject\|.tea`，非法值丢弃 |
| R4-7 | 自定义扩展名不读 YAML | 后端 A | ❌ 仍失败 | _archive 临时目录放合法 `.project`（name/status/description），加 `.project` 到 config_extensions 后 scan：项目被识别但 name=目录名、status/desc 全空；改名 `<dir>.project` 重扫仍空。修了一半（扩展名生效、目录被扫入）但 YAML 未解析 |

### 新回归
- **R5-1【后端 scanner】resource_type 全 False、stats.resource_count=0**：本轮修复后 GBC Album / Anime Character / MCFontPack / Blog.Assets 等 resource_type 由 True 变 False，resource_count 从 8 掉到 0。疑 R4-7 或 Others 迁移改动资源判定逻辑引入。仪表盘资源型卡因此显示 0。

### 回归抽查
- /api/projects count=59、/api/stats total=59 active/Others=4 聚合正确、时间线跨 2023-07~2026-10 多月份。
- cover 200 image/png、路径注入 404；export csv 首字节 BOM(EF BB BF)；autostart PUT true 注册表出现→PUT false 删除（已还原 false）；/ 200。

### 还原确认
- Learn Golang 临时 commands 块已删除；临时目录 ExtReverifyTmp 已删；config_extensions 已还原默认 `[.teaproject,.tea,.teaproj]`；注册表 tea-pm 已删；无真删除/归档移动。
- `tea serve` 已停止。



