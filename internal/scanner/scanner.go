// Package scanner 负责扫描 projects_root、推断项目元数据、刷新自动区。
//
// 关键语义（与 AGENTS.md / 设计稿 §3 对齐）：
//   - 顶层名称以 "_" 开头的目录整棵排除（_archive/_legacy/_misc/_scripts/_userscripts/_web-tools）
//   - 递归发现嵌套的 .teaproject（如 Lyrics Layout\New Songs）
//   - 已有 .teaproject：只刷新自动区，手写区一个字节都不动
//   - 无 .teaproject 的目录：生成推断条目，手写区用推断值填充并标 ai:true；
//     仅在 write=true 时才真正落盘 .teaproject（dry-run 默认）
package scanner

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"tea-pm/internal/meta"
)

// excludeDirs 是扫描时整棵跳过的目录名（产物/依赖/版本库元数据）。
var excludeDirs = map[string]bool{
	".git": true, ".venv": true, "node_modules": true, "dist": true,
	"build": true, "__pycache__": true, "vendor": true, ".idea": true,
	".vscode": true, "bin": true, "obj": true, "target": true,
}

// ScanResult 是一次扫描的产出。
type ScanResult struct {
	Projects []*meta.Project `json:"projects"`
	// CreatedYaml 记录本次扫描"新增落盘"了哪些 .teaproject（write=true 时）。
	CreatedYaml []string `json:"created_yaml,omitempty"`
	// UpdatedAuto 记录哪些项目只刷新了自动区。
	UpdatedAuto []string `json:"updated_auto,omitempty"`
}

// excludeTopDirs 是顶层整棵跳过的目录名。
// _archive 不在此列——它是"归档项目"的存放地，必须递归扫描。
var excludeTopDirs = map[string]bool{
	"_legacy": true, "_misc": true, "_scripts": true,
	"_userscripts": true, "_web-tools": true,
}

// Scan 扫描 root。write=false 时只读，不写任何 .teaproject。
// exts 是配置扩展名优先级列表（如 [".teaproject",".tea"]），决定读哪个文件。
func Scan(root string, write bool, exts []string) (*ScanResult, error) {
	if len(exts) == 0 {
		exts = []string{".teaproject"}
	}
	res := &ScanResult{}

	topEntries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}

	for _, entry := range topEntries {
		name := entry.Name()
		if !entry.IsDir() {
			continue
		}
		// 顶层排除名单：_legacy/_misc/_scripts/_userscripts/_web-tools 整棵不扫。
		// _archive 保留——归档项目要能被 archived=1 查到。
		if excludeTopDirs[name] {
			continue
		}
		abs := filepath.Join(root, name)
		// _archive 是容器目录，它本身不是项目点；只扫它下面的子项目。
		if name == "_archive" {
			subEntries, err := os.ReadDir(abs)
			if err != nil {
				continue
			}
			for _, sub := range subEntries {
				if !sub.IsDir() {
					continue
				}
				subDirs, _ := collectProjectDirs(filepath.Join(abs, sub.Name()))
				for _, dir := range subDirs {
					p, err := scanOne(root, dir, write, res, exts)
					if err != nil {
						continue
					}
					res.Projects = append(res.Projects, p)
				}
			}
			continue
		}
		projDirs, err := collectProjectDirs(abs)
		if err != nil {
			continue
		}
		for _, dir := range projDirs {
			p, err := scanOne(root, dir, write, res, exts)
			if err != nil {
				continue
			}
			res.Projects = append(res.Projects, p)
		}
	}
	return res, nil
}

