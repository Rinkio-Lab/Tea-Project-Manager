// Package server 是 gin HTTP 服务：REST API + web/ 静态资源挂载。
//
// 内存里持有一份"项目列表"快照（[]*meta.Project），由 scan 重建；
// PUT / POST open 等写操作只改这一份 + 对应磁盘文件。
package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	osexec "os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"tea-pm/internal/config"
	"tea-pm/internal/exec"
	"tea-pm/internal/meta"
	"tea-pm/internal/scanner"
)

// Server 持有运行期状态。mu 保护 projects 并发读写（gin 多 handler goroutine）。
type Server struct {
	cfg      *config.Config
	verbose  bool
	mu       sync.RWMutex
	projects []*meta.Project // 内存快照，已按 order 排序
}

// New 构造 Server 并立即做一次启动扫描（dry-run），把自动区刷新到最新。
// 索引里的 order 号会被保留合并进新扫描结果。verbose 控制请求日志详细度。
func New(cfg *config.Config, verbose bool) (*Server, error) {
	s := &Server{cfg: cfg, verbose: verbose}
	log.Printf("[启动] 扫描项目根 %s ...", cfg.ProjectsRoot)
	if err := s.rescan(false); err != nil {
		log.Printf("[错误] 启动扫描失败: %v", err)
		return nil, err
	}
	log.Printf("[启动] 完成，共 %d 个项目，工作区数=%d", len(s.projects), len(cfg.Workspaces))
	return s, nil
}

// rescan 跑一次扫描，把旧索引里的 order 合并进新结果，写回索引。
func (s *Server) rescan(write bool) error {
	// 先读旧索引，建 relPath → order 的映射
	oldIdx, err := meta.LoadIndex(s.cfg.ProjectsRoot)
	if err != nil {
		return err
	}
	orderMap := map[string]int{}
	pinnedMap := map[string]bool{}
	for _, p := range oldIdx.Projects {
		orderMap[p.RelPath] = p.Order
		pinnedMap[p.RelPath] = p.Pinned
	}

	res, err := scanner.Scan(s.cfg.ProjectsRoot, write, s.cfg.ConfigExtensions)
	if err != nil {
		return err
	}
	for _, p := range res.Projects {
		p.Order = orderMap[p.RelPath]
		p.Pinned = pinnedMap[p.RelPath]
	}
	scanner.Sort(res.Projects)

	s.mu.Lock()
	s.projects = res.Projects
	s.mu.Unlock()

	// 重建索引落盘
	return meta.SaveIndex(s.cfg.ProjectsRoot, &meta.Index{Projects: res.Projects})
}

// Router 构造 gin 引擎并注册全部路由。
func (s *Server) Router(webDir string) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(s.requestLogger)

	api := r.Group("/api")
	{
		api.GET("/projects", s.listProjects)
		api.GET("/projects/:name", s.getProject)
		api.PUT("/projects/:name", s.putProject)
		api.DELETE("/projects/:name", s.deleteProject)
		api.POST("/projects/:name/open", s.openProject)
		api.POST("/projects/:name/archive", s.archiveProject)
		api.POST("/projects/:name/restore", s.restoreProject)
		api.GET("/projects/:name/cover", s.getCover)
		api.POST("/projects/:name/run", s.runCommand)
		api.GET("/runs/:run_id/stream", s.streamRun)
		api.POST("/runs/:run_id/terminate", s.terminateRun)
		api.POST("/scan", s.postScan)
		api.GET("/stats", s.stats)
		api.GET("/export", s.export)
		api.GET("/backups", s.listBackups)
		api.POST("/backups/restore", s.restoreBackup)
		api.GET("/settings", s.getSettings)
		api.PUT("/settings", s.putSettings)
	}

	// 静态资源：web/ 挂载到根路径。gin.Static("/") 会注册 /*filepath catch-all，
	// 和 /api 前缀冲突，所以用 NoRoute + 标准库 FileServer 兜底。
	// web/ 目录不存在也不崩（并行子任务还在产出时）。
	if fi, err := os.Stat(webDir); err == nil && fi.IsDir() {
		fs := http.FileServer(http.Dir(webDir))
		r.NoRoute(func(c *gin.Context) {
			// /api/* 未命中时返回 JSON 404，不要落到静态文件兜底
			if strings.HasPrefix(c.Request.URL.Path, "/api/") {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found: " + c.Request.URL.Path})
				return
			}
			fs.ServeHTTP(c.Writer, c.Request)
		})
	}
	return r
}

