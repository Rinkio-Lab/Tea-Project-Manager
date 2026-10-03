//go:build windows

// Package tray 实现 Windows 系统托盘常驻（纯 syscall，无第三方依赖、无 cgo）。
//
// 仅 Windows 平台使用。通过 user32.dll 的 Shell_NotifyIconW 注册托盘图标，
// 配合一个隐藏消息窗口 + 消息循环实现右键菜单。图标暂用系统默认应用图标
// （IDI_APPLICATION）占位——后续可替换为 .rsrc 内嵌 .ico。
//
// 线程模型：Run 内部调用 runtime.LockOSThread，确保窗口与消息循环绑定在同一 OS
// 线程（Win32 GUI 的硬性要求）。调用方在 --tray 模式下应直接在 main goroutine
// 调用 Run，由它阻塞直到菜单"退出"。
package tray

import (
	"fmt"
	"log"
	"runtime"
	"syscall"
	"unsafe"
)

// ---- Win32 常量 ----

const (
	swHide = 0 // ShowWindow 第 2 参：隐藏窗口并激活另一个窗口

	wmDestroy      = 0x0002
	wmQuit         = 0x0012
	wmUser         = 0x0400
	wmTrayCallback = wmUser + 1 // 自定义：托盘图标点击回传到隐藏窗口
	wmNull         = 0x0000
	wmLButtonUp    = 0x0202
	wmRButtonUp    = 0x0205
	wmCommand      = 0x0111 // 菜单命令（HIWORD=0 表示来自菜单）

	nifMessage = 0x01
	nifIcon    = 0x02
	nifTip     = 0x04
	nimAdd     = 0
	nimDelete  = 2

	idiApplication = 32512 // 系统默认应用图标（占位）
	idcArrow       = 32512 // 系统默认箭头光标

	mfString    = 0x0000
	mfSeparator = 0x0800

	tpmLeftButton  = 0x0000
	tpmRightButton = 0x0002
	tpmCenterAlign = 0x0000
	tpmRightAlign  = 0x0008
	tpmBottomAlign = 0x0200

	idTrayOpen = 1001
	idTrayScan = 1002
	idTrayExit = 1003
)

// ---- Win32 DLL 与 proc 句柄 ----

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	shell32  = syscall.NewLazyDLL("shell32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procGetConsoleWindow = kernel32.NewProc("GetConsoleWindow")
	procShowWindow       = user32.NewProc("ShowWindow")
	procGetModuleHandle  = kernel32.NewProc("GetModuleHandleW")
	procRegisterClassEx  = user32.NewProc("RegisterClassExW")
	procCreateWindowEx   = user32.NewProc("CreateWindowExW")
	procDefWindowProc     = user32.NewProc("DefWindowProcW")
	procLoadIcon         = user32.NewProc("LoadIconW")
	procLoadCursor       = user32.NewProc("LoadCursorW")
	procShellNotifyIcon  = shell32.NewProc("Shell_NotifyIconW")
	procCreatePopupMenu  = user32.NewProc("CreatePopupMenu")
	procAppendMenu       = user32.NewProc("AppendMenuW")
	procTrackPopupMenu   = user32.NewProc("TrackPopupMenu")
	procDestroyMenu      = user32.NewProc("DestroyMenu")
	procGetCursorPos     = user32.NewProc("GetCursorPos")
	procSetForeground    = user32.NewProc("SetForegroundWindow")
	procPostMessage      = user32.NewProc("PostMessageW")
	procPostQuitMessage   = user32.NewProc("PostQuitMessage")
	procGetMessage       = user32.NewProc("GetMessageW")
	procTranslateMessage = user32.NewProc("TranslateMessage")
	procDispatchMessage  = user32.NewProc("DispatchMessageW")
)

// ---- 结构体（与 Win32 C ABI 对齐）----

type wndclassex struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type point struct {
	x, y int32
}

type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
}