// collectProjectDirs 递归找 dir 子树下所有"项目根"目录：
//   - 含 .teaproject 的目录（无论嵌套多深）
//   - 若某子树从 dir 开始就没有 .teaproject，则 dir 本身作为一个顶层项目点
//
// 排除规则：遇到 excludeDirs 直接停下不进。
func collectProjectDirs(dir string) ([]string, error) {
	var out []string

	hasYaml := false
	walkErr := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return filepath.SkipDir
		}
		if !d.IsDir() {
			return nil
		}
		base := d.Name()
		// 跳过产物/依赖目录整棵子树。
		if excludeDirs[base] {
			return filepath.SkipDir
		}
		// 遇到 .teaproject：该目录是项目点，登记后不再下钻（项目不嵌套项目？
		// 设计稿明确支持 Lyrics Layout\New Songs 这种嵌套，所以仍要下钻继续找）。
		if _, serr := os.Stat(filepath.Join(path, meta.FileName)); serr == nil {
			out = append(out, path)
			hasYaml = true
		}
		return nil
	})
	_ = walkErr

	// 顶层目录自己没有 .teaproject 时，把它当作"待推断"项目点。
	if !hasYaml {
		out = append(out, dir)
	}
	return out, nil
}

// scanOne 处理单个项目目录：
//   - 有配置 → 读进来，只覆写自动区
//   - 无配置   → 构造推断 Project（手写区=推断值，ai:true）；write=true 时落盘
// 计数（CreatedYaml/UpdatedAuto）直接写入 res。
func scanOne(root, dir string, write bool, res *ScanResult, exts []string) (*meta.Project, error) {
	rel, _ := filepath.Rel(root, dir)

	existing, _, err := meta.LoadYamlExt(dir, exts)
	if err != nil {
		return nil, err
	}

	var p *meta.Project
	if existing != nil {
		p = existing
		res.UpdatedAuto = append(res.UpdatedAuto, rel)
	} else {
		p = inferProject(dir)
		p.AI = true // 手写区全是 AI 推断值，等用户采纳
	}

	p.Path = dir
	p.RelPath = rel
	p.Archived = strings.HasPrefix(filepath.ToSlash(rel), "_archive/")

	// 归档项目：无 status 时推断为"已归档"（有 status 则保留用户手写值）
	if p.Archived && p.Status == "" {
		p.Status = "已归档"
	}

	// ---- 刷新自动区（两种情况都刷）----
	fillAuto(p)

	if existing == nil && write {
		if err := meta.SaveYaml(p); err != nil {
			return nil, fmt.Errorf("write .teaproject in %s: %w", dir, err)
		}
		res.CreatedYaml = append(res.CreatedYaml, rel)
	}
	return p, nil
}

// inferProject 从目录结构推断手写区初值（仅在无 .teaproject 时用）。
func inferProject(dir string) *meta.Project {
	base := filepath.Base(dir)
	p := &meta.Project{
		Name:     base,
		Language: detectLanguage(dir),
		Type:     detectType(dir),
	}
	return p
}

// detectLanguage 按"标记文件"猜主语言。命中即返回，不做权重。
func detectLanguage(dir string) string {
	markers := []struct {
		file string
		lang string
	}{
		{"go.mod", "Go"},
		{"package.json", "JavaScript"},
		{"pyproject.toml", "Python"},
		{"requirements.txt", "Python"},
		{"setup.py", "Python"},
		{"Cargo.toml", "Rust"},
		{"pom.xml", "Java"},
		{"composer.json", "PHP"},
		{"Gemfile", "Ruby"},
	}
	for _, m := range markers {
		if _, err := os.Stat(filepath.Join(dir, m.file)); err == nil {
			return m.lang
		}
	}
	// 退一步：看顶层散文件后缀
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	extCount := map[string]int{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if ext != "" {
			extCount[ext]++
		}
	}
	// 选出现最多的扩展名映射回语言
	type extLang struct{ exts []string; lang string }
	rules := []extLang{
		{[]string{".go"}, "Go"},
		{[]string{".py"}, "Python"},
		{[]string{".js", ".mjs", ".ts", ".html", ".css"}, "JavaScript"},
		{[]string{".rs"}, "Rust"},
		{[]string{".cs"}, "C#"},
		{[]string{".java"}, "Java"},
		{[]string{".cpp", ".cc", ".c", ".h"}, "C++"},
		{[]string{".md"}, "Markdown"},
	}
	bestLang, bestN := "", 0
	for _, r := range rules {
		n := 0
		for _, ex := range r.exts {
			n += extCount[ex]
		}
		if n > bestN {
			bestLang, bestN = r.lang, n
		}
	}
	return bestLang
}

