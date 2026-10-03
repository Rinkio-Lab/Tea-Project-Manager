// Package cli18n 提供 CLI 帮助文本与主要输出的 i18n 字典（zh/en/ja）。
//
// 设计原则：
//   - 只覆盖"用户可见的固定文案"（帮助、表头、create 成功/错误），
//     不追求翻译每个日志行——日志继续用中文写。
//   - 键缺失时 fallback 到 zh（中文是工程默认语言）。
//   - 通过 Load(lang) 取一份 *Dict；lang 空/未知时回退 zh。
package cli18n

import (
	"os"

	"gopkg.in/yaml.v3"
)

// Dict 是 CLI 文案字典。字段都是句子或短表头，避免运行时再拼接。
type Dict struct {
	Lang string // 实际生效的语言（zh/en/ja）

	// 顶层帮助
	UsageHeader  string
	UsageServe   string
	UsageList    string
	UsageScan    string
	UsageShow    string
	UsageEdit    string
	UsageOpen     string
	UsageActions string
	UsageCreate  string

	// list 表头
	TblName       string
	TblLang       string
	TblStatus     string
	TblSizeMB     string
	TblLastActive string

	// scan 输出
	ScanDoneTpl string // "完成，共 %d 个项目"
	ScanDryRun  string
	ScanWrite   string

	// create 输出
	CreatedTpl       string // "已创建：%s"
	ErrAlreadyExists string
	ErrBadType       string
	ErrBadName       string
	ErrNameEmpty     string
}

var dicts = map[string]Dict{
	"zh": dictZh,
	"en": dictEn,
	"ja": dictJa,
}

// Load 按 lang 取字典；空/未知 → zh。
func Load(lang string) *Dict {
	if d, ok := dicts[lang]; ok {
		d.Lang = lang
		return &d
	}
	d := dictZh
	d.Lang = "zh"
	return &d
}

// ReadLangFromYAML 从 config.yaml 的 language 字段读语言。
// 不依赖 config.Config.Language（并行子代理 A 还在加这个字段），
// 用最小 struct 解析；文件缺失/字段缺省都返回 "zh"。
func ReadLangFromYAML(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return "zh"
	}
	var v struct {
		Language string `yaml:"language"`
	}
	if err := yaml.Unmarshal(data, &v); err != nil {
		return "zh"
	}
	if v.Language == "" {
		return "zh"
	}
	return v.Language
}
