package server

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"tea-pm/internal/config"
	"tea-pm/internal/create"
)

// RegisterCreateRoutes 注册 POST /api/projects（新建项目）。
// 由 main.go 在 gin 引擎构造完后调用，独立文件不改动 server.go。
//
// 注意：server.go 里已有 GET /api/projects（列表），gin 按方法区分路由，
// POST 到同一路径不冲突。
//
// 创建后**不自动扫描**：让下一次 scan（手动或自动）去索引新项目，
// 保持本端点职责单一（只负责建目录+写 .teaproject）。
func RegisterCreateRoutes(r *gin.Engine, cfg *config.Config) {
	api := r.Group("/api")
	api.POST("/projects", handleProjectCreate(cfg))
}

type createProjectBody struct {
	Name   string `json:"name"`
	Type   string `json:"type"`   // empty|web|python，缺省 empty
	Desc   string `json:"desc"`    // 可选
	Readme *bool  `json:"readme"` // 缺省 true
}

func handleProjectCreate(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body createProjectBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请求体不是合法 JSON: " + err.Error()})
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name 不能为空"})
			return
		}
		typ := body.Type
		if typ == "" {
			typ = "empty"
		}
		readme := true
		if body.Readme != nil {
			readme = *body.Readme
		}

		path, err := create.CreateProject(cfg.ProjectsRoot, body.Name, typ, body.Desc, readme)
		if err != nil {
			// 参数错 / 目录已存在 → 400；其它（磁盘错）→ 500
			msg := err.Error()
			if strings.Contains(msg, "名称") || strings.Contains(msg, "非法") || strings.Contains(msg, "已存在") {
				c.JSON(http.StatusBadRequest, gin.H{"error": msg})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": msg})
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"name": body.Name,
			"path": path,
			"type": typ,
		})
	}
}
