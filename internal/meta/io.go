package meta

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// LoadYamlExt 按 exts 顺序在 dir 下找第一个存在的配置文件并读取。
// 返回 (project, usedPath, error)：
//   - project: 解析成功的项目；无配置文件时为 nil
//   - usedPath: 实际读到的文件绝对路径；无配置时为空
//
// 自定义扩展名（非 .teaproject/.tea/.teaproj/.tpm）会先做 YAML 探测：
// yaml.v3 能解析成 map 且 name 非空才算有效；否则跳过该文件继续找下一个。
func LoadYamlExt(dir string, exts []string) (*Project, string, error) {
	for _, ext := range exts {
		ext = strings.TrimSpace(ext)
		if !strings.HasPrefix(ext, ".") {
			continue
		}
		path := filepath.Join(dir, ext)
		fi, err := os.Stat(path)
		if err != nil || fi.IsDir() {
			continue
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, "", err
		}
		p := &Project{Path: dir}
		if err := yaml.Unmarshal(data, p); err != nil {
			// 自定义扩展名解析失败 → 跳过该文件，继续找下一个
			continue
		}
		// 探测：name 为空 → 不是有效配置（跳过）
		if p.Name == "" {
			continue
		}
		p.ConfigFile = path
		return p, path, nil
	}
	return nil, "", nil
}

// SaveYaml 把 Project 写回它读到的配置文件（p.ConfigFile）。
// 若 ConfigFile 为空（新项目首次落盘），写默认 .teaproject。
func SaveYaml(p *Project) error {
	data, err := yaml.Marshal(p)
	if err != nil {
		return err
	}
	path := p.ConfigFile
	if path == "" {
		path = p.YamlPath()
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ---- 集中索引 .tea-index.json ----

// Index 是 .tea-index.json 的结构。projects_root 下的缓存。
type Index struct {
	Projects []*Project `json:"projects"`
}

// LoadIndex 读集中索引；文件不存在时返回空 Index（不报错，首次运行正常）。
func LoadIndex(root string) (*Index, error) {
	data, err := os.ReadFile(filepath.Join(root, IndexName))
	if err != nil {
		if os.IsNotExist(err) {
			return &Index{}, nil
		}
		return nil, err
	}
	idx := &Index{}
	if err := json.Unmarshal(data, idx); err != nil {
		return nil, err
	}
	return idx, nil
}

// SaveIndex 原子写集中索引。
func SaveIndex(root string, idx *Index) error {
	data, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(root, IndexName)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
