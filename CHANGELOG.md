# Changelog

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