// requestLogger 是极简请求日志中间件：默认一行概要；--verbose 含 query/大小。
func (s *Server) requestLogger(c *gin.Context) {
	start := time.Now()
	c.Next()
	elapsed := time.Since(start)
	path := c.Request.URL.Path
	if s.verbose && c.Request.URL.RawQuery != "" {
		path += "?" + c.Request.URL.RawQuery
	}
	log.Printf("[HTTP] %s %s -> %d (%s)", c.Request.Method, path, c.Writer.Status(), elapsed)
}

// findByRel 在内存快照里按 relPath（或其 base 名）找项目。
// URL 里的反斜杠统一替换成正斜杠再比较。
func (s *Server) findByRel(rel string) *meta.Project {
	rel = strings.ReplaceAll(rel, "\\", "/")
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.projects {
		pr := strings.ReplaceAll(p.RelPath, "\\", "/")
		if pr == rel {
			return p
		}
	}
	// 退化：按 base 名匹配（顶层项目常见情况）
	base := filepath.Base(rel)
	for _, p := range s.projects {
		if filepath.Base(p.RelPath) == base {
			return p
		}
	}
	return nil
}

// ---- GET /api/projects ----

func (s *Server) listProjects(c *gin.Context) {
	q := strings.ToLower(c.Query("q"))
	lang := c.Query("lang")
	status := c.Query("status")
	cat := c.Query("cat")
	archived := c.DefaultQuery("archived", "0")
	sortBy := c.DefaultQuery("sort", "order")
	month := c.Query("month") // YYYY-MM，按 last_active 前缀过滤

	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]*meta.Project, 0, len(s.projects))
	for _, p := range s.projects {
		if archived == "0" && p.Archived {
			continue
		}
		if archived == "1" && !p.Archived {
			continue
		}
		if lang != "" && p.Language != lang {
			continue
		}
		if status != "" && p.Status != status {
			continue
		}
		if cat != "" && p.Category != cat {
			continue
		}
		if q != "" && !matchesQuery(p, q) {
			continue
		}
		if month != "" && !strings.HasPrefix(p.LastActive, month) {
			continue
		}
		out = append(out, p)
	}

	switch sortBy {
	case "name":
		sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	case "last_active":
		sort.SliceStable(out, func(i, j int) bool { return out[i].LastActive > out[j].LastActive })
	case "size":
		sort.SliceStable(out, func(i, j int) bool { return out[i].TotalSizeMB > out[j].TotalSizeMB })
	case "status":
		sort.SliceStable(out, func(i, j int) bool { return out[i].Status < out[j].Status })
	}
	s.fillWorkspaces(out)
	s.fillDerived(out)
	c.JSON(http.StatusOK, out)
}

// fillDerived 填充 health_score/stale/resource_type 等运行期派生字段。
func (s *Server) fillDerived(projects []*meta.Project) {
	now := time.Now()
	staleMonths := s.cfg.StaleMonths
	if staleMonths == 0 {
		staleMonths = 6
	}
	for _, p := range projects {
		// stale: last_active 早于 now - stale_months
		p.Stale = false
		if p.LastActive != "" {
			if t, err := time.Parse("2006-01-02", p.LastActive); err == nil {
				cutoff := now.AddDate(0, -staleMonths, 0)
				p.Stale = t.Before(cutoff)
			}
		}
		// resource_type: size>min 且 code_files<max
		p.ResourceType = p.TotalSizeMB > s.cfg.ResourceMinMB && p.CodeFiles < s.cfg.ResourceMaxCodeFiles
		// health_score
		p.HealthScore = calcHealthScore(p, now)
	}
}

