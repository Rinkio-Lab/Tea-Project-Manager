# Tea PM · 项目管家

本地个人项目管理器。扫一遍 `E:\Projects`，把每个项目的状态、语言、Git、体积、最后活跃列出来，给你一个浏览器里的网格/表格/仪表盘。Go 单二进制后端，原生 JS 前端，不连外网。

## 功能

- 网格 / 表格双视图：卡片看名称、语言徽章、状态色点、相对时间、体积、Git 提交数；表格列可排序、可多选批量操作。
- 仪表盘：项目总数、语言数、在弄数、总占用，三张图（语言环形 / 状态条形 / 活跃时间线）。
- 详情控制台：手写区 inline 编辑，Ctrl+S 写回 `.teaproject`；自动区带 🔄 重扫；AI 生成的描述/意图带 ✦，点"采纳"清除标记。
- 一键拉起：终端 / VS Code / 资源管理器 / 浏览器 / GitHub，按 `.teaproject` 里的 `commands[]` 渲染自定义按钮。
- 主题：亮 / 暗 / 跟随系统三态，6 个莫兰迪皮肤 + 高对比，字号可调，主题可导出/导入 JSON。
- 健康度与陈年提醒：每张卡片带 0-100 健康分三档色徽章；超 `stale_months`（默认 6 个月）没动的项目顶部出陈年横幅，点"去看看"一键筛出。
- 依赖与资源：缺依赖出"缺 N"三角徽章；纯资源目录（音乐/字体/发布包）标 Others 语言、资源型徽章，仪表盘单独统计。
- 置顶与封面：常看的项目 `pinned: true` 排到最前；有封面图的卡片显示缩略图，没有则用语言色回退。
- 月筛选：仪表盘点时间线任一月，网格按该月最后活跃过滤；快捷筛选 chips 可在设置里增删排序。
- 备份 / 导出 / 恢复：每次写盘前自动留 `.tea-backups/<项目>/<时间戳>.yaml`（保留 `backup_keep` 份）；设置里可一键恢复；列表可导出 JSON / CSV（UTF-8 BOM）/ Markdown。
- 托盘与自启：`tea serve --tray` 进系统托盘；`/api/autostart` 写注册表开机自启。
- PWA：manifest + service worker，localhost 可安装、可离线开壳。

## 构建运行

```powershell
# 需要 Go 1.21+
go build -o tea.exe .
.\tea.exe serve
# 浏览器打开
# http://127.0.0.1:8080
```

启动后绑死 `127.0.0.1:8080`，不暴露局域网。

## CLI

| 命令 | 作用 |
|---|---|
| `tea serve` | 起 Web UI（默认 127.0.0.1:8080） |
| `tea list` | 终端列出全部项目 |
| `tea show <名字>` | 看单个项目字段 |
| `tea scan` | 全量扫描，默认只读预览；`--write` 才落盘 |
| `tea edit <名字>` | 用系统默认编辑器打开 `.teaproject` |
| `tea open <名字>` | 在资源管理器打开项目目录 |
| `tea actions <名字>` | 列出该项目自定义 actions |

## config.yaml

与 `tea.exe` 同目录，首次运行自动生成：

```yaml
bind: 127.0.0.1      # 只绑本机
port: 8080
projects_root: E:\Projects
theme: default
```

## 目录结构

```
tea.exe
config.yaml
web/                  # 前端（index.html + assets/ + vendor/echarts）
internal/             # Go：config / meta / scanner / server / exec
scripts/generate_seeds.py
docs/                 # 种子报告、验证报告、截图
E:\Projects\<项目>\.teaproject   # 每个项目一份 YAML
E:\Projects\.tea-index.json      # 集中索引（排序号，缓存）
```

## 安全

- 服务只绑 `127.0.0.1`。
- 删除优先走"归档"（移到 `E:\Projects\_archive\`）；真删除必须带 `?force=true`，UI 双重确认。
- 扫描默认 dry-run，`?write=1` 才写盘。
- 打开外部命令走白名单（wt / cmd / code / explorer），不拼 shell。

## 种子与扫描

- 每个项目目录一份 `.teaproject`，分两区：
  - **手写区**（name / status / quality / description / intent / tags / notes …）：你自己填，扫描器一个字节都不覆盖。
  - **自动区**（last_active / code_files / git / deps …）：每次扫描重算。
- `ai: true` 表示这条描述/意图是扫描器或脚本推断的、待你校对；UI 上显示 ✦，点"采纳"后清除。
- 首次 `tea scan --write` 会把自动区填进所有 `.teaproject`。

## 日志与调试

日志打到 stderr，带时间戳与分类前缀，默认一段样例：

```
2026/10/03 22:48:48 [启动] 扫描项目根 E:\Projects ...
2026/10/03 22:49:09 [启动] 完成，共 66 个项目，工作区数=0
tea serve → http://127.0.0.1:8080/  (projects_root=E:\Projects)
2026/10/03 22:49:28 [HTTP] GET /api/settings -> 200 (0s)
2026/10/03 22:49:28 [HTTP] GET / -> 200 (155.9ms)
```

分类前缀：`[启动]` 扫描/启动、`[HTTP]` 每个请求方法路径耗时、`[操作]` run/归档/删除等副作用、`[托盘]` 托盘模式。

- `tea serve --verbose`：打印更详细的请求与扫描细节（命中/跳过的配置文件、合并决策），排障时用。
- 托盘模式：`tea serve --tray`，日志多出 `[托盘] 进入托盘模式` / `[托盘] 图标已注册，消息循环启动`，窗口隐藏进托盘。
- 索引：`E:\Projects\.tea-index.json` 是排序缓存；列表不对就 `tea scan --write` 重建。
