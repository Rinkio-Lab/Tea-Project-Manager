package scanner

// 最小可运行测试：扫描器合并策略 + dry-run/write 语义。
// 用 t.TempDir() 造假项目树，不碰真实 E:\Projects。

import (
	"os"
	"path/filepath"
	"testing"

	"tea-pm/internal/meta"
)

// writeFile 在 dir 下创建文件，内容 content。
func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", p, err)
	}
}

// setupTree 在 t.TempDir() 下造两棵假项目：
//
//	existing/  带 .teaproject（手写区 description/status）+ 两个 .go 源码
//	fresh/     无 .teaproject，只有两个 .py 源码
func setupTree(t *testing.T) string {
	t.Helper()
	root := t.TempDir()

	// existing 项目
	exDir := filepath.Join(root, "existing")
	if err := os.Mkdir(exDir, 0o755); err != nil {
		t.Fatal(err)
	}
	yaml := `name: existing
path: ` + exDir + `
description: 手写描述-不应被覆盖
status: 进行中
last_active: "2020-01-01"
code_files: 999
`
	writeFile(t, exDir, ".teaproject", yaml)
	writeFile(t, exDir, "main.go", "package main\nfunc main() {}\n")
	writeFile(t, exDir, "utils.go", "package main\nfunc x() {}\n")

	// fresh 项目（无 .teaproject）
	frDir := filepath.Join(root, "fresh")
	if err := os.Mkdir(frDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, frDir, "main.py", "print('hi')\n")
	writeFile(t, frDir, "helpers.py", "def f(): pass\n")

	return root
}

// TestMergeHandwrittenPreserved 验证：已有 .teaproject 的项目，
// 扫描只刷自动区，手写区逐字不变。
func TestMergeHandwrittenPreserved(t *testing.T) {
	root := setupTree(t)

	res, err := Scan(root, false, []string{".teaproject"})
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}
	if len(res.Projects) != 2 {
		t.Fatalf("expect 2 projects, got %d", len(res.Projects))
	}

	// 找 existing
	var ex *meta.Project
	for _, p := range res.Projects {
		if p.Name == "existing" {
			ex = p
		}
	}
	if ex == nil {
		t.Fatalf("existing project not found in %+v", res.Projects)
	}

	// 手写区逐字不变
	if ex.Description != "手写描述-不应被覆盖" {
		t.Errorf("description 被改: got %q want %q", ex.Description, "手写描述-不应被覆盖")
	}
	if ex.Status != "进行中" {
		t.Errorf("status 被改: got %q want %q", ex.Status, "进行中")
	}

	// 自动区被刷新：code_files 应=2（main.go+utils.go），不再是 yaml 里的 999
	if ex.CodeFiles != 2 {
		t.Errorf("code_files 未刷新: got %d want 2", ex.CodeFiles)
	}
	if ex.LastActive == "" || ex.LastActive == "2020-01-01" {
		t.Errorf("last_active 未刷新: got %q", ex.LastActive)
	}
}

// TestFreshProjectInferred 验证：无 .teaproject 的目录生成推断条目，ai=true。
func TestFreshProjectInferred(t *testing.T) {
	root := setupTree(t)

	res, err := Scan(root, false, []string{".teaproject"})
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}
	var fr *meta.Project
	for _, p := range res.Projects {
		if p.Name == "fresh" {
			fr = p
		}
	}
	if fr == nil {
		t.Fatal("fresh project not found")
	}
	if !fr.AI {
		t.Error("fresh project 应标 ai=true")
	}
	if fr.Language != "Python" {
		t.Errorf("fresh language 推断错误: got %q want Python", fr.Language)
	}
}

// TestDryRunDoesNotWrite 验证 dry-run（write=false）不写 .teaproject 到 fresh。
func TestDryRunDoesNotWrite(t *testing.T) {
	root := setupTree(t)
	frPath := filepath.Join(root, "fresh", ".teaproject")

	if _, err := Scan(root, false, []string{".teaproject"}); err != nil {
		t.Fatalf("Scan dry-run: %v", err)
	}
	if _, err := os.Stat(frPath); !os.IsNotExist(err) {
		t.Errorf("dry-run 不应写 .teaproject，但 %s 已存在", frPath)
	}
}

// TestWriteDoesNotPersistYaml 验证 write=true 时 fresh 推断条目只进索引、不落盘 .teaproject。
//（R6-1：不落盘是为了让后续用户放的自定义扩展名配置能被 LoadYamlExt 读到）
func TestWriteDoesNotPersistYaml(t *testing.T) {
	root := setupTree(t)
	frPath := filepath.Join(root, "fresh", ".teaproject")

	if _, err := Scan(root, true, []string{".teaproject"}); err != nil {
		t.Fatalf("Scan write: %v", err)
	}
	if _, err := os.Stat(frPath); !os.IsNotExist(err) {
		t.Errorf("write=true 不应落盘 %s（推断条目只进索引）", frPath)
	}
}

// TestRescanPicksUpNewConfig 回归：fresh 推断条目入索引后，
// 目录里补一个 .teaproject 配置文件 → 再 Scan → 手写区从磁盘读出（覆盖推断 name）。
func TestRescanPicksUpNewConfig(t *testing.T) {
	root := setupTree(t)
	// 首扫：fresh 无配置 → 推断条目
	if _, err := Scan(root, false, []string{".teaproject"}); err != nil {
		t.Fatalf("first scan: %v", err)
	}
	// 用户放 .teaproject（手写区）
	cfg := "name: CustomName\nstatus: 进行中\ndescription: 用户手写\n"
	if err := os.WriteFile(filepath.Join(root, "fresh", ".teaproject"), []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}
	// 再扫
	res, err := Scan(root, false, []string{".teaproject"})
	if err != nil {
		t.Fatalf("second scan: %v", err)
	}
	var fr *meta.Project
	for _, p := range res.Projects {
		if p.Name == "CustomName" {
			fr = p
			break
		}
	}
	if fr == nil {
		t.Fatal("rescan 后未读到 .teaproject 的手写 name=CustomName")
	}
	if fr.Status != "进行中" {
		t.Errorf("status 未从磁盘读出: got %q", fr.Status)
	}
	if fr.Description != "用户手写" {
		t.Errorf("description 未从磁盘读出: got %q", fr.Description)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