// calcHealthScore 0-100：活跃度40 + 代码量25 + git健康35。
func calcHealthScore(p *meta.Project, now time.Time) int {
	// 活跃度
	activeScore := 6
	if p.LastActive != "" {
		if t, err := time.Parse("2006-01-02", p.LastActive); err == nil {
			days := int(now.Sub(t).Hours() / 24)
			switch {
			case days <= 30:
				activeScore = 40
			case days <= 90:
				activeScore = 32
			case days <= 180:
				activeScore = 24
			case days <= 365:
				activeScore = 14
			}
		}
	}
	// 代码量
	sizeScore := 0
	switch {
	case p.CodeFiles >= 100:
		sizeScore = 25
	case p.CodeFiles >= 30:
		sizeScore = 20
	case p.CodeFiles >= 5:
		sizeScore = 12
	case p.CodeFiles >= 1:
		sizeScore = 6
	}
	// git 健康
	gitScore := 2
	if p.Git != nil && p.Git.Repo {
		switch {
		case !p.Git.Dirty && p.Git.HasGitIgnore && p.Git.Commits > 0:
			gitScore = 35
		case !p.Git.Dirty:
			gitScore = 28
		case p.Git.Dirty:
			gitScore = 8
		default:
			gitScore = 18
		}
	} else if p.CodeFiles > 0 {
		gitScore = 10
	}
	total := activeScore + sizeScore + gitScore
	if total > 100 {
		total = 100
	}
	return total
}

// fillWorkspaces 按 config.workspaces 顺序给项目填 workspace_name/color。
// 规则：name 精确匹配（大小写不敏感）或 path 以前缀命中（大小写不敏感），先到先得。
// 无匹配则两字段为空字符串。
func (s *Server) fillWorkspaces(projects []*meta.Project) {
	for _, p := range projects {
		p.WorkspaceName = ""
		p.WorkspaceColor = ""
		pPath := strings.ToLower(p.Path)
		for _, ws := range s.cfg.Workspaces {
			hit := false
			for _, n := range ws.Projects {
				if strings.EqualFold(p.Name, n) {
					hit = true
					break
				}
			}
			if !hit {
				for _, prefix := range ws.Paths {
					if strings.HasPrefix(pPath, strings.ToLower(prefix)) {
						hit = true
						break
					}
				}
			}
			if hit {
				p.WorkspaceName = ws.Name
				p.WorkspaceColor = ws.Color
				break
			}
		}
	}
}

// matchesQuery 模糊匹配名称/描述/标签/意图。
func matchesQuery(p *meta.Project, q string) bool {
	hay := strings.ToLower(strings.Join([]string{
		p.Name, p.Description, p.Intent, p.Category,
		strings.Join(p.Tags, " "),
	}, " "))
	return strings.Contains(hay, q)
}

// ---- GET /api/projects/:name ----

func (s *Server) getProject(c *gin.Context) {
	rel := strings.TrimPrefix(c.Param("name"), "/")
	p := s.findByRel(rel)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "项目不存在: " + rel})
		return
	}
	s.fillWorkspaces([]*meta.Project{p})
	s.fillDerived([]*meta.Project{p})
	c.JSON(http.StatusOK, p)
}

// ---- PUT /api/projects/:name ----

