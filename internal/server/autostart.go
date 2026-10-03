package server

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"

	"github.com/gin-gonic/gin"
)

// 开机自启：写 HKCU\Software\Microsoft\Windows\CurrentVersion\Run 的 tea-pm 值。
// 选择 HKCU 而非 HKLM：不需要管理员权限，且只对当前用户生效（符合"个人项目管理器"定位）。
const (
	autostartKeyName   = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	autostartValueName = `tea-pm`
)

// RegisterAutostartRoutes 注册 /api/autostart 路由。
// 由 main.go 在 gin 引擎构造完后调用，独立文件不改动 server.go。
//
// 实现说明：直接调用系统 reg.exe，不引第三方注册表库。
// 命令参数固定拼接，exe 路径来自 os.Executable()，不接受外部任意输入
// （白名单思想：用户无法通过 API 注入额外参数）。
//
// 退出码约定：reg.exe 在键/值不存在时退出码非 0（具体值随本地化文案变化），
// 所以这里用 *exec.ExitError 判断"已经查不到"而非解析输出文本——
// 这样英文/中文 Windows 都能工作，不依赖 GBK/UTF-8 解码。
func RegisterAutostartRoutes(r *gin.Engine) {
	api := r.Group("/api")
	api.GET("/autostart", handleAutostartGet)
	api.PUT("/autostart", handleAutostartPut)
}

// regQueryEnabled 用 reg.exe 查询值是否存在。
// 不存在时返回 (false, nil)；reg.exe 进程本身起不来时才返回 error。
func regQueryEnabled() (bool, error) {
	cmd := exec.Command("reg.exe", "query", autostartKeyName, "/v", autostartValueName)
	if err := cmd.Run(); err != nil {
		if _, ok := err.(*exec.ExitError); ok {
			// 退出码非 0 = 键或值不存在，视为 disabled
			return false, nil
		}
		return false, fmt.Errorf("reg query 启动失败: %w", err)
	}
	return true, nil
}

// GET /api/autostart → {"enabled": bool}
func handleAutostartGet(c *gin.Context) {
	enabled, err := regQueryEnabled()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"enabled": enabled})
}

type autostartPutBody struct {
	Enabled bool `json:"enabled"`
}

// PUT /api/autostart {"enabled": true|false}
//   true  → 写入 REG_SZ "<exe>" serve --tray（路径含空格时必须引号包裹）
//   false → 删除值；值不存在时静默返回 enabled:false
func handleAutostartPut(c *gin.Context) {
	var body autostartPutBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体应为 {\"enabled\": true|false}: " + err.Error()})
		return
	}

	if body.Enabled {
		exe, err := os.Executable()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "定位当前 exe 失败: " + err.Error()})
			return
		}
		// 双引号包裹路径：即使路径含空格（如 "Tea Project Manager"）也能正确启动。
		val := fmt.Sprintf(`"%s" serve --tray`, exe)
		cmd := exec.Command("reg.exe", "add", autostartKeyName,
			"/v", autostartValueName,
			"/t", "REG_SZ",
			"/d", val,
			"/f")
		if out, err := cmd.CombinedOutput(); err != nil {
			if _, ok := err.(*exec.ExitError); ok {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("reg add 退出码非 0: %s", out)})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("reg add 启动失败: %v", err)})
			}
			return
		}
	} else {
		cmd := exec.Command("reg.exe", "delete", autostartKeyName,
			"/v", autostartValueName, "/f")
		if err := cmd.Run(); err != nil {
			// 删除失败分两种：值本来就不存在（OK），或真的删不掉（回读会暴露）
			if _, ok := err.(*exec.ExitError); !ok {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("reg delete 启动失败: %v", err)})
				return
			}
		}
	}

	// 回读一次确认状态，返回真实结果而非前端传值
	enabled, err := regQueryEnabled()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "回读状态失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"enabled": enabled})
}
