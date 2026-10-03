// Package exec 负责"打开项目"相关的外部命令调用。
//
// 安全模型（设计稿 §7）：
//   - 白名单程序：wt / cmd / code / explorer；不接受请求体里任意命令
//   - custom 动作只执行 .teaproject actions[] 里预先写死的 command
//   - 所有参数都来自本地路径或 git remote，不做 shell 拼接（用 exec.Command 分片传参）
package exec

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"

	"tea-pm/internal/meta"
)

// Open 按 action 拉起对应外部程序。
//   - custom 时 customActionName 必须命中 p.Actions 里的某条 name
//   - browser / github 需要 p.Git.Remote，无 remote 返回明确错误
func Open(p *meta.Project, action, customActionName string) error {
	switch action {
	case "terminal":
		return openTerminal(p.Path)
	case "vscode":
		return start("code", p.Path)
	case "explorer":
		// explorer.exe 是 GUI 程序，传路径直接打开文件夹
		return start("explorer", p.Path)
	case "browser", "github":
		url, err := gitHTTPURL(p)
		if err != nil {
			return err
		}
		return start("cmd", "/c", "start", "", url)
	case "custom":
		return openCustom(p, customActionName)
	default:
		return fmt.Errorf("未知 action: %q（允许 terminal/vscode/explorer/browser/github/custom）", action)
	}
}

// openTerminal 优先 wt（Windows Terminal），没有就退化到 cmd。
func openTerminal(dir string) error {
	if _, err := exec.LookPath("wt"); err == nil {
		// wt -d <dir>：在指定目录新开一个 tab
		return start("wt", "-d", dir)
	}
	// cmd /c start cmd /k "cd /d <dir> && cmd"
	return start("cmd", "/c", "start", "", "cmd", "/k", "cd /d", dir)
}

// openCustom 只执行 .teaproject 里预先定义的 action command。
// 命令用 cmd /c 跑（Windows 上 npm/test 这类脚本需要 shell 解析 PATH）。
func openCustom(p *meta.Project, name string) error {
	for _, a := range p.Actions {
		if a.Name != name {
			continue
		}
		if a.URL != "" {
			return start("cmd", "/c", "start", "", a.URL)
		}
		if a.Command == "" {
			return fmt.Errorf("action %q 既无 command 也无 url", name)
		}
		cmd := exec.Command("cmd", "/c", a.Command)
		cmd.Dir = p.Path
		return cmd.Start()
	}
	return fmt.Errorf("actions[] 里找不到名为 %q 的条目", name)
}

// gitHTTPURL 把 git remote（git@github.com:owner/repo.git 或 https://...）转成可打开的 https URL。
func gitHTTPURL(p *meta.Project) (string, error) {
	if p.Git == nil || p.Git.Remote == "" {
		return "", fmt.Errorf("该项目没有配置 git remote（无法打开浏览器/github）")
	}
	remote := p.Git.Remote
	// git@github.com:owner/repo.git → https://github.com/owner/repo
	if strings.HasPrefix(remote, "git@") {
		body := strings.TrimPrefix(remote, "git@")
		parts := strings.SplitN(body, ":", 2)
		if len(parts) == 2 {
			return "https://" + parts[0] + "/" + strings.TrimSuffix(parts[1], ".git"), nil
		}
	}
	return strings.TrimSuffix(remote, ".git"), nil
}

// start 用 exec.Command 拉起进程（不等待结束），并做白名单校验。
func start(name string, args ...string) error {
	allowed := map[string]bool{
		"wt": true, "cmd": true, "code": true, "explorer": true,
	}
	if !allowed[name] {
		return fmt.Errorf("拒绝执行未授权程序: %q", name)
	}
	// explorer 在 PATH 里其实是 explorer.exe；用 LookPath 兜底一下。
	if _, err := exec.LookPath(name); err != nil {
		// explorer 经常不在 PATH 但绝对路径存在
		if full, e := exec.LookPath(filepath.Join(`C:\Windows`, name+".exe")); e == nil {
			name = full
		} else {
			return fmt.Errorf("找不到可执行程序 %q：%w", name, err)
		}
	}
	cmd := exec.Command(name, args...)
	return cmd.Start()
}
