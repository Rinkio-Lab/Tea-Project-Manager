# Tea PM · 项目管家

本地个人项目管理器。扫一遍 `E:\Projects`，把每个项目的状态、语言、Git、体积、最后活跃列出来，给你一个浏览器里的网格/表格/仪表盘。Go 单二进制后端，原生 JS 前端，不连外网。

## 功能

- 网格 / 表格双视图：卡片看名称、语言徽章、状态色点、相对时间、体积、Git 提交数；表格列可排序、可多选批量操作。
- 仪表盘：项目总数、语言数、在弄数、总占用，三张图（语言环形 / 状态条形 / 活跃时间线）。
- 详情控制台：手写区 inline 编辑，Ctrl+S 写回 `.teaproject`；自动区带 🔄 重扫；AI 生成的描述/意图带 ✦，点"采纳"清除标记。
- 一键拉起：终端 / VS Code / 资源管理器 / 浏览器 / GitHub，按 `.teaproject` 里的 `actions[]` 渲染自定义按钮。
- 主题：亮 / 暗 / 跟随系统三态，6 个莫兰迪皮肤 + 高对比，字号可调，主题可导出/导入 JSON。

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
