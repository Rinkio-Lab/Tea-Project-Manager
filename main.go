// tea 是 Tea PM 2.0 的单二进制入口。
//
// 子命令（与设计稿 §1 对齐，标准库 flag 实现，不引 cobra）：
//
//	tea serve              启动 Web UI（gin 服务 + web/ 静态挂载）
//	tea list               列出所有项目
//	tea scan [--write]     全量扫描（默认 dry-run，--write 才落盘 .teaproject）
//	tea show <name>         单项目详情
//	tea edit <name>         用系统默认编辑器打开 .teaproject
//	tea open <name>         在资源管理器里打开项目目录
//	tea actions <name>      列出项目自定义 actions
package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"tea-pm/internal/config"
	"tea-pm/internal/meta"
	"tea-pm/internal/scanner"
	"tea-pm/internal/server"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}
	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "serve":
		cmdServe(args)
	case "list":
		cmdList(args)
	case "scan":
		cmdScan(args)
	case "show":
		cmdShow(args)
	case "edit":
		cmdEdit(args)
	case "open":
		cmdOpen(args)
	case "actions":
		cmdActions(args)
	case "-h", "--help", "help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "未知子命令: %s\n\n", cmd)
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Print(`tea — Tea Project Manager 2.0

用法:
  tea serve              启动 Web UI（默认 127.0.0.1:8080）
  tea list               列出所有项目
  tea scan [--write]     全量扫描（默认只读预览，--write 才写 .teaproject）
  tea show <name>        显示单项目详情
  tea edit <name>        用系统默认编辑器打开 .teaproject
  tea open <name>        在资源管理器打开项目目录
  tea actions <name>     列出项目自定义 actions
`)
}

// loadCfg 读 config.yaml（首次运行自动写默认值）。
func loadCfg() *config.Config {
	dir, err := config.Dir()
	if err != nil {
		fmt.Fprintln(os.Stderr, "定位 exe 目录失败:", err)
		os.Exit(1)
	}
	cfg, err := config.Load(filepath.Join(dir, "config.yaml"))
	if err != nil {
		fmt.Fprintln(os.Stderr, "读 config.yaml 失败:", err)
		os.Exit(1)
	}
	return cfg
}

// scanOnce 是 CLI 各子命令共用的"扫一次拿项目列表"辅助。
func scanOnce(cfg *config.Config, write bool) []*meta.Project {
	res, err := scanner.Scan(cfg.ProjectsRoot, write)
	if err != nil {
		fmt.Fprintln(os.Stderr, "扫描失败:", err)
		os.Exit(1)
	}
	// 合并旧索引的 order
	old, _ := meta.LoadIndex(cfg.ProjectsRoot)
	orderMap := map[string]int{}
	for _, p := range old.Projects {
		orderMap[p.RelPath] = p.Order
	}
	for _, p := range res.Projects {
		p.Order = orderMap[p.RelPath]
	}
	scanner.Sort(res.Projects)
	_ = meta.SaveIndex(cfg.ProjectsRoot, &meta.Index{Projects: res.Projects})
	return res.Projects
}

// ---- tea serve ----

func cmdServe(args []string) {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	fs.Parse(args)

	cfg := loadCfg()
	srv, err := server.New(cfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, "初始化服务失败:", err)
		os.Exit(1)
	}
	exeDir, _ := config.Dir()
	webDir := filepath.Join(exeDir, "web")
	r := srv.Router(webDir)

	addr := fmt.Sprintf("%s:%d", cfg.Bind, cfg.Port)
	fmt.Printf("tea serve → http://%s/  (projects_root=%s)\n", addr, cfg.ProjectsRoot)
	if err := r.Run(addr); err != nil {
		fmt.Fprintln(os.Stderr, "服务启动失败:", err)
		os.Exit(1)
	}
}

// ---- tea list ----

func cmdList(args []string) {
	fs := flag.NewFlagSet("list", flag.ExitOnError)
	fs.Parse(args)
	cfg := loadCfg()
	projects := scanOnce(cfg, false)

	fmt.Printf("%-30s %-12s %-8s %-10s %s\n", "NAME", "LANG", "STATUS", "SIZE_MB", "LAST_ACTIVE")
	fmt.Println("--------------------------------------------------------------------------------------------")
	for _, p := range projects {
		fmt.Printf("%-30s %-12s %-8s %-10.1f %s\n",
			trunc(p.Name, 30), p.Language, p.Status, p.TotalSizeMB, p.LastActive)
	}
	fmt.Printf("\n共 %d 个项目\n", len(projects))
}

// ---- tea scan ----

func cmdScan(args []string) {
	fs := flag.NewFlagSet("scan", flag.ExitOnError)
	write := fs.Bool("write", false, "实际写入 .teaproject（默认 dry-run 只读）")
	fs.Parse(args)

	cfg := loadCfg()
	projects := scanOnce(cfg, *write)
	mode := "dry-run（只读）"
	if *write {
		mode = "write（已落盘）"
	}
	fmt.Printf("扫描完成 [%s]：%d 个项目\n", mode, len(projects))
	for _, p := range projects {
		mark := ""
		if p.AI {
			mark = " [ai]"
		}
		fmt.Printf("  - %s (%s)%s\n", p.Name, p.RelPath, mark)
	}
}

