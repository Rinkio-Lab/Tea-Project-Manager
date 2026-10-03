// Package meta 定义项目元数据结构，负责两类持久化：
//   - 分布式 .teaproject（每项目目录内的 YAML，人类可读、可进 git）
//   - 集中索引 .tea-index.json（projects_root 根下的 JSON 缓存，存排序号 order）
//
// 手写区 / 自动区分离是本包的核心不变量：
// 手写区（Name/Type/Category/Status/Quality/Description/Intent/Tags/Language/TechStack/Actions/Notes）
// 是用户财产，扫描器绝不覆盖；自动区（LastActive/Created/CodeFiles/CodeSizeKB/TotalSizeMB/Git/Deps）
// 每次扫描刷新。
package meta

import (
	"os"
	"path/filepath"
)

// FileName 是每项目目录里的元数据文件名（带点，Godot 风格）。
const FileName = ".teaproject"

// IndexName 是 projects_root 根下的集中索引文件名。
const IndexName = ".tea-index.json"

// Action 是用户在 .teaproject 里自定义的"一键操作"。
// Command 与 URL 二选一：command 走 shell，url 直接浏览器打开。
type Action struct {
	Name    string `yaml:"name" json:"name"`
	Command string `yaml:"command,omitempty" json:"command,omitempty"`
	URL     string `yaml:"url,omitempty" json:"url,omitempty"`
}

// GitInfo 是自动区里的 git 探测结果。
type GitInfo struct {
	Repo    bool   `yaml:"repo" json:"repo"`
	Commits int    `yaml:"commits,omitempty" json:"commits,omitempty"`
	Remote  string `yaml:"remote,omitempty" json:"remote,omitempty"`
}

// Project 对应一个项目目录的全部元数据。
// YAML tag 决定落盘字段；JSON tag 决定 API 返回结构。
//
// Order 仅存在于 .tea-index.json（yaml:"-" 不写进 YAML），
// 用于网格拖拽排序——用户决策"顺序不进 .teaproject"。
type Project struct {
	// ---- 标识区（手写，扫描器不覆盖）----
	Name        string   `yaml:"name" json:"name"`
	Path        string   `yaml:"path" json:"path"`
	Type        string   `yaml:"type,omitempty" json:"type,omitempty"`
	Category    string   `yaml:"category,omitempty" json:"category,omitempty"`
	Language    string   `yaml:"language,omitempty" json:"language,omitempty"`
	TechStack   []string `yaml:"tech_stack,omitempty" json:"tech_stack,omitempty"`
	Status      string   `yaml:"status,omitempty" json:"status,omitempty"`
	Quality     string   `yaml:"quality,omitempty" json:"quality,omitempty"`
	Description string   `yaml:"description,omitempty" json:"description,omitempty"`
	Intent      string   `yaml:"intent,omitempty" json:"intent,omitempty"`
	Tags        []string `yaml:"tags,omitempty" json:"tags,omitempty"`

	// ---- 自动区（每次 scan 刷新）----
	LastActive  string   `yaml:"last_active,omitempty" json:"last_active,omitempty"`
	Created     string   `yaml:"created,omitempty" json:"created,omitempty"`
	CodeFiles   int      `yaml:"code_files,omitempty" json:"code_files,omitempty"`
	CodeSizeKB  int      `yaml:"code_size_kb,omitempty" json:"code_size_kb,omitempty"`
	TotalSizeMB float64  `yaml:"total_size_mb,omitempty" json:"total_size_mb,omitempty"`
	Git         *GitInfo `yaml:"git,omitempty" json:"git,omitempty"`
	Deps        []string `yaml:"deps,omitempty" json:"deps,omitempty"`

	// ---- 操作与备注（手写）----
	Actions []Action `yaml:"actions,omitempty" json:"actions,omitempty"`
	Notes   string   `yaml:"notes,omitempty" json:"notes,omitempty"`

	// AI 标记：手写区由扫描器推断填充时置 true，用户"采纳"后清除。
	AI bool `yaml:"ai,omitempty" json:"ai,omitempty"`

	// ---- 仅索引/运行期字段（不落 .teaproject）----
	// RelPath 是相对 projects_root 的路径（Windows 反斜杠），作为项目唯一键。
	RelPath string `yaml:"-" json:"rel_path"`
	// Order 排序号，仅写 .tea-index.json。
	Order int `yaml:"-" json:"order"`
	// Archived 运行期标记：项目位于 _archive/ 下时为 true。不落 yaml。
	Archived bool `yaml:"-" json:"archived"`
}

// YamlPath 返回项目目录内 .teaproject 的绝对路径。
func (p *Project) YamlPath() string {
	return filepath.Join(p.Path, FileName)
}

// HasYaml 报告该项目目录里是否已存在 .teaproject。
func (p *Project) HasYaml() bool {
	_, err := os.Stat(p.YamlPath())
	return err == nil
}
