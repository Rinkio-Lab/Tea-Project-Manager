package meta

import (
	"encoding/json"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// LoadYaml 从项目目录读 .teaproject 到 Project。
// 调用方需先填好 RelPath/Path；读回来后 Name 等字段覆盖之。
// 文件不存在时返回 (nil, nil)——调用方据此走"推断条目"分支。
func LoadYaml(dir string) (*Project, error) {
	data, err := os.ReadFile(filepath.Join(dir, FileName))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	p := &Project{Path: dir}
	if err := yaml.Unmarshal(data, p); err != nil {
		return nil, err
	}
	return p, nil
}

// SaveYaml 把 Project 写回它的 .teaproject（原子写）。
// 注意：Order/RelPath 已用 yaml:"-" 排除，不会落盘。
func SaveYaml(p *Project) error {
	data, err := yaml.Marshal(p)
	if err != nil {
		return err
	}
	path := p.YamlPath()
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