// ---- tea show <name> ----

func cmdShow(args []string) {
	fs := flag.NewFlagSet("show", flag.ExitOnError)
	fs.Parse(args)
	if fs.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "用法: tea show <name>")
		os.Exit(1)
	}
	name := fs.Arg(0)
	cfg := loadCfg()
	projects := scanOnce(cfg, false)
	for _, p := range projects {
		if p.Name == name || p.RelPath == name || filepath.Base(p.RelPath) == name {
			printProject(p)
			return
		}
	}
	fmt.Fprintf(os.Stderr, "找不到项目: %s\n", name)
	os.Exit(1)
}

func printProject(p *meta.Project) {
	fmt.Printf("名称:    %s\n", p.Name)
	fmt.Printf("路径:    %s\n", p.Path)
	fmt.Printf("类型:    %s  分类: %s  状态: %s\n", p.Type, p.Category, p.Status)
	fmt.Printf("语言:    %s  技术栈: %v\n", p.Language, p.TechStack)
	fmt.Printf("描述:    %s\n", p.Description)
	fmt.Printf("意图:    %s\n", p.Intent)
	fmt.Printf("标签:    %v\n", p.Tags)
	fmt.Printf("活跃:    %s   创建: %s\n", p.LastActive, p.Created)
	fmt.Printf("代码:    %d 文件 / %d KB   总大小: %.1f MB\n", p.CodeFiles, p.CodeSizeKB, p.TotalSizeMB)
	if p.Git != nil && p.Git.Repo {
		fmt.Printf("Git:     %d commits  remote=%s\n", p.Git.Commits, p.Git.Remote)
	}
	fmt.Printf("依赖:    %v\n", p.Deps)
	if p.AI {
		fmt.Printf("[ai] 手写区是推断值，待用户采纳\n")
	}
}

// ---- tea edit <name> ----

func cmdEdit(args []string) {
	fs := flag.NewFlagSet("edit", flag.ExitOnError)
	fs.Parse(args)
	if fs.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "用法: tea edit <name>")
		os.Exit(1)
	}
	name := fs.Arg(0)
	cfg := loadCfg()
	projects := scanOnce(cfg, false)
	for _, p := range projects {
		if p.Name == name || p.RelPath == name || filepath.Base(p.RelPath) == name {
			yamlPath := p.YamlPath()
			if !p.HasYaml() {
				// 无配置：先落盘一份推断配置再打开
				if err := meta.SaveYaml(p); err != nil {
					fmt.Fprintln(os.Stderr, "生成 .teaproject 失败:", err)
					os.Exit(1)
				}
			}
			// 用 cmd /c start 调系统默认程序打开 yaml
			cmd := exec.Command("cmd", "/c", "start", "", yamlPath)
			if err := cmd.Start(); err != nil {
				fmt.Fprintln(os.Stderr, "打开编辑器失败:", err)
				os.Exit(1)
			}
			fmt.Printf("已在默认编辑器打开: %s\n", yamlPath)
			return
		}
	}
	fmt.Fprintf(os.Stderr, "找不到项目: %s\n", name)
	os.Exit(1)
}

// ---- tea open <name> ----

func cmdOpen(args []string) {
	fs := flag.NewFlagSet("open", flag.ExitOnError)
	fs.Parse(args)
	if fs.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "用法: tea open <name>")
		os.Exit(1)
	}
	name := fs.Arg(0)
	cfg := loadCfg()
	projects := scanOnce(cfg, false)
	for _, p := range projects {
		if p.Name == name || p.RelPath == name || filepath.Base(p.RelPath) == name {
			cmd := exec.Command("explorer", p.Path)
			if err := cmd.Start(); err != nil {
				fmt.Fprintln(os.Stderr, "打开资源管理器失败:", err)
				os.Exit(1)
			}
			fmt.Printf("已在资源管理器打开: %s\n", p.Path)
			return
		}
	}
	fmt.Fprintf(os.Stderr, "找不到项目: %s\n", name)
	os.Exit(1)
}

// ---- tea actions <name> ----

func cmdActions(args []string) {
	fs := flag.NewFlagSet("actions", flag.ExitOnError)
	fs.Parse(args)
	if fs.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "用法: tea actions <name>")
		os.Exit(1)
	}
	name := fs.Arg(0)
	cfg := loadCfg()
	projects := scanOnce(cfg, false)
	for _, p := range projects {
		if p.Name == name || p.RelPath == name || filepath.Base(p.RelPath) == name {
			if len(p.Actions) == 0 {
				fmt.Println("（该项目未定义自定义 actions）")
				return
			}
			for _, a := range p.Actions {
				if a.Command != "" {
					fmt.Printf("  - %s  →  %s\n", a.Name, a.Command)
				} else if a.URL != "" {
					fmt.Printf("  - %s  →  %s\n", a.Name, a.URL)
				}
			}
			return
		}
	}
	fmt.Fprintf(os.Stderr, "找不到项目: %s\n", name)
	os.Exit(1)
}

func trunc(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}
