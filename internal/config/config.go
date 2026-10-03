// Package config 负责全局配置 config.yaml 的读写。
//
// 配置位置：与 tea 可执行文件同目录（E:\Projects\Tea Project Manager\config.yaml）。
// 首次运行若文件不存在，自动落盘一份默认配置，方便用户照着改。
package config

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Config 全局设置。字段与 config.yaml 一一对应。
// ponytail: 这里只放"用户可改"的项；项目级数据走 .teaproject / .tea-index.json。
type Config struct {
	// Bind 监听地址，默认 127.0.0.1——安全要求：不暴露局域网。
	Bind string `yaml:"bind" json:"bind"`
	// Port 监听端口，默认 8080。
	Port int `yaml:"port" json:"port"`
	// ProjectsRoot 项目根目录，默认 E:\Projects。
	ProjectsRoot string `yaml:"projects_root" json:"projects_root"`
	// Theme 默认主题标识，透传给前端。
	Theme string `yaml:"theme" json:"theme"`
}

// Default 返回内置默认配置。路径用硬编码兜底（本工程面向 Windows 单机）。
func Default() *Config {
	return &Config{
		Bind:         "127.0.0.1",
		Port:         8080,
		ProjectsRoot: `E:\Projects`,
		Theme:        "default",
	}
}

// Load 读 config.yaml；文件不存在时写一份默认值并返回。
// path 通常是 exe 同目录下的 config.yaml。
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			cfg := Default()
			if werr := Save(path, cfg); werr != nil {
				return nil, werr
			}
			return cfg, nil
		}
		return nil, err
	}
	cfg := Default()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	// 兜底：用户可能删掉了某个字段，零值时填默认。
	if cfg.Bind == "" {
		cfg.Bind = "127.0.0.1"
	}
	if cfg.Port == 0 {
		cfg.Port = 8080
	}
	if cfg.ProjectsRoot == "" {
		cfg.ProjectsRoot = `E:\Projects`
	}
	return cfg, nil
}

// Save 把配置写回 yaml（原子写：先写临时文件再 rename）。
func Save(path string, cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Dir 返回 exe 所在目录，用于定位 config.yaml 与 web/ 静态资源目录。
func Dir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Dir(exe), nil
}