// notifyicondata 与 Win32 NOTIFYICONDATAW 同布局（64 位下 sizeof=976）。
// 字段顺序必须严格匹配 C 头文件，否则 Shell_NotifyIcon 会失败。
type notifyicondata struct {
	cbSize           uint32
	hWnd             uintptr
	uID              uint32
	uFlags           uint32
	uCallbackMessage uint32
	hIcon            uintptr
	szTip            [128]uint16
	dwState          uint32
	dwStateMask      uint32
	szInfo           [256]uint16
	uTimeoutVersion  uint32
	szInfoTitle      [64]uint16
	dwInfoFlags      uint32
	guidItem         [16]byte
	hBalloonIcon     uintptr
}

// ---- Options 配置 ----

// Options 描述托盘行为。三个回调都由 WndProc 在消息循环线程内同步调用；
// 实现方应避免在回调里做长时间阻塞操作（HTTP Shutdown 是例外，可接受 ~秒级）。
type Options struct {
	Title    string // 鼠标悬浮提示（UTF-16 截断到 127 字符）
	OnOpenUI func() // "打开 UI"
	OnRescan func() // "重新扫描"
	OnExit   func() // "退出"（先于 PostQuitMessage 调用，用于优雅关 HTTP）
}

// 包级状态：syscall.NewCallback 只能包顶层函数，无法带闭包，
// 因此用全局变量把 Options / 隐藏窗口句柄传给 WndProc。
var (
	opts Options
	gHwnd uintptr
)

// HideConsole 隐藏当前进程的控制台窗口（--tray 时调用）。
// 没有控制台（如被 explorer 启动）时静默返回。
func HideConsole() {
	h, _, _ := procGetConsoleWindow.Call()
	if h != 0 {
		procShowWindow.Call(h, swHide)
	}
}

// Run 注册托盘图标并跑消息循环，直到用户点"退出"或窗口被销毁。
// 阻塞调用；调用方应在 main goroutine 直接调用（内部 LockOSThread）。
func Run(o Options) error {
	opts = o
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	hInst, _, _ := procGetModuleHandle.Call(0)
	className, _ := syscall.UTF16PtrFromString("TeaPMTrayHiddenWnd")

	// 图标：暂用系统默认应用图标占位。
	// TODO: 若后续要换自定义 .ico，可通过 LoadImageW 从 .rsrc 加载。
	hIcon, _, _ := procLoadIcon.Call(0, idiApplication)
	hCursor, _, _ := procLoadCursor.Call(0, idcArrow)

	wc := wndclassex{
		cbSize:        uint32(unsafe.Sizeof(wndclassex{})),
		lpfnWndProc:   syscall.NewCallback(wndProc),
		hInstance:     hInst,
		hIcon:         hIcon,
		hCursor:       hCursor,
		lpszClassName: className,
	}
	if atom, _, _ := procRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc))); atom == 0 {
		return fmt.Errorf("RegisterClassExW 失败: %w", syscall.GetLastError())
	}

	// 创建 0×0 隐藏窗口：仅作为托盘消息的接收者，不出现在任务栏。
	r1, _, e1 := procCreateWindowEx.Call(
		0,                                     // dwExStyle
		uintptr(unsafe.Pointer(className)),    // lpClassName
		uintptr(unsafe.Pointer(className)),     // lpWindowName
		0,                                     // dwStyle（隐藏窗口，无 style）
		0, 0, 0, 0,                            // x,y,w,h
		0,                                     // hWndParent
		0,                                     // hMenu
		hInst,                                 // hInstance
		0,                                     // lpParam
	)
	if r1 == 0 {
		return fmt.Errorf("CreateWindowExW 失败: %w", e1)
	}
	gHwnd = r1

	// 注册托盘图标
	tipUTF16 := syscall.StringToUTF16(o.Title)
	var nid notifyicondata
	nid.cbSize = uint32(unsafe.Sizeof(notifyicondata{}))
	nid.hWnd = gHwnd
	nid.uID = 1
	nid.uFlags = nifMessage | nifIcon | nifTip
	nid.uCallbackMessage = wmTrayCallback
	nid.hIcon = hIcon
	// 拷贝提示文本到 szTip（最多 127 字符 + NUL 终止符）
	for i := 0; i < len(tipUTF16) && i < 127; i++ {
		nid.szTip[i] = tipUTF16[i]
	}

	if r1, _, e1 := procShellNotifyIcon.Call(nimAdd, uintptr(unsafe.Pointer(&nid))); r1 == 0 {
		return fmt.Errorf("Shell_NotifyIconW(NIM_ADD) 失败: %w", e1)
	}
	log.Printf("[托盘] 图标已注册，消息循环启动")

	// 消息循环：GetMessage 阻塞直到有消息；返回 0 表示收到 WM_QUIT。
	var m msg
	for {
		ret, _, _ := procGetMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if ret == 0 {
			break
		}
		if ret == ^uintptr(0) { // -1，消息出错
			log.Printf("[托盘] GetMessage 返回 -1，退出")
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessage.Call(uintptr(unsafe.Pointer(&m)))
	}
	log.Printf("[托盘] 消息循环结束")
	return nil
}