// detectType 粗分 frontend/backend/tool/docs/game。
func detectType(dir string) string {
	has := func(names ...string) bool {
		for _, n := range names {
			if _, err := os.Stat(filepath.Join(dir, n)); err == nil {
				return true
			}
		}
		return false
	}
	switch {
	case has("index.html"):
		return "frontend"
	case has("go.mod", "main.py", "app.py", "server.py"):
		return "backend"
	case has("Cargo.toml", "pom.xml"):
		return "app"
	default:
		return ""
	}
}

// fillAuto 计算并写入自动区字段。手写区字段不碰。
func fillAuto(p *meta.Project) {
	codeFiles, codeSizeKB := scanCodeFiles(p.Path)
	p.CodeFiles = codeFiles
	p.CodeSizeKB = codeSizeKB

	totalBytes := dirSize(p.Path)
	p.TotalSizeMB = round2(float64(totalBytes) / 1024 / 1024)

	p.LastActive = lastModified(p.Path)
	p.Created = createdTime(p.Path)

	p.Git = probeGit(p.Path)
	p.Deps = probeDeps(p.Path)
	p.DepsMissing = probeDepsMissing(p.Path)
	p.CoverRel = findCover(p.Path)
}

// scanCodeFiles 统计源码文件数与总 KB，跳过 excludeDirs。
// ponytail: 用扩展名白名单近似"源码"，不是精确 AST；新语言加一行 ext 列表即可。
var codeExts = map[string]bool{
	".go": true, ".py": true, ".js": true, ".mjs": true, ".ts": true,
	".tsx": true, ".jsx": true, ".html": true, ".css": true, ".scss": true,
	".rs": true, ".java": true, ".c": true, ".h": true, ".cpp": true, ".cc": true,
	".cs": true, ".rb": true, ".php": true, ".swift": true, ".kt": true,
	".vue": true, ".svelte": true, ".sql": true, ".sh": true, ".ps1": true,
}

func scanCodeFiles(dir string) (count int, sizeKB int) {
	_ = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return filepath.SkipDir
		}
		if d.IsDir() {
			if excludeDirs[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		if codeExts[strings.ToLower(filepath.Ext(d.Name()))] {
			count++
			if fi, e := d.Info(); e == nil {
				sizeKB += int(fi.Size() / 1024)
			}
		}
		return nil
	})
	return count, sizeKB
}

// dirSize 目录总字节数（含所有子树）。
func dirSize(dir string) int64 {
	var total int64
	_ = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return filepath.SkipDir
		}
		if !d.IsDir() {
			if fi, e := d.Info(); e == nil {
				total += fi.Size()
			}
		}
		return nil
	})
	return total
}

// metaFileNames 是扫描器/索引自身写的元数据文件，计算 last_active 时排除——
// 否则每次 scan 都会把"今天写的 .teaproject"当成最新活动日期，
// 导致所有项目 last_active 都被刷成今天，活跃时间线失真。
var metaFileNames = map[string]bool{
	".teaproject":      true,
	".tea-index.json":  true,
	"config.yaml":      true,
}

// lastModified 取目录内最新文件的修改日期，格式 YYYY-MM-DD。
// 排除 .teaproject 等元数据文件与 .git 内部文件。
func lastModified(dir string) string {
	var latest time.Time
	_ = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return filepath.SkipDir
		}
		if d.IsDir() {
			if excludeDirs[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		if metaFileNames[d.Name()] {
			return nil
		}
		if fi, e := d.Info(); e == nil {
			if fi.ModTime().After(latest) {
				latest = fi.ModTime()
			}
		}
		return nil
	})
	if latest.IsZero() {
		return ""
	}
	return latest.Format("2006-01-02")
}

// createdTime 取目录自身的创建时间（Windows 上 DirEntry 没有创建时间字段，
// 用目录 modtime 兜底；后续若要精确可转 syscall.Win32FileInformation）。
func createdTime(dir string) string {
	fi, err := os.Stat(dir)
	if err != nil {
		return ""
	}
	return fi.ModTime().Format("2006-01-02")
}

