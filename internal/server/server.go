// Package server 是 gin HTTP 服务：REST API + web/ 静态资源挂载。
//
// 内存里持有一份"项目列表"快照（[]*meta.Project），由 scan 重建；
// PUT / POST open 等写操作只改这一份 + 对应磁盘文件。
package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
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
	cfg     *config.Config
	mu      sync.RWMutex
	projects []*meta.Project // 内存快照，已按 order 排序
}

// New 构造 Server 并立即做一次启动扫描（dry-run），把自动区刷新到最新。
// 索引里的 order 号会被保留合并进新扫描结果。
func New(cfg *config.Config) (*Server, error) {
	s := &Server{cfg: cfg}
	if err := s.rescan(false); err != nil {
		return nil, err
	}
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
	for _, p := range oldIdx.Projects {
		orderMap[p.RelPath] = p.Order
	}

	res, err := scanner.Scan(s.cfg.ProjectsRoot, write)
	if err != nil {
		return err
	}
	for _, p := range res.Projects {
		p.Order = orderMap[p.RelPath]
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

	api := r.Group("/api")
	{
		api.GET("/projects", s.listProjects)
		api.GET("/projects/:name", s.getProject)
		api.PUT("/projects/:name", s.putProject)
		api.DELETE("/projects/:name", s.deleteProject)
		api.POST("/projects/:name/open", s.openProject)
		api.POST("/projects/:name/archive", s.archiveProject)
		api.POST("/scan", s.postScan)
		api.GET("/stats", s.stats)
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
	c.JSON(http.StatusOK, out)
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
	Order       *int      `json:"order"`
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
	// ai 字段显式布尔：ai:true 写回，ai:false 清除（yaml omitempty 省略），缺省不动
	if body.AI != nil {
		p.AI = *body.AI
	}
	// order 只写索引，绝不进 YAML
	if body.Order != nil {
		p.Order = *body.Order
	}

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
	if err := s.rescan(write); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "移动失败: " + err.Error()})
		return
	}
	// 同步刷新内存与索引
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败: " + err.Error()})
		return
	}
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

// 保证 encoding/json 被引用（留个钩子，避免后续调试时漏掉）
var _ = json.Marshal