// putPayload 是 PUT 的请求体。只允许更新白名单字段；其他字段忽略。
type putPayload struct {
	Name        *string   `json:"name"`
	Description *string   `json:"description"`
	Intent      *string   `json:"intent"`
	Notes       *string   `json:"notes"`
	Type        *string   `json:"type"`
	Category    *string   `json:"category"`
	Status      *string   `json:"status"`
	Quality     *string   `json:"quality"`
	Tags        *[]string `json:"tags"`
	Language    *string   `json:"language"`
	TechStack   *[]string `json:"tech_stack"`
	Actions     *[]meta.Action `json:"actions"`
	Commands    *[]meta.Command `json:"commands"`
	Order       *int      `json:"order"`
	Pinned      *bool     `json:"pinned"`
	AI          *bool     `json:"ai"`
}

func (s *Server) putProject(c *gin.Context) {
	rel := strings.TrimPrefix(c.Param("name"), "/")
	p := s.findByRel(rel)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "项目不存在: " + rel})
		return
	}

	var body putPayload
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体不是合法 JSON: " + err.Error()})
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// 应用白名单字段
	if body.Name != nil {
		p.Name = *body.Name // name 只改显示名，path 以磁盘为准
	}
	if body.Description != nil {
		p.Description = *body.Description
	}
	if body.Intent != nil {
		p.Intent = *body.Intent
	}
	if body.Notes != nil {
		p.Notes = *body.Notes
	}
	if body.Type != nil {
		p.Type = *body.Type
	}
	if body.Category != nil {
		p.Category = *body.Category
	}
	if body.Status != nil {
		p.Status = *body.Status
	}
	if body.Quality != nil {
		p.Quality = *body.Quality
	}
	if body.Tags != nil {
		p.Tags = *body.Tags
	}
	if body.Language != nil {
		p.Language = *body.Language
	}
	if body.TechStack != nil {
		p.TechStack = *body.TechStack
	}
	if body.Actions != nil {
		p.Actions = *body.Actions
	}
	if body.Commands != nil {
		p.Commands = *body.Commands
	}
	// ai 字段显式布尔：ai:true 写回，ai:false 清除（yaml omitempty 省略），缺省不动
	if body.AI != nil {
		p.AI = *body.AI
	}
	// order 只写索引，绝不进 YAML
	if body.Order != nil {
		p.Order = *body.Order
	}
	// pinned 只写索引，不进 YAML
	if body.Pinned != nil {
		p.Pinned = *body.Pinned
	}

	// 写前自动备份当前 YAML（#10 配置快照）
	s.backupCurrent(p)
	// 写回 .teaproject。若项目之前是推断条目（无 yaml），这里首次落盘。
	if err := meta.SaveYaml(p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "写 .teaproject 失败: " + err.Error()})
		return
	}
	// 同步重建索引（order 可能变了）
	_ = meta.SaveIndex(s.cfg.ProjectsRoot, &meta.Index{Projects: s.projects})

	c.JSON(http.StatusOK, p)
}

// ---- POST /api/scan ----

func (s *Server) postScan(c *gin.Context) {
	write := c.Query("write") == "1"
	mode := "dry-run"
	if write {
		mode = "write"
	}
	log.Printf("[扫描] 开始 (%s)", mode)
	start := time.Now()
	if err := s.rescan(write); err != nil {
		log.Printf("[错误] 扫描失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[扫描] 完成，共 %d 个项目，耗时 %s", len(s.projects), time.Since(start))
	s.mu.RLock()
	defer s.mu.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"write":    write,
		"count":    len(s.projects),
		"projects": s.projects,
	})
}

// ---- GET /api/stats ----