// wndProc 是隐藏窗口的窗口过程（C 回调）。
// 签名必须与 WNDPROC 一致：LRESULT CALLBACK WndProc(HWND, UINT, WPARAM, LPARAM)。
func wndProc(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {
	case wmTrayCallback:
		// lParam 低 16 位是触发消息的鼠标事件
		if event := lParam & 0xFFFF; event == wmRButtonUp || event == wmLButtonUp {
			showPopupMenu(hwnd)
		}
	case wmCommand:
		// 菜单命令：低字是菜单 ID
		switch wParam & 0xFFFF {
		case idTrayOpen:
			safeCall(opts.OnOpenUI, "OnOpenUI")
		case idTrayScan:
			safeCall(opts.OnRescan, "OnRescan")
		case idTrayExit:
			removeTrayIcon()
			// 先同步优雅关闭 HTTP（最多 5s，由 OnExit 内部控制超时）
			safeCall(opts.OnExit, "OnExit")
			procPostQuitMessage.Call(0)
		}
	case wmDestroy:
		removeTrayIcon()
		procPostQuitMessage.Call(0)
	}
	ret, _, _ := procDefWindowProc.Call(hwnd, uintptr(msg), wParam, lParam)
	return ret
}

// showPopupMenu 在鼠标位置弹出右键菜单。
func showPopupMenu(hwnd uintptr) {
	var pt point
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))

	menu, _, _ := procCreatePopupMenu.Call()
	if menu == 0 {
		return
	}
	defer procDestroyMenu.Call(menu)

	open, _ := syscall.UTF16PtrFromString("打开 UI")
	scan, _ := syscall.UTF16PtrFromString("重新扫描")
	exit, _ := syscall.UTF16PtrFromString("退出")
	procAppendMenu.Call(menu, mfString, idTrayOpen, uintptr(unsafe.Pointer(open)))
	procAppendMenu.Call(menu, mfString, idTrayScan, uintptr(unsafe.Pointer(scan)))
	procAppendMenu.Call(menu, mfSeparator, 0, 0)
	procAppendMenu.Call(menu, mfString, idTrayExit, uintptr(unsafe.Pointer(exit)))

	// TrackPopupMenu 要求调用线程已 SetForegroundWindow，否则菜单点击外部不关闭。
	procSetForeground.Call(hwnd)
	procTrackPopupMenu.Call(menu,
		tpmRightButton|tpmRightAlign|tpmBottomAlign,
		uintptr(pt.x), uintptr(pt.y),
		0, hwnd, 0)
	// Windows 惯例：菜单关闭后发 WM_NULL，让系统正常释放前台状态。
	procPostMessage.Call(hwnd, wmNull, 0, 0)
}

// removeTrayIcon 从托盘区删除图标（NIM_DELETE）。
func removeTrayIcon() {
	if gHwnd == 0 {
		return
	}
	var nid notifyicondata
	nid.cbSize = uint32(unsafe.Sizeof(notifyicondata{}))
	nid.hWnd = gHwnd
	nid.uID = 1
	procShellNotifyIcon.Call(nimDelete, uintptr(unsafe.Pointer(&nid)))
}

// safeCall 防止回调 panic 把消息循环搞崩。
func safeCall(fn func(), name string) {
	if fn == nil {
		return
	}
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[托盘] %s panic: %v", name, r)
		}
	}()
	fn()
}
