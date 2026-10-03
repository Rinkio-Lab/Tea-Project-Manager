package cli18n

// 中文（默认）
var dictZh = Dict{
	UsageHeader:  "tea — Tea Project Manager 2.0\n\n用法:",
	UsageServe:   "  tea serve              启动 Web UI（默认 127.0.0.1:8080）",
	UsageList:    "  tea list               列出所有项目",
	UsageScan:    "  tea scan [--write]     全量扫描（默认只读预览，--write 才写 .teaproject）",
	UsageShow:    "  tea show <name>        显示单项目详情",
	UsageEdit:    "  tea edit <name>        用系统默认编辑器打开 .teaproject",
	UsageOpen:    "  tea open <name>        在资源管理器打开项目目录",
	UsageActions: "  tea actions <name>     列出项目自定义 actions",
	UsageCreate:  "  tea create <name>       新建项目目录并写入 .teaproject",

	TblName:       "NAME",
	TblLang:       "LANG",
	TblStatus:     "STATUS",
	TblSizeMB:     "SIZE_MB",
	TblLastActive: "LAST_ACTIVE",

	ScanDoneTpl: "扫描完成，共 %d 个项目",
	ScanDryRun:  "dry-run（只读）",
	ScanWrite:    "write（已落盘）",

	CreatedTpl:       "已创建：%s",
	ErrAlreadyExists: "目录已存在，未覆盖",
	ErrBadType:       "非法 --type，可选 empty/web/python",
	ErrBadName:       "名称含路径分隔符或 ..，拒绝",
	ErrNameEmpty:     "名称不能为空",
}

// English
var dictEn = Dict{
	UsageHeader:  "tea — Tea Project Manager 2.0\n\nUsage:",
	UsageServe:   "  tea serve              start Web UI (default 127.0.0.1:8080)",
	UsageList:    "  tea list               list all projects",
	UsageScan:    "  tea scan [--write]     full scan (dry-run unless --write)",
	UsageShow:    "  tea show <name>        show one project",
	UsageEdit:    "  tea edit <name>        open .teaproject in default editor",
	UsageOpen:    "  tea open <name>        open project folder in Explorer",
	UsageActions: "  tea actions <name>     list custom actions",
	UsageCreate:  "  tea create <name>      create a new project folder with .teaproject",

	TblName:       "NAME",
	TblLang:       "LANG",
	TblStatus:     "STATUS",
	TblSizeMB:     "SIZE_MB",
	TblLastActive: "LAST_ACTIVE",

	ScanDoneTpl: "Scan done: %d projects",
	ScanDryRun:  "dry-run (read-only)",
	ScanWrite:   "write (saved)",

	CreatedTpl:       "Created: %s",
	ErrAlreadyExists: "Folder already exists, not overwritten",
	ErrBadType:       "Invalid --type, must be empty/web/python",
	ErrBadName:       "Name contains path separator or '..', rejected",
	ErrNameEmpty:     "Name must not be empty",
}

// 日本語
var dictJa = Dict{
	UsageHeader:  "tea — Tea Project Manager 2.0\n\n使い方:",
	UsageServe:   "  tea serve              Web UI を起動（デフォルト 127.0.0.1:8080）",
	UsageList:    "  tea list               プロジェクト一覧を表示",
	UsageScan:    "  tea scan [--write]     全件スキャン（--write で .teaproject 書き込み）",
	UsageShow:    "  tea show <name>        プロジェクト詳細を表示",
	UsageEdit:    "  tea edit <name>        .teaproject を既定エディタで開く",
	UsageOpen:    "  tea open <name>        エクスプローラでフォルダを開く",
	UsageActions: "  tea actions <name>     カスタムアクション一覧",
	UsageCreate:  "  tea create <name>      新規プロジェクトフォルダと .teaproject を作成",

	TblName:       "NAME",
	TblLang:       "LANG",
	TblStatus:     "STATUS",
	TblSizeMB:     "SIZE_MB",
	TblLastActive: "LAST_ACTIVE",

	ScanDoneTpl: "スキャン完了: %d 件",
	ScanDryRun:  "ドライラン（読み取り専用）",
	ScanWrite:   "書き込み済み",

	CreatedTpl:       "作成しました: %s",
	ErrAlreadyExists: "フォルダは既に存在、上書きしません",
	ErrBadType:       "--type が不正です。empty/web/python のいずれか",
	ErrBadName:       "名前にパス区切り文字や '..' は使えません",
	ErrNameEmpty:     "名前を空にできません",
}