func (s *Server) stats(c *gin.Context) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	total := len(s.projects)
	langCount := map[string]int{}
	statusDist := map[string]int{}
	var totalMB float64
	resourceCount := 0
	// active_timeline: "2026-09" → [项目名...]
	timeline := map[string][]string{}

	for _, p := range s.projects {
		if p.Language != "" {
			langCount[p.Language]++
		}
		st := p.Status
		if st == "" {
			st = "未设置"
		}
		statusDist[st]++
		totalMB += p.TotalSizeMB
		if p.TotalSizeMB > s.cfg.ResourceMinMB && p.CodeFiles < s.cfg.ResourceMaxCodeFiles {
			resourceCount++
		}
		if len(p.LastActive) >= 7 {
			month := p.LastActive[:7] // YYYY-MM
			timeline[month] = append(timeline[month], p.Name)
		}
	}

	months := make([]string, 0, len(timeline))
	for m := range timeline {
		months = append(months, m)
	}
	sort.Strings(months)
	timelineArr := []gin.H{}
	for _, m := range months {
		timelineArr = append(timelineArr, gin.H{"month": m, "projects": timeline[m]})
	}

	c.JSON(http.StatusOK, gin.H{
		"total":              total,
		"language_count":     langCount,
		"status_distribution": statusDist,
		"total_size_mb":      float64(int(totalMB*100+0.5)) / 100,
		"active_timeline":    timelineArr,
		"resource_count":     resourceCount,
	})
}

// ---- POST /api/projects/:name/open ----

type openReq struct {
	Action         string `json:"action"`
	ActionName     string `json:"action_name"`
}

func (s *Server) openProject(c *gin.Context) {
	rel := strings.TrimPrefix(c.Param("name"), "/")
	p := s.findByRel(rel)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "项目不存在: " + rel})
		return
	}
	var body openReq
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体不是合法 JSON: " + err.Error()})
		return
	}
	if err := exec.Open(p, body.Action, body.ActionName); err != nil {
		log.Printf("[操作] open %s action=%s 失败: %v", p.Name, body.Action, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[操作] open %s action=%s 成功", p.Name, body.Action)
	c.JSON(http.StatusOK, gin.H{"ok": true, "action": body.Action})
}

// ---- POST /api/projects/:name/archive ----

func (s *Server) archiveProject(c *gin.Context) {
	rel := strings.TrimPrefix(c.Param("name"), "/")
	p := s.findByRel(rel)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "项目不存在: " + rel})
		return
	}
	// 已在 _archive 下 → 400
	if p.Archived {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该项目已在 _archive 下"})
		return
	}

	archiveDir := filepath.Join(s.cfg.ProjectsRoot, "_archive")
	if err := os.MkdirAll(archiveDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	dest := filepath.Join(archiveDir, filepath.Base(p.Path))
	if _, err := os.Stat(dest); err == nil {
		// 目标已存在：加时间戳后缀
		dest = filepath.Join(archiveDir,
			fmt.Sprintf("%s_%s", filepath.Base(p.Path), time.Now().Format("20060102-150405")))
	}
	if err := os.Rename(p.Path, dest); err != nil {
		log.Printf("[操作] archive %s 失败: %v", p.Name, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "移动失败: " + err.Error()})
		return
	}
	log.Printf("[操作] archive %s → %s", p.Name, dest)
	_ = s.rescan(false)
	c.JSON(http.StatusOK, gin.H{"ok": true, "moved_to": dest})
}

// ---- DELETE /api/projects/:name ----

func (s *Server) deleteProject(c *gin.Context) {
	if c.Query("force") != "true" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "真删除必须带 ?force=true（前端负责双重确认）"})
		return
	}
	rel := strings.TrimPrefix(c.Param("name"), "/")
	p := s.findByRel(rel)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "项目不存在: " + rel})
		return
	}
	if err := os.RemoveAll(p.Path); err != nil {
		log.Printf("[操作] delete %s 失败: %v", p.Name, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败: " + err.Error()})
		return
	}
	log.Printf("[操作] delete %s 成功", p.Name)
	_ = s.rescan(false)
	c.JSON(http.StatusOK, gin.H{"ok": true, "deleted": p.RelPath})
}

// ---- GET/PUT /api/settings ----

func (s *Server) getSettings(c *gin.Context) {
	c.JSON(http.StatusOK, s.cfg)
}

