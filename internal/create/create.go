// Package create 负责在 projects_root 下新建项目目录并写入 .teaproject。
//
// 设计要点：
//   - 已存在不覆盖（fail fast）
//   - 模板内嵌在本包字符串常量里（web 三件套 / python 回退模板）
//   - python 优先用 `uv init`（若 PATH 可用）；否则落最小模板
//   - 写完 .teaproject 只填手写区（name/type/description），自动区留空由 scan 填充
package create

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"tea-pm/internal/meta"
)

// Templates 返回的文件清单（仅供测试/文档，不参与运行时）。
// 当前模板：
//   web:     index.html, styles.css, script.js, .teaproject, README.md
//   python:  uv init 产出（或 main.py + .gitignore）, .teaproject, README.md
//   empty:   .teaproject, README.md（除非 withReadme=false）
const docTemplateNote = "templates embedded as string constants; see below"

// CreateProject 在 projectsRoot 下建 <name> 目录并落 .teaproject。
//
//	typ:        "empty" | "web" | "python"（其他值报错）
//	desc:       描述，可为空字符串
//	withReadme: 是否生成 README.md
//
// 返回新建目录的绝对路径。
func CreateProject(projectsRoot, name, typ, desc string, withReadme bool) (string, error) {
	if strings.TrimSpace(name) == "" {
		return "", fmt.Errorf("名称不能为空")
	}
	if strings.ContainsAny(name, `/\`) || name == "." || name == ".." || strings.Contains(name, "..") {
		return "", fmt.Errorf("名称含路径分隔符或 ..: %q", name)
	}
	switch typ {
	case "", "empty", "web", "python":
	default:
		return "", fmt.Errorf("非法 --type %q，可选 empty/web/python", typ)
	}
	if typ == "" {
		typ = "empty"
	}

	dir := filepath.Join(projectsRoot, name)
	// 已存在 → 报错不覆盖（即便里面只是空目录）
	if st, err := os.Stat(dir); err == nil {
		if !st.IsDir() {
			return "", fmt.Errorf("%s 已存在且不是目录", dir)
		}
		return "", fmt.Errorf("目录已存在，未覆盖: %s", dir)
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("检查目录失败: %w", err)
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("建目录失败: %w", err)
	}

	// 按类型落模板
	switch typ {
	case "web":
		if err := writeWebTemplates(dir); err != nil {
			return "", err
		}
	case "python":
		if err := writePythonTemplate(dir, name); err != nil {
			return "", err
		}
	}

	// 写 .teaproject（只填手写区；自动区留空由 scan 填）
	p := &meta.Project{
		Name:        name,
		Path:        dir,
		Type:        typ,
		Description: desc,
	}
	p.ConfigFile = filepath.Join(dir, meta.FileName)
	if err := meta.SaveYaml(p); err != nil {
		return "", fmt.Errorf("写 .teaproject 失败: %w", err)
	}

	if withReadme {
		readme := buildReadme(name, desc)
		if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte(readme), 0o644); err != nil {
			return "", fmt.Errorf("写 README.md 失败: %w", err)
		}
	}

	abs, _ := filepath.Abs(dir)
	return abs, nil
}

// ---- web 模板 ----

const webIndexHTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>%s</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app"></div>
  <script src="script.js"></script>
</body>
</html>
`

const webStylesCSS = `:root { color-scheme: light dark; }
body { margin: 0; font-family: system-ui, sans-serif; }
#app { padding: 2rem; }
`

const webScriptJS = `// 入口
document.getElementById('app').textContent = 'hello from %s';
`

func writeWebTemplates(dir string) error {
	if err := os.WriteFile(filepath.Join(dir, "index.html"),
		[]byte(fmt.Sprintf(webIndexHTML, "project")), 0o644); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "styles.css"),
		[]byte(webStylesCSS), 0o644); err != nil {
		return err
	}
	// script.js 里不嵌入项目名（避免改名字后不同步），留占位
	if err := os.WriteFile(filepath.Join(dir, "script.js"),
		[]byte(fmt.Sprintf(webScriptJS, "app")), 0o644); err != nil {
		return err
	}
	return nil
}

// ---- python 模板 ----

const pyMain = `# 入口
def main():
    print("hello from %s")

if __name__ == "__main__":
    main()
`

const pyGitignore = `__pycache__/
.venv/
*.pyc
`

// writePythonTemplate 优先 uv init；不可用则落最小模板。
func writePythonTemplate(dir, name string) error {
	if uvPath, err := exec.LookPath("uv"); err == nil {
		// uv init 在已有目录里跑，--name 指定项目名
		cmd := exec.Command(uvPath, "init", "--name", name)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err == nil {
			// uv init 成功：落一个 .gitignore 兜底（uv 自带的可能不全）
			_ = os.WriteFile(filepath.Join(dir, ".gitignore"), []byte(pyGitignore), 0o644)
			return nil
		} else {
			// uv init 失败 → 回退到最小模板，不把错误抛给上层
			_ = out
		}
	}
	// 回退：最小模板
	if err := os.WriteFile(filepath.Join(dir, "main.py"),
		[]byte(fmt.Sprintf(pyMain, name)), 0o644); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, ".gitignore"),
		[]byte(pyGitignore), 0o644); err != nil {
		return err
	}
	return nil
}

// ---- README ----

func buildReadme(name, desc string) string {
	var b strings.Builder
	b.WriteString("# " + name + "\n\n")
	if desc != "" {
		b.WriteString(desc + "\n")
	} else {
		// 占位短句，反 AI 味
		b.WriteString("新建的项目。\n")
	}
	// Windows 上 git 的换行偏好 CRLF，但 Go 写 LF 也能跑；统一 LF。
	_ = runtime.GOOS
	return b.String()
}