// probeGit 用 git CLI 探测：是否 repo / commit 数 / remote。
// git 不在 PATH 或非 repo 时静默返回 Repo=false，不报错。
func probeGit(dir string) *meta.GitInfo {
	gi := &meta.GitInfo{}
	if _, err := exec.LookPath("git"); err != nil {
		return gi
	}
	isRepo, err := runGit(dir, "rev-parse", "--is-inside-work-tree")
	if err != nil || strings.TrimSpace(isRepo) != "true" {
		return gi
	}
	gi.Repo = true

	// commit 数：git rev-list --count HEAD 比 log|wc 快且稳定。
	if out, err := runGit(dir, "rev-list", "--count", "HEAD"); err == nil {
		if n, err := strconv.Atoi(strings.TrimSpace(out)); err == nil {
			gi.Commits = n
		}
	}
	if out, err := runGit(dir, "remote", "get-url", "origin"); err == nil {
		gi.Remote = strings.TrimSpace(out)
	}
	// dirty: git status --porcelain 非空 = 有未提交改动
	if out, err := runGit(dir, "status", "--porcelain"); err == nil {
		gi.Dirty = strings.TrimSpace(out) != ""
	}
	// has_gitignore: 根目录存在 .gitignore
	if _, err := os.Stat(filepath.Join(dir, ".gitignore")); err == nil {
		gi.HasGitIgnore = true
	}
	return gi
}

func runGit(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.Output()
	return string(out), err
}

// probeDeps 检测依赖目录存在标记。
func probeDeps(dir string) []string {
	var deps []string
	for _, name := range []string{".venv", "node_modules", "vendor", ".gradle", "target"} {
		if fi, err := os.Stat(filepath.Join(dir, name)); err == nil && fi.IsDir() {
			deps = append(deps, name)
		}
	}
	return deps
}

// probeDepsMissing 检测"有声明文件但依赖目录缺失"：
//   - pyproject.toml/uv.lock 存在但 .venv 不存在 → 提示 ".venv"
//   - package.json 存在但 node_modules 不存在 → 提示 "node_modules"
func probeDepsMissing(dir string) []string {
	var missing []string
	hasFile := func(names ...string) bool {
		for _, n := range names {
			if _, err := os.Stat(filepath.Join(dir, n)); err == nil {
				return true
			}
		}
		return false
	}
	hasDir := func(name string) bool {
		fi, err := os.Stat(filepath.Join(dir, name))
		return err == nil && fi.IsDir()
	}
	if hasFile("pyproject.toml", "uv.lock", "requirements.txt", "setup.py") && !hasDir(".venv") {
		missing = append(missing, ".venv")
	}
	if hasFile("package.json") && !hasDir("node_modules") {
		missing = append(missing, "node_modules")
	}
	return missing
}

// findCover 找项目封面图：优先 cover/ 或 assets/images/，其次根目录；
// 取第一个 jpg/png/webp（按文件名排序）。返回相对项目目录的路径，无图返回空串。
func findCover(dir string) string {
	dirs := []string{"cover", filepath.Join("assets", "images"), ""}
	exts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}
	for _, sub := range dirs {
		d := filepath.Join(dir, sub)
		entries, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		var cands []string
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			if exts[strings.ToLower(filepath.Ext(e.Name()))] {
				cands = append(cands, e.Name())
			}
		}
		if len(cands) > 0 {
			sort.Strings(cands)
			rel := cands[0]
			if sub != "" {
				rel = filepath.Join(sub, rel)
			}
			return rel
		}
	}
	return ""
}

// Sort 排序：pinned 置顶 → order 升序 → 名称字典序。
func Sort(projects []*meta.Project) {
	sort.SliceStable(projects, func(i, j int) bool {
		a, b := projects[i], projects[j]
		if a.Pinned != b.Pinned {
			return a.Pinned // pinned=true 排前面
		}
		if a.Order != b.Order {
			return a.Order < b.Order
		}
		return strings.ToLower(a.Name) < strings.ToLower(b.Name)
	})
}

func round2(f float64) float64 {
	return float64(int(f*100+0.5)) / 100
}
