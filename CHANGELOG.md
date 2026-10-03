# Changelog

## v1.1.0（2026-10-03 · 健康度 / 陈年 / 备份 / 托盘）

### UI 迭代
- 卡片健康度三档色徽章（0-100）、置顶 pin-tag、缺依赖"缺 N"三角徽章、资源型徽章、封面缩略图（无图用语言色回退）。
- 陈年横幅：超 6 个月没动的项目顶部提示，点"去看看"直接筛出。
- 仪表盘点时间线任一月出月筛选 chip；快捷筛选 chips 可在设置里增删排序。
- 右键卡片/表格行出上下文菜单；设置抽屉补工作区 CRUD、自启开关、配置扩展名组、备份恢复、导出三按钮。
- PWA：manifest + service worker，localhost 可安装、可离线开壳。

### 数据与扫描
- 新字段 health_score / stale / deps_missing / resource_type / pinned / workspace_name / workspace_color / cover_rel。
- `last_active` 排除 `.teaproject` 等元数据文件，扫描不再把老项目刷新成今天。
- 4 份纯资源目录（Blog.Assets / eNoval-v0.1.0-release / MCFontPack / PowerPointProject）language 直改 Others，stats 聚合正确。
- config_extensions 扩展名集合：`.teaproject` 恒首位、去重归一化；自定义合法扩展名可作项目配置文件。

### 操作集成
- 详情命令区：按项目 `commands[]` 白名单启动命令，SSE 流式回显 + 终止按钮。
- 批量多开：表格多选后一键拉起多个项目。

### 数据与备份
- 每次写盘前自动备份 `.tea-backups/<项目>/<时间戳>.yaml`，保留 `backup_keep` 份；设置里可恢复。
- 列表导出 JSON / CSV（UTF-8 BOM）/ Markdown。
- 归档项目 `?archived=1` 可见、可恢复；冲突时 409。

### 工程化
- `tea serve --tray` 系统托盘（纯 syscall）；`/api/autostart` 读写注册表开机自启。
- settings 全部 snake_case；cover 端点防路径穿越；DELETE 无 force 一律 400。

### Test
- go vet / go test / go build / 9 个 JS node --check 全绿；浏览器逐 feature 截图（docs/screenshots/10-* 起）。
- 已知未闭环项见 docs/verification-report-2026-10-03.md 批2/3/4 节。

## v2.0.0（2026-10-03 · Go + Web UI 重构）

### Added
- tea 单二进制：serve / list / scan / show / edit / open / actions 子命令
- gin REST API：项目列表、详情、编辑写回 YAML、扫描、统计、打开、归档、设置
- Web UI：网格/表格双视图、详情编辑控制台、echarts 仪表盘、搜索筛选、三态主题 + 6 莫兰迪皮肤 + 高对比
- 59 个项目 .teaproject 种子配置（AI 补全 description/intent，带 ai 待校对标记）
- 扫描器：手写区绝不覆盖，自动区每次 scan 刷新；_archive 项目可经 archived=1 查看
- 在线 UI 案例借鉴清单 docs/ui-cases-2026-10-03.md

### Test
- go vet / go build / node --check 全绿
- REST 端点全通、扫描只刷自动区验证（详见 docs/verification-report-2026-10-03.md）
- 浏览器全流程验收：网格/表格/仪表盘/编辑写回/主题/快捷键/操作按钮（截图见 docs/screenshots/）

### Notes
- 服务只绑 127.0.0.1；归档优先、真删除需 force 双重确认
- 索引缓存 E:\Projects\.tea-index.json，由 tea scan 重建；排序号存索引不存 YAML
