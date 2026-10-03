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
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"tea-pm/internal/cli18n"
	"tea-pm/internal/config"
	"tea-pm/internal/create"
	"tea-pm/internal/meta"
	"tea-pm/internal/scanner"
	"tea-pm/internal/server"
	"tea-pm/internal/tray"
)

// dict 是当前 CLI 文案字典（按 config.yaml 的 language 字段切换 zh/en/ja）。
// 包级变量：main() 启动时初始化，各子命令直接用。
var dict *cli18n.Dict

func main() {
	// 先按 config.yaml 的 language 字段选字典（不依赖 cfg.Language，兼容 A 未落地）。
	// 即便命令行参数还没解析，这里也要读 config 拿语言——失败就静默 fallback zh。
	if dir, err := config.Dir(); err == nil {
		lang := cli18n.ReadLangFromYAML(filepath.Join(dir, "config.yaml"))
		dict = cli18n.Load(lang)
	} else {
		dict = cli18n.Load("")
	}

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
	case "create":
		cmdCreate(args)
	case "-h", "--help", "help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "未知子命令: %s\n\n", cmd)
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Println(dict.UsageHeader)
	fmt.Println(dict.UsageServe)
	fmt.Println(dict.UsageList)
	fmt.Println(dict.UsageScan)
	fmt.Println(dict.UsageShow)
	fmt.Println(dict.UsageEdit)
	fmt.Println(dict.UsageOpen)
	fmt.Println(dict.UsageActions)
	fmt.Println(dict.UsageCreate)
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
	res, err := scanner.Scan(cfg.ProjectsRoot, write, cfg.ConfigExtensions)
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
	portFlag := fs.Int("port", 0, "覆盖 config.yaml 的端口（0=用配置值）")
	verbose := fs.Bool("verbose", false, "输出详细请求日志（含 query string）")
	trayFlag := fs.Bool("tray", false, "托盘常驻模式：隐藏控制台，由托盘菜单控制退出")
	fs.Parse(args)

	cfg := loadCfg()
	// 命令行 --port 优先级高于 config.yaml；改内存里的 cfg.Port，
	// 这样 GET /api/settings 返回的就是实际生效端口。
	if *portFlag > 0 {
		cfg.Port = *portFlag
	}
	srv, err := server.New(cfg, *verbose)
	if err != nil {
		fmt.Fprintln(os.Stderr, "初始化服务失败:", err)
		os.Exit(1)
	}
	exeDir, _ := config.Dir()
	webDir := filepath.Join(exeDir, "web")
	r := srv.Router(webDir)
	// 开机自启路由（独立文件，不改动 server.go）
	server.RegisterAutostartRoutes(r)
	// 新建项目端点（独立文件，不改动 server.go）
	server.RegisterCreateRoutes(r, cfg)

	addr := fmt.Sprintf("%s:%d", cfg.Bind, cfg.Port)
	url := fmt.Sprintf("http://%s/", addr)

	if *trayFlag {
		// 托盘常驻：隐藏控制台 → 后台 goroutine 启 HTTP → 主线程跑 Win32 消息循环
		tray.HideConsole()
		log.Printf("[托盘] 进入托盘模式，HTTP → %s (projects_root=%s)", url, cfg.ProjectsRoot)

		httpSrv := &http.Server{Addr: addr, Handler: r}
		go func() {
			if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("[错误] HTTP 服务异常退出: %v", err)
			}
		}()

		err := tray.Run(tray.Options{
			Title: "Tea PM — 项目管理器",
			OnOpenUI: func() {
				// cmd /c start 用默认浏览器打开；start 语法要求空 title 占位
				_ = exec.Command("cmd", "/c", "start", "", url).Start()
			},
			OnRescan: func() {
				// 跨包不便直接调 Server.rescan（未导出），用本地 HTTP 复用现成逻辑
				log.Printf("[托盘] 触发重新扫描 POST %sapi/scan", url)
				resp, err := http.Post(url+"api/scan", "application/json", nil)
				if err != nil {
					log.Printf("[托盘] 重新扫描失败: %v", err)
					return
				}
				resp.Body.Close()
			},
			OnExit: func() {
				// 优雅关 HTTP：最多等 5s，避免 SSE /runs/.../stream 长连接挂住退出
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := httpSrv.Shutdown(ctx); err != nil {
					log.Printf("[托盘] HTTP 关闭超时/出错: %v", err)
				}
				log.Printf("[托盘] HTTP 已关闭")
			},
		})
		if err != nil {
			log.Printf("[托盘] 启动失败: %v", err)
			os.Exit(1)
		}
		return
	}

	fmt.Printf("tea serve → %s  (projects_root=%s)\n", url, cfg.ProjectsRoot)
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

	fmt.Printf("%-30s %-12s %-8s %-10s %s\n", dict.TblName, dict.TblLang, dict.TblStatus, dict.TblSizeMB, dict.TblLastActive)
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
	mode := dict.ScanDryRun
	if *write {
		mode = dict.ScanWrite
	}
	fmt.Printf("%s [%s]\n", fmt.Sprintf(dict.ScanDoneTpl, len(projects)), mode)
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

// ---- tea create <name> ----

func cmdCreate(args []string) {
	// 手动解析 flags：Go flag 包在第一个位置参数后停止解析，
	// 而用户习惯 `tea create <name> --type web`，所以这里自己拆。
	var name, typ, desc string
	typ = "empty"
	noReadme := false
	var positional []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "--type" || a == "-type":
			i++
			if i < len(args) {
				typ = args[i]
			}
		case strings.HasPrefix(a, "--type="):
			typ = strings.TrimPrefix(a, "--type=")
		case a == "--desc" || a == "-desc":
			i++
			if i < len(args) {
				desc = args[i]
			}
		case strings.HasPrefix(a, "--desc="):
			desc = strings.TrimPrefix(a, "--desc=")
		case a == "--no-readme" || a == "-no-readme":
			noReadme = true
		default:
			positional = append(positional, a)
		}
	}

	if len(positional) < 1 {
		fmt.Fprintln(os.Stderr, dict.ErrNameEmpty)
		os.Exit(1)
	}
	name = positional[0]
	// R6-2: 多余位置参数（如 `tea create X web`）必须报错而非静默忽略，
	// 否则用户以为 type=web 实际落盘 empty。
	if len(positional) > 1 {
		fmt.Fprintf(os.Stderr, "多余参数：%s\n用法: tea create <name> [--type empty|web|python] [--desc ...] [--no-readme]\n",
			strings.Join(positional[1:], " "))
		os.Exit(1)
	}

	cfg := loadCfg()
	path, err := create.CreateProject(cfg.ProjectsRoot, name, typ, desc, !noReadme)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	fmt.Printf(dict.CreatedTpl+"\n", path)
}

func trunc(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}