func (s *Server) putSettings(c *gin.Context) {
	var body config.Config
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Bind == "" {
		body.Bind = s.cfg.Bind
	}
	if body.Port == 0 {
		body.Port = s.cfg.Port
	}
	if body.ProjectsRoot == "" {
		body.ProjectsRoot = s.cfg.ProjectsRoot
	}
	// 归一化 config_extensions：去重 / .teaproject 首位 / 非法丢弃
	body.ConfigExtensions = normalizeExts(body.ConfigExtensions)
	// 写回 config.yaml（exe 同目录）
	dir, err := config.Dir()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := config.Save(filepath.Join(dir, "config.yaml"), &body); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.cfg = &body
	c.JSON(http.StatusOK, &body)
}

// normalizeExts 归一化 config_extensions：
//   - 去重
//   - .teaproject 必须存在且永远在首位
//   - 元素必须以 "." 开头且不含路径分隔符
//   - 非法元素丢弃
func normalizeExts(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, e := range in {
		e = strings.TrimSpace(strings.ToLower(e))
		if e == "" || !strings.HasPrefix(e, ".") {
			continue
		}
		if strings.ContainsAny(e, `/\`) {
			continue
		}
		if seen[e] {
			continue
		}
		seen[e] = true
		if e != ".teaproject" {
			out = append(out, e)
		}
	}
	// .teaproject 永远首位
	return append([]string{".teaproject"}, out...)
}

// 保证 encoding/json 被引用（留个钩子，避免后续调试时漏掉）
var _ = json.Marshal

// ---- GET /api/projects/:name/cover ----

// getCover 返回项目封面图字节。路径拼接必须 Clean + 前缀校验防穿越。
func (s *Server) getCover(c *gin.Context) {
	rel := strings.TrimPrefix(c.Param("name"), "/")
	p := s.findByRel(rel)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "项目不存在"})
		return
	}
	if p.CoverRel == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "无封面图"})
		return
	}
	// 拼接并校验
	full := filepath.Clean(filepath.Join(p.Path, p.CoverRel))
	root := filepath.Clean(p.Path)
	if !strings.HasPrefix(full, root) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "路径非法"})
		return
	}
	data, err := os.ReadFile(full)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "封面文件不存在"})
		return
	}
	ext := strings.ToLower(filepath.Ext(full))
	ct := "image/jpeg"
	switch ext {
	case ".png":
		ct = "image/png"
	case ".webp":
		ct = "image/webp"
	}
	c.Data(http.StatusOK, ct, data)
}

// ---- POST /api/projects/:name/run + SSE stream + terminate ----

// runState 记录一个正在运行的命令。
type runState struct {
	cmd    interface{} // *exec.Cmd
	output chan []byte
	done   chan struct{}
	exitCh chan int
}

var (
	runMu    sync.Mutex
	runTable = map[string]*runState{}
	runSeq   = 0
)

// runCommand 启动项目 commands[] 中 name 匹配的命令（只允许配置里的命令）。
func (s *Server) runCommand(c *gin.Context) {
	rel := strings.TrimPrefix(c.Param("name"), "/")
	p := s.findByRel(rel)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "项目不存在"})
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 在 commands[] 里找匹配
	var matched *meta.Command
	for i := range p.Commands {
		if p.Commands[i].Name == body.Name {
			matched = &p.Commands[i]
			break
		}
	}
	if matched == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "项目未配置命令: " + body.Name})
		return
	}
	// 并发上限 8
	runMu.Lock()
	if len(runTable) >= 8 {
		runMu.Unlock()
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "运行数已达上限 8"})
		return
	}
	runSeq++
	runID := fmt.Sprintf("run-%d", runSeq)
	runMu.Unlock()

	// 用 cmd /c 执行（Windows）
	cmd := osexec.Command("cmd", "/c", matched.Command)
	cmd.Dir = p.Path
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rs := &runState{
		output: make(chan []byte, 16),
		done:   make(chan struct{}),
		exitCh: make(chan int, 1),
	}
	runMu.Lock()
	runTable[runID] = rs
	runMu.Unlock()

	// 收集 stdout/stderr
	go func() {
		buf := make([]byte, 1024)
		for _, stream := range []interface{ Read([]byte) (int, error) }{stdout, stderr} {
			go func(r interface{ Read([]byte) (int, error) }) {
				for {
					n, err := r.Read(buf)
					if n > 0 {
						select {
						case rs.output <- buf[:n]:
						case <-rs.done:
							return
						}
					}
					if err != nil {
						return
					}
				}
			}(stream)
		}
	}()

	go func() {
		cmd.Wait()
		code := 0
		if cmd.ProcessState != nil {
			code = cmd.ProcessState.ExitCode()
		}
		rs.exitCh <- code
		close(rs.done)
		runMu.Lock()
		delete(runTable, runID)
		runMu.Unlock()
	}()

	log.Printf("[操作] run %s 启动: %s (project=%s)", runID, matched.Command, p.Name)
	c.JSON(http.StatusOK, gin.H{"run_id": runID})
}

// streamRun SSE 输出运行日志。
func (s *Server) streamRun(c *gin.Context) {
	runID := c.Param("run_id")
	runMu.Lock()
	rs, ok := runTable[runID]
	runMu.Unlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "运行不存在或已结束"})
		return
	}
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	flusher, _ := c.Writer.(http.Flusher)
	for {
		select {
		case chunk := <-rs.output:
			fmt.Fprintf(c.Writer, "event: output\ndata: %s\n\n", strings.ReplaceAll(string(chunk), "\n", "\\n"))
			if flusher != nil {
				flusher.Flush()
			}
		case code := <-rs.exitCh:
			fmt.Fprintf(c.Writer, "event: exit\ndata: %d\n\n", code)
			if flusher != nil {
				flusher.Flush()
			}
			return
		case <-c.Request.Context().Done():
			return
		}
	}
}

// terminateRun 终止运行中的命令。
func (s *Server) terminateRun(c *gin.Context) {
	runID := c.Param("run_id")
	runMu.Lock()
	_, ok := runTable[runID]
	runMu.Unlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "运行不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---- 自动备份 .tea-backups ----

// backupCurrent 把项目当前 YAML 备份到 .tea-backups/<name>/<时间戳>.yaml。
// 超 backup_keep 份删旧。备份前若当前文件不存在则跳过。
func (s *Server) backupCurrent(p *meta.Project) {
	if p.ConfigFile == "" {
		return
	}
	data, err := os.ReadFile(p.ConfigFile)
	if err != nil {
		return
	}
	backupDir := filepath.Join(s.cfg.ProjectsRoot, ".tea-backups", p.Name)
	os.MkdirAll(backupDir, 0o755)
	ts := time.Now().Format("20060102-150405")
	dst := filepath.Join(backupDir, ts+".yaml")
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		log.Printf("[备份] 写 %s 失败: %v", dst, err)
		return
	}
	// 超量删旧
	entries, _ := os.ReadDir(backupDir)
	files := []string{}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".yaml") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	keep := s.cfg.BackupKeep
	if keep == 0 {
		keep = 10
	}
	for len(files) > keep {
		old := files[0]
		os.Remove(filepath.Join(backupDir, old))
		files = files[1:]
	}
}

// listBackups GET /api/backups?project=<name>
func (s *Server) listBackups(c *gin.Context) {
	name := c.Query("project")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "project 参数必填"})
		return
	}
	backupDir := filepath.Join(s.cfg.ProjectsRoot, ".tea-backups", name)
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	type item struct {
		File string `json:"file"`
		Time string `json:"time"`
		Size int64  `json:"size"`
	}
	out := []item{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") {
			continue
		}
		fi, _ := e.Info()
		out = append(out, item{
			File: e.Name(),
			Time: strings.TrimSuffix(e.Name(), ".yaml"),
			Size: fi.Size(),
		})
	}
	c.JSON(http.StatusOK, out)
}

// restoreBackup POST /api/backups/restore {project, file}
func (s *Server) restoreBackup(c *gin.Context) {
	var body struct {
		Project string `json:"project"`
		File    string `json:"file"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 找项目
	var p *meta.Project
	for _, pp := range s.projects {
		if pp.Name == body.Project {
			p = pp
			break
		}
	}
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "项目不存在"})
		return
	}
	// 先备份当前
	s.backupCurrent(p)
	// 读备份文件
	src := filepath.Join(s.cfg.ProjectsRoot, ".tea-backups", body.Project, body.File)
	data, err := os.ReadFile(src)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "备份文件不存在"})
		return
	}
	// 写回 ConfigFile
	if p.ConfigFile == "" {
		p.ConfigFile = p.YamlPath()
	}
	if err := os.WriteFile(p.ConfigFile, data, 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// 重建内存里的项目
	if np, _, err := meta.LoadYamlExt(p.Path, s.cfg.ConfigExtensions); err == nil {
		s.fillWorkspaces([]*meta.Project{np})
		s.fillDerived([]*meta.Project{np})
		c.JSON(http.StatusOK, np)
	} else {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// ---- GET /api/export?format=json|csv|md ----

func (s *Server) export(c *gin.Context) {
	format := c.DefaultQuery("format", "json")
	s.fillDerived(s.projects)
	s.fillWorkspaces(s.projects)
	switch format {
	case "csv":
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", `attachment; filename="tea-projects.csv"`)
		// UTF-8 BOM
		c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
		c.Writer.Write([]byte("name,path,language,status,total_size_mb,last_active,health_score\n"))
		for _, p := range s.projects {
			line := fmt.Sprintf("%s,%s,%s,%s,%.2f,%s,%d\n",
				csvEsc(p.Name), csvEsc(p.RelPath), csvEsc(p.Language),
				csvEsc(p.Status), p.TotalSizeMB, p.LastActive, p.HealthScore)
			c.Writer.Write([]byte(line))
		}
	case "md":
		c.Header("Content-Type", "text/markdown; charset=utf-8")
		c.Header("Content-Disposition", `attachment; filename="tea-projects.md"`)
		c.Writer.Write([]byte("# Tea PM 项目清单\n\n"))
		c.Writer.Write([]byte("| 名称 | 路径 | 语言 | 状态 | 大小(MB) | 最后活跃 | 健康分 |\n"))
		c.Writer.Write([]byte("|---|---|---|---|---|---|---|\n"))
		for _, p := range s.projects {
			line := fmt.Sprintf("| %s | %s | %s | %s | %.2f | %s | %d |\n",
				p.Name, p.RelPath, p.Language, p.Status, p.TotalSizeMB, p.LastActive, p.HealthScore)
			c.Writer.Write([]byte(line))
		}
	default:
		c.Header("Content-Disposition", `attachment; filename="tea-projects.json"`)
		c.JSON(http.StatusOK, s.projects)
	}
}

func csvEsc(s string) string {
	if strings.ContainsAny(s, ",\"\n") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

// ---- POST /api/projects/:name/restore（归档恢复）----

func (s *Server) restoreProject(c *gin.Context) {
	rel := strings.TrimPrefix(c.Param("name"), "/")
	p := s.findByRel(rel)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "项目不存在"})
		return
	}
	if !p.Archived {
		c.JSON(http.StatusBadRequest, gin.H{"error": "项目不在 _archive 下"})
		return
	}
	// 原路径：E:\Projects\<name>
	dst := filepath.Join(s.cfg.ProjectsRoot, p.Name)
	if _, err := os.Stat(dst); err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "目标路径已存在: " + dst})
		return
	}
	if err := os.Rename(p.Path, dst); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[操作] restore %s → %s", p.Name, dst)
	c.JSON(http.StatusOK, gin.H{"ok": true, "new_path": dst})
}
