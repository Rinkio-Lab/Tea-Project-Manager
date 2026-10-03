# -*- coding: utf-8 -*-
"""
Tea PM 2.0 — Phase 0 种子生成脚本（一次性、可复现）

职责：为 E:\\Projects 下每个符合条件的项目目录生成 .teaproject（YAML）初版。
数据来源（不做任何额外调研/推断）：
  1. E:\\ai_temp\\projects_inventory_2026-10-03.txt   （盘点清单，竖线分隔）
  2. E:\\ai_temp\\projects-tools-2026-10-03\\analysis_2026-10-03.md （分析报告）
  3. 设计稿 §3（.teaproject 2.0 YAML Schema）

用法：
  python generate_seeds.py --dry-run   # 只预览，输出 docs/seed-dry-run-2026-10-03.md
  python generate_seeds.py --write     # 真正写盘（每个项目目录写 .teaproject）

字段映射严格按设计稿 §3：
  标识区：name/path/type/category/language/tech_stack?/status/quality/description/intent/tags/ai
  自动区（last_active/created/code_files/...）：种子阶段不写，由首次 tea scan 刷新
  操作与备注：actions 省略；notes 仅在有值得留存的备注时写
"""

import argparse
import json
import os
import re
import sys

import yaml

PROJECTS_ROOT = r"E:\Projects"
INVENTORY = r"E:\ai_temp\projects_inventory_2026-10-03.txt"
SELF_DIR = os.path.dirname(os.path.abspath(__file__))
SELF_ROOT = os.path.dirname(SELF_DIR)  # E:\Projects\Tea Project Manager
DRY_RUN_MD = os.path.join(SELF_ROOT, "docs", "seed-dry-run-2026-10-03.md")
REPORT_MD = os.path.join(SELF_ROOT, "docs", "seed-report-2026-10-03.md")

# 嵌套项目（不在顶层，但盘点里有独立行，需额外生成）
NESTED_PROJECTS = [r"Lyrics Layout\New Songs"]

# 盘点里有、但磁盘上已不存在的目录（跳过，报告说明）
MISSING_ON_DISK = [
    "Blog", "Font Previewer", "LyricsAuto", "SongAPI", "Tea Lingo", "VocabZoom",
]


# ---------------------------------------------------------------------------
# 盘点清单解析
# ---------------------------------------------------------------------------
def load_inventory(path):
    """返回 {规范化绝对路径: rowdict}。规范化 = 弯引号→直引号，便于匹配磁盘名。"""
    rows = {}
    with open(path, "r", encoding="utf-8") as f:
        lines = [ln.rstrip("\n") for ln in f if ln.strip()]
    header = lines[0].split("|")
    for ln in lines[1:]:
        cols = ln.split("|")
        cols += [""] * (len(header) - len(cols))
        row = dict(zip(header, cols))
        key = norm(row["绝对路径"])
        rows[key] = row
    return rows


def norm(s):
    """规范化字符串用于匹配：弯引号 U+2018/2019 → 直引号。"""
    return s.replace("\u2018", "'").replace("\u2019", "'")


def derive_category(raw):
    """'其他(XXX)' → XXX；其余原样。"""
    m = re.match(r"^其他\((.*)\)$", raw.strip())
    return m.group(1) if m else raw.strip()


# ---------------------------------------------------------------------------
# 逐项目手工核定覆盖表（key = 磁盘叶子目录名）
# description / intent 全部取自分析报告具体事实，每项目不同；禁止套话。
# ---------------------------------------------------------------------------
OVERRIDES = {
    "60s_Aggregator": {
        "type": "backend", "language": "Python", "tech_stack": ["Flask", "httpx"],
        "description": "基于 60s 开放 API 的信息聚合站，资讯/榜单/工具/娱乐四分类；app.py 92 行配 utils/ 模块化 ttl 缓存，是真实 Flask 应用而非模板。",
        "intent": "2025-08 想把每日 60s 快讯与榜单聚合成一个本地可看的首页，顺手练 Flask 模块化与缓存。",
        "tags": ["Flask", "信息聚合", "API", "Python"],
    },
    "Anime Character": {
        "type": "static_site", "language": "HTML/CSS", "tech_stack": [],
        "description": "BanG Dream 系列乐队成员资料静态站，index.html 393 行 + table.html 388 行 + mygo/mujica/togetoge.html 各约 180–200 行，配 mygo.md 数据表。",
        "intent": "追 MyGO/Ave Mujica 时把成员信息整理成可查的多页面资料站，省得来回翻萌百。",
        "tags": ["BanG Dream", "静态站", "资料", "MyGO"],
    },
    "Bangumi Gallery": {
        "type": "static_site", "language": "JavaScript", "tech_stack": ["Materialize CSS"],
        "description": "Materialize CSS 番剧展示页，网格/列表切换 + 搜索/筛选 + 深浅主题；bangumi.html 693 行 + style.css 465 行，另有 bangumi.py 288 行数据生成脚本。",
        "intent": "2025-10 想把自己看过的番剧做成带筛选的展示画廊，留存观影记录。",
        "tags": ["番剧", "Materialize", "静态站", "画廊"],
        "notes": "留存 script.old.js 352 行旧版",
    },
    "Blog.Assets": {
        "type": "resource", "language": "音频资源", "tech_stack": [],
        "description": "Blog 配套音频资产目录，music/ 下 3 首 mp3 约 20MB（OSHINKO/SORA_NO_HAKO/ZATO_BOKURANOMACHI），配一个 147 行资源展示着陆页。",
        "intent": "给个人博客备 3 首背景音乐 mp3 资产，集中存放以便博客引用。",
        "tags": ["博客", "音频", "mp3", "资源"],
    },
    "BMICalc": {
        "type": "desktop", "language": "Python", "tech_stack": ["PyQt5"],
        "description": "中/日/英多语言 BMI 计算器 PyQt5 桌面小工具，bmi.py 单文件 548 行（24KB 巨石），翻译字典硬编码。",
        "intent": "2025-03 练 PyQt5 桌面窗与多语言切换，做个体积小巧的 BMI 计算器自用。",
        "tags": ["PyQt5", "BMI", "桌面小工具", "多语言"],
    },
    "CBZ Reader": {
        "type": "frontend", "language": "JavaScript", "tech_stack": ["HTML", "CSS", "JSZip"],
        "description": "单文件多章节 CBZ 漫画阅读器，index.html 334 行自写章节切换与解压逻辑，CSS 变量驱动明暗主题，仅依赖第三方 jszip。",
        "intent": "2025-09 想在浏览器里直接翻 CBZ 压缩包漫画、不装桌面阅读器，随手做个单文件页。",
        "tags": ["漫画", "CBZ", "前端", "阅读器"],
    },
    "chem-anim": {
        "type": "learning", "language": "Python", "tech_stack": ["Manim"],
        "description": "Manim 有机化学动画生成器，main.py 157 行 + chem_anim/ 包 8 个 py 共约 2380 行（config_loader 538/molecule_factory 506/player 465），README 12KB，2026-09 仍在产出 mp4。",
        "intent": "2026-09 学生物化学时想用 Manim 把有机反应机理做成可讲解动画，边学边搭可复用的动画工厂。",
        "tags": ["Manim", "化学", "动画", "学习"],
    },
    "Downloads Organizer": {
        "type": "script", "language": "Python", "tech_stack": ["watchdog"],
        "description": "watchdog 监听 Downloads 目录自动归类脚本，main.py 56 行 + utils.py 25 行 + config.yaml，类型注解与日志规范。",
        "intent": "2025-07 Downloads 越堆越乱，想让它按文件类型自动分文件夹，省得手动整理。",
        "tags": ["watchdog", "文件整理", "Python", "自动化"],
    },
    "Easy FTP Server Plus": {
        "type": "script", "language": "Python", "tech_stack": ["pyftpdlib"],
        "description": "本地 FTP 服务器，基于 pyftpdlib，DriveFS 继承 AbstractedFS 映射盘符，main.py 102 行。",
        "intent": "2025-07 想在局域网内用手机或另一台电脑直连拷文件，起个映射盘符的轻量 FTP 服务。",
        "tags": ["FTP", "pyftpdlib", "局域网", "文件共享"],
    },
    "Easy Progress Bar": {
        "type": "cli", "language": "Python", "tech_stack": [],
        "description": "命令行进度条 CLI，argparse + 主题切换，main.py 38 行 + style/style1.py 22 行；from .style 相对导入导致直跑 ImportError，是跑不起来的草稿。",
        "intent": "2023-11 起步期练 argparse 与主题化输出，想给自己脚本里加个好看的进度条，没修完导入就搁置。",
        "tags": ["进度条", "CLI", "Python", "草稿"],
    },
    "Easy YT-DLP": {
        "type": "cli", "language": "Python", "tech_stack": ["rich", "questionary", "clipboard-monitor"],
        "description": "rich/questionary CLI 音频下载器，手动输 URL 或剪贴板监控两种模式，固定 bestaudio 转 mp3 下到 ./Download，失败自动重试 3 次；main.py 147 行，MIT 三语 README。",
        "intent": "2025-09 从 YTDown 的 tkinter GUI 转向 rich CLI，收窄到只下 YouTube 音频转 mp3，剪贴板监听做到复制链接就自动下。",
        "tags": ["yt-dlp", "音频下载", "CLI", "rich"],
        "notes": "根目录混入 desktop.ini 被提交进 git",
    },
    "Emote CLI": {
        "type": "cli", "language": "Python", "tech_stack": ["requests", "questionary"],
        "description": "questionary CLI B 站表情包批量下载器，输 Cookie+UA 后列出已购表情包、选包批量下 PNG 到 emotes/<包名>/；main.py 76 行，emotes/ 已产出 195 张。",
        "intent": "2025-07 想把自己 B 站账号里买的表情包（少女乐团派对/鸣潮/原神等联名）备份到本地。",
        "tags": ["B站", "表情包", "下载", "CLI"],
    },
    "eNoval": {
        "type": "cli", "language": "Python", "tech_stack": ["rich"],
        "description": "rich TUI 终端小说阅读器，main.py 335 行 + lang/ 多语言包，中/英/日三语 README 约 15KB，已发布 v0.1.0。",
        "intent": "2025-07 想在终端里安静读本地小说，借 rich 做 TUI 分页与三语文档，练 uv 工程化与多语言。",
        "tags": ["小说阅读器", "rich", "TUI", "终端"],
    },
    "eNoval-v0.1.0-release": {
        "type": "resource", "language": "发布包", "tech_stack": [],
        "description": "eNoval v0.1.0 的 Nuitka onefile 打包产物：main.exe 7.7MB + config.yaml + library/ 示例书库，无任何源码。",
        "intent": "eNoval v0.1.0 打包产物，用于分发给没有 Python 环境的机器；可随时从源工程 eNoval 重建。",
        "tags": ["发布包", "eNoval", "Nuitka", "产物"],
    },
    "Fast NCM Downloader": {
        "type": "desktop", "language": "Python", "tech_stack": ["PyQt5", "qfluentwidgets", "requests"],
        "description": "PyQt5/qfluentwidgets 网易云搜歌桌面 GUI，表格展示名字/ID/专辑；实际只下歌词，SongDownloader.Song() 空 pass；main 192 + Class 92 + InfoBar 82 共 366 行，靠星号导入。",
        "intent": "2023-10 起步期练 PyQt5 + qfluentwidgets Fluent 组件库，想做搜网易云歌的桌面窗，下载逻辑留空只接了搜索填表。",
        "tags": ["网易云", "下载", "PyQt5", "桌面GUI"],
        "notes": "半成品：Song() 空 pass、搜索按钮不触发下载；建议与 NCM-Down 合并补真下载逻辑",
    },
    "FileServer": {
        "type": "backend", "language": "Python", "tech_stack": ["Flask"],
        "description": "局域网文件共享 Flask 应用，含管理面板与中/英/日三语 i18n；routes.py 约 800 行 + admin_panel.py 490 行 + run.py 226 行，README 8.8KB。",
        "intent": "2026-08 想在浏览器里局域网传文件并带管理面板，练 Flask 分层与三语 i18n。",
        "tags": ["Flask", "文件共享", "局域网", "Web"],
    },
    "Function Graph": {
        "type": "learning", "language": "Python", "tech_stack": ["numpy", "matplotlib"],
        "description": "单文件函数绘图 demo，main.py 仅 16 行，用 numpy/matplotlib 画平方函数曲线，2023-11 旧脚本。",
        "intent": "2023-11 刚学 matplotlib 时画的第一根函数曲线练手 demo，一行不多。",
        "tags": ["matplotlib", "函数绘图", "学习", "demo"],
    },
    "GBC Album": {
        "type": "backend", "language": "Python", "tech_stack": ["Flask", "mutagen"],
        "description": "个人音乐专辑播放站，Flask 后端 + Spotify 风格前端；server.py 87 行用 mutagen 读 FLAC 元数据并开 CORS API，static/js/app.js 299 行，assets/songs/ 30 首 flac。",
        "intent": "2025-11 想把自己收藏的 30 首 flac 做成浏览器里可翻页播放的专辑站，练 Flask + CORS API。",
        "tags": ["音乐播放", "Flask", "FLAC", "专辑站"],
    },
    "imgView": {
        "type": "frontend", "language": "JavaScript", "tech_stack": ["HTML", "CSS"],
        "description": "MyGO×Ave Mujica 图片画廊纯前端页，script.js 186 行实现三语 i18n/主题切换/灯箱/键盘触摸导航，style.css 307 行。",
        "intent": "2026-02 追 MyGO×Ave Mujica 时想做个可切语言、带灯箱的本地图片画廊，练前端 i18n 与灯箱交互。",
        "tags": ["MyGO", "图片画廊", "前端", "i18n"],
    },
    "iPic Tools": {
        "type": "desktop", "language": "Python", "tech_stack": ["PySide6"],
        "description": "HEIC 批量转格式 PySide6 桌面工具，QThread/Signal 异步清晰，main.py 90 行 + utils.py 67 行。",
        "intent": "2025-08 手机传过来的 HEIC 图在 Windows 打不开，想做个批量转 JPG/PNG 的桌面小工具。",
        "tags": ["HEIC", "格式转换", "PySide6", "桌面工具"],
        "notes": "README 0 字节空壳",
    },
    "LanzouBackup": {
        "type": "desktop", "language": "Python", "tech_stack": ["PySide6"],
        "description": "蓝奏云文件夹备份上传 PySide6 工具，UI 与 core 分离：main.py 170 行 + backup_core.py 105 行 + main.ui 3.2KB。",
        "intent": "2025-08 想把本地文件夹定期备份上传到蓝奏云网盘，练 PySide6 的 UI/core 分层。",
        "tags": ["蓝奏云", "备份", "PySide6", "上传"],
        "notes": "README 0 字节空壳",
    },
    "Learn Golang": {
        "type": "learning", "language": "Go", "tech_stack": [],
        "description": "Go 入门练习，hello.go 仅 5 行 fmt.Println(\"Hello, World!\") + go.mod，另含 2026-07 重新编译的 hello.exe 2.4MB。",
        "intent": "2026-07 正式开学 Go（同期在重构 Tea PM），从 hello world 起手搭工程、跑通 go build。",
        "tags": ["Go", "hello world", "学习", "入门"],
    },
    "LiKasekiChatServer": {
        "type": "backend", "language": "Python", "tech_stack": ["Flask-SocketIO", "PySide6"],
        "description": "局域网聊天服务器，Flask-SocketIO 后端 + PySide6 控制面板：server.py 168 + control_panel.py 213 + models.py 80 行，配 chat.db；SECRET_KEY 硬编码。",
        "intent": "2025-04 想在局域网内做个带管理面板的聊天室，练 Flask-SocketIO 实时通信与 PySide6 控制端。",
        "tags": ["聊天", "Flask-SocketIO", "局域网", "WebSocket"],
        "notes": "SECRET_KEY 硬编码；早期实验性服务，自用价值低",
    },
    "Linko Full-Screen Displayer": {
        "type": "desktop", "language": "Python", "tech_stack": ["PyQt5"],
        "description": "2023 年 PyQt5 全屏展示工具，main.py 125 行 + functions.py 76 行等小模块；readme.md 1.6KB 实为 PyInstaller 打包参数表，activities.py 为空。",
        "intent": "2023-07 起步期想做个循环全屏展示图片或内容的窗，练 PyQt5 全屏与打包。",
        "tags": ["PyQt5", "全屏展示", "桌面工具", "2023旧"],
    },
    "Linko-Lyrics-Displayer": {
        "type": "desktop", "language": "JavaScript", "tech_stack": ["Electron", "aplayer"],
        "description": "Electron 歌词/音乐播放器草稿，主进程 main.js 54 行仍停留在 electron-quick-start 官方模板；渲染层自写 script.js 83 行做 LRC 解析 + 音频同步进度圈。",
        "intent": "2023-10 想做个桌面歌词播放器，用 Electron 起手但只改了渲染层，主进程壳没定制，后被 LyricEx 生态取代。",
        "tags": ["Electron", "歌词播放器", "LRC", "草稿"],
        "notes": "Electron 壳为官方模板未改；已被 LyricEx 歌词生态取代",
    },
    "Linko-ToDo": {
        "type": "backend", "language": "Python", "tech_stack": ["Flask", "SQLite"],
        "description": "Flask + SQLite 待办事项应用，支持优先级/截止/分类/深浅主题；app/ 分层（models/routes）+ static/js/app.js 6.9KB + scss 拆分，README 1.7KB，git 7 提交。",
        "intent": "2025-07 想要个自托管的轻量待办，练 Flask 分层、SQLite 与 scss 拆分，替代现成待办 App。",
        "tags": ["待办", "Flask", "SQLite", "Web应用"],
    },
    "Live Server": {
        "type": "cli", "language": "Python", "tech_stack": ["rich", "watchdog"],
        "description": "仿 VSCode Live Server 的本地静态服务器 CLI，main.py 226 行，rich/watchdog 做成可选依赖降级；README 2.9KB。",
        "intent": "2025-07 不想开 VS Code 也要热刷新本地静态页，用 Python 复刻一个轻量 Live Server。",
        "tags": ["静态服务器", "Live Server", "CLI", "热刷新"],
    },
    "LyricEx": {
        "type": "frontend", "language": "JavaScript", "tech_stack": ["ES Modules", "Playwright", "ESLint"],
        "description": "日语歌词学习主力纯前端应用：歌词/学习/混合/编辑四视图、逐字卡拉OK高亮、汉字注音、逐词分析、时间轴编辑与 .lxp 包导入导出，零运行时依赖，当前 v3.5.2，MIT 三语文档。",
        "intent": "整个歌词生态的主产品：把多音字注音、逐词分析、时间轴编辑收进一个零依赖前端，替代早年散脚本。",
        "tags": ["日语", "歌词", "前端", "活跃"],
    },
    "LyricEx Karaoke Timings": {
        "type": "cli", "language": "Python", "tech_stack": ["faster-whisper"],
        "description": "LyricEx 专用词级时间轴后端：faster-whisper 词级转写 + SequenceMatcher 对齐官方歌词，生成词级时间轴 JSON；CLI 子命令 wk-transcribe/wk-align/wk-preview/wk-fetch，hatchling 包工程化。",
        "intent": "解决旧日语歌没有词级时间轴的问题，给 LyricEx 卡拉OK高亮提供后端数据，与主产品构成前端加时间轴后端。",
        "tags": ["歌词时间轴", "whisper", "CLI", "LyricEx后端"],
    },
    "Lyrics Editor": {
        "type": "desktop", "language": "Go", "tech_stack": ["Fyne", "oto", "go-mp3"],
        "description": "Go/Fyne 跨平台 LRC 歌词编辑+播放器：歌词随音频滚动高亮、Seek、±10s 偏移、.lrc 文件关联注册，v0.1.0；24 个 .go 共约 2237 行，docs/devlog/CHANGELOG 齐备。",
        "intent": "2026-07 边学 Go 边想要个本地 LRC 卡拉OK编辑器，文档按正式首发产品规范写。",
        "tags": ["Go", "Fyne", "LRC编辑器", "桌面"],
        "notes": "根目录散落 2×24.3MB 编译 exe + .syso，未归入 build/",
    },
    "Lyrics Layout": {
        "type": "static_site", "language": "HTML/CSS", "tech_stack": [],
        "description": "21 首 BanG Dream 双栏打印歌词 HTML（日文汉字 + ruby 注音 ｜ 中文译），共享 styles.css，22 个文件约 4622 行；按萌百 Infobox 整理词曲编曲。",
        "intent": "日常给学过的日文歌做排版，整理成可打印双栏歌词册（Roselia/Raittsu 等），是排版流水线的打印落地端。",
        "tags": ["歌词排版", "双栏打印", "BanG Dream", "静态页"],
        "notes": "内含子项目 New Songs；日常歌词排版工作区",
    },
    "New Songs": {
        "type": "static_site", "language": "HTML/CSS", "tech_stack": ["BeautifulSoup"],
        "description": "Lyrics Layout 子项目：14 首 BanG Dream 歌词 HTML + merge_songs.py（BeautifulSoup 把多首合成带目录/分页的 merged.html 打印合集），16 个源文件约 2289 行。",
        "intent": "2026-03 想把新歌批量合并成一份带目录页码的可打印歌词册，merge_songs.py 是一次性合页工具。",
        "tags": ["歌词排版", "打印合集", "BeautifulSoup", "BanG Dream"],
    },
    "LYRX": {
        "type": "script", "language": "Python", "tech_stack": ["Pydantic v2", "rich", "requests"],
        "description": ".lyrx 歌词数据格式 v1.4.2-fix 的 Pydantic v2 模型 + 文件操作类 + 规格文档，4 个 .py（lyrx.py 25KB + lyrx.i18n.py 27KB + test.py 等）共约 1267 行约 85KB。",
        "intent": "2026-02 自设计机器优先、人类可读的歌词交换格式（多音字注音/和声/词级时间同步），是 LyricEx .lxp 包格式的前身。",
        "tags": ["歌词格式", "Pydantic", "LYRX", "规格"],
    },
    "MCFontPack": {
        "type": "resource", "language": "Minecraft字体资源", "tech_stack": [],
        "description": "Minecraft 字体资源包（いろはマル），assets/ + pack.mcmeta 共 3 文件约 10.2MB（1 ttf + 1 json + 1 mcmeta），pack_format=34。",
        "intent": "给 Minecraft 换成いろはマル圆体显示日文，整理成可直接加载的资源包。",
        "tags": ["Minecraft", "字体", "资源包", "日文"],
    },
    "MCN\u2018s": {
        "type": "static_site", "language": "JavaScript", "tech_stack": ["jQuery", "mobile-detect"],
        "description": "jQuery 本地图片相册站，搜索/缩放/灯箱全屏；自写 index.js 102 行 + images.js 66 行 ≈168 行（jQuery/mobile-detect 为 vendored），配 65 张 jpg。",
        "intent": "2025-10 想把本地图片做成可搜索/灯箱浏览的相册站，练 jQuery 与移动端适配。",
        "tags": ["相册", "jQuery", "静态站", "图片"],
    },
    "MouseFollower": {
        "type": "desktop", "language": "Python", "tech_stack": ["tkinter"],
        "description": "tkinter 置顶透明虚拟光标挂件，main.py 102 行，uv 工程化；build/ 为 PyInstaller 打包产物。",
        "intent": "2025-08 想要个跟随鼠标的置顶透明小挂件，练 tkinter 透明窗与置顶。",
        "tags": ["tkinter", "挂件", "桌面小工具"],
    },
    "MoviePy Project": {
        "type": "script", "language": "Python", "tech_stack": ["moviepy"],
        "description": "moviepy 长图滚动成视频脚本，main.py 27 行 + old.py 28 行 ≈55 行，input() 交互参数化，已产出 4 个 mp4 + 2 个 png。",
        "intent": "2025-10 想把超长信息图滚屏录成视频发社交平台，用 moviepy 把长图做成滚动镜头。",
        "tags": ["moviepy", "长图转视频", "媒体处理"],
        "notes": "含 old.py 旧版留存",
    },
    "MusicRush": {
        "type": "script", "language": "Python", "tech_stack": ["ffmpeg"],
        "description": "ffprobe/ffmpeg 音频批量转 mp3 脚本，main.py 73 行，带默认值回退，uv 工程化。",
        "intent": "2025-07 想把一堆 flac/m4a 批量压成 mp3，写个调 ffmpeg 的小脚本省得手动转。",
        "tags": ["ffmpeg", "音频转换", "mp3", "脚本"],
    },
    "MyDiyProjects": {
        "type": "script", "language": "Python", "tech_stack": [],
        "description": "三个独立小脚本合集：ImageCutter 切图 / ImageSplicer 拼图 / Shortcut-Creator 建快捷方式，共 3 个 .py（约 1.9KB/1.4KB/5.4KB + window.ui），配 readme.md。",
        "intent": "2023-09 起步期攒的三个随手小工具（切图/拼图/快捷方式），放一个目录统一管理。",
        "tags": ["小工具合集", "切图", "快捷方式", "Python"],
    },
    "NCM-Down": {
        "type": "cli", "language": "Python", "tech_stack": ["requests", "tqdm"],
        "description": "命令行交互式网易云下载：模糊搜索→选前 5 首→下 mp3 + .lrc + 取封面 URL，导出 Songs.js 喂前端播放器；add.py 300 + main.py 204 共 504 行 Python，已产出 mp3/lrc。",
        "intent": "2023-10 配合自建 web 歌单页批量拉歌单，finally.js 里 40+ 首歌说明当时在囤自己的 web 歌单。",
        "tags": ["网易云", "下载", "CLI", "Python"],
        "notes": "interest/main.py 与根 main.py 字节相同为重复副本；add.py 285 行为硬编码示例字符串",
    },
    "New Gaokao Score Assigner": {
        "type": "frontend", "language": "JavaScript", "tech_stack": [],
        "description": "新高考等级赋分计算纯前端工具，三语 i18n；index.html 18KB + app.js/lib.js + 约 15 个模块 JS ≈2000 行 + 6 个 CSS，README 5.9KB + ui-design-blueprint.md 46KB。",
        "intent": "2026-09 想把新高考等级赋分规则做成可输入即算的网页工具，顺手沉淀一套完整 UI 设计蓝图。",
        "tags": ["高考赋分", "前端", "计算器", "活跃"],
    },
    "NoteLab": {
        "type": "desktop", "language": "Python", "tech_stack": ["PySide6", "numpy", "sounddevice"],
        "description": "音符↔频率换算 PySide6 单文件应用：输 C4 算频率并播正弦波、反查频率到音符、A4 微调、波形绘制；main.py 195 行，NOTE_MAP 清晰。",
        "intent": "2026-03 练音乐理论与听音，做个音符频率换算与正弦波试听工具。",
        "tags": ["乐理", "PySide6", "频率换算", "音频实验"],
    },
    "PomoPlay": {
        "type": "backend", "language": "Python", "tech_stack": ["Flask", "PyYAML"],
        "description": "本地 Flask 音乐播放器 + 番茄钟：扫目录列曲、收藏/歌单/收听时长/番茄完成计数，原生 JS 前端；main.py 105 + utils.py 129 行，路由/templates/static 分层。",
        "intent": "2025-11 想边听本地 BanG Dream 边番茄工作，Server 模式开关说明想局域网投屏用。",
        "tags": ["音乐播放器", "番茄钟", "Flask", "本地"],
    },
    "PowerPointProject": {
        "type": "resource", "language": "pptx/mp4产物", "tech_stack": [],
        "description": "PPT 打字机效果演示产物目录：TypeWriter 导出的 11 个 mp4 + 4 个未完成 pptx 共约 15.9MB，无源码。",
        "intent": "2023-11 做打字机效果 PPT 演示并导出 mp4，产物集中存放；源工程未留存。",
        "tags": ["PPT", "打字机", "mp4", "产物"],
    },
    "PySnap": {
        "type": "backend", "language": "Python", "tech_stack": ["FastAPI"],
        "description": "FastAPI 本地 Python 片段执行 WebUI，AST 安全检查 + 超时保护；app.py 114 行 + utils/，README 3.1KB + MIT，static/fonts 含 16 个 MapleMono ttf。",
        "intent": "2025-12 想要个浏览器里随手跑 Python 片段的沙盒，用 FastAPI + AST 限制危险调用。",
        "tags": ["FastAPI", "Python沙盒", "WebUI", "AST"],
    },
    "Rename Files": {
        "type": "desktop", "language": "Python", "tech_stack": ["tkinter"],
        "description": "tkinter 批量重命名小工具，main.py 45 行，带取消与异常提示，功能闭环，uv 工程化。",
        "intent": "2025-07 想批量按规则重命名文件，写个带取消/异常提示的 tkinter 小窗。",
        "tags": ["批量重命名", "tkinter", "文件工具"],
    },
    "Rinkio-Lab.github.io": {
        "type": "static_site", "language": "HTML/CSS", "tech_stack": [],
        "description": "gh-pages 个人博客，纯静态 HTML/CSS/JS 自定义主题；自写 JS 约 619 行 + CSS 9.4KB，posts/ 2 篇 + diary/ 1 篇原创，vendored Materialize/highlight.js。",
        "intent": "2025-10 建 GitHub Pages 个人博客写技术笔记，自定义主题替代现成模板。",
        "tags": ["博客", "gh-pages", "静态站", "个人主页"],
    },
    "Simple Music Player": {
        "type": "desktop", "language": "Python", "tech_stack": ["PyQt5", "qfluentwidgets"],
        "description": "PyQt5/qfluentwidgets 音乐播放器 UI 外壳草稿，main.py 91 行：CommandBar/Slider/关闭确认已接线，但 loadMusic() 空体、播放按钮全是 lambda: print() 占位。",
        "intent": "2023-11 起步期练 qfluentwidgets 组件，先把播放器 UI 外壳搭出来，播放逻辑没接。",
        "tags": ["音乐播放器", "PyQt5", "UI外壳", "草稿"],
        "notes": "UI 外壳草稿，无播放逻辑",
    },
    "SimpleSolarSystem": {
        "type": "learning", "language": "Python", "tech_stack": ["PySide6"],
        "description": "PySide6 行星轨道动画 + 点击弹窗教学 demo，main.py 140 行 + planets.json 1994B 数据，功能闭环。",
        "intent": "2025-08 练 PySide6 动画与事件，做个可点行星看详情的太阳系小演示。",
        "tags": ["PySide6", "太阳系", "动画", "教学"],
    },
    "SRT-Shift": {
        "type": "desktop", "language": "Python", "tech_stack": ["tkinter", "pysrt"],
        "description": "SRT 时间轴整体偏移 tkinter GUI：多选文件 + 输入毫秒数 → 输出 *_shifted.srt；pysrt + tkinter，main.py 约 41 行，多选/偏移/输出闭环。",
        "intent": "2025-10 给字幕/歌词整体对时间轴（音画/口型同步），把裸 srt.py 升级成 GUI 多选版。",
        "tags": ["字幕", "SRT", "时间偏移", "tkinter"],
        "notes": "README 0 字节空壳",
    },
    "SRT-Tools": {
        "type": "cli", "language": "Python", "tech_stack": ["questionary", "srt"],
        "description": "SRT 歌词/字幕命令行工具箱，questionary 交互打印纯文本/带时间轴、导出 TXT；main.py 30 行 + utils 三文件约 40 行，README 明示更多功能开发中。",
        "intent": "2025-09 字幕工具期起点，想把 SRT 处理收进统一 CLI 工具箱，按长期项目做。",
        "tags": ["字幕", "SRT", "CLI", "questionary"],
    },
    "Subtitle Manager": {
        "type": "desktop", "language": "Python", "tech_stack": ["PySide6", "ffmpeg"],
        "description": "字幕轨道查看器 PySide6 GUI：拖放视频→ffprobe 扫描内嵌字幕轨→ffmpeg 提取为 srt/ass/vtt；main.py 395 行（17KB），QThread 异步 + 拖放 + 异常分类。",
        "intent": "2026-07 想从视频里抠内嵌字幕轨做歌词/字幕素材，把 FFmpeg 检测与提取工程化。",
        "tags": ["字幕提取", "FFmpeg", "PySide6", "GUI"],
        "notes": "残留 638MB .venv 待清理；README 空",
    },
    "Tategaki Sample": {
        "type": "frontend", "language": "HTML/CSS", "tech_stack": [],
        "description": "竖排日文横滚平滑阅读实验页，index.html 56 行含自写日文短篇星屑の手紙全文，script.js 130 行做惯性物理/防抖/spacer 自适应，另带 23 个 ttf 日文字体。",
        "intent": "2025-11 想做竖排日文像看书一样横滚滑动的阅读体验，练惯性滚动物理。",
        "tags": ["竖排日文", "阅读实验", "前端", "日语"],
    },
    "Tea Project Manager": {
        "type": "backend", "language": "Go", "tech_stack": ["gin"],
        "status_override": "进行中",
        "description": "个人项目管理器（Tea PM 2.0）重构中：Go + gin 后端 + 原生 JS Web UI，统一管理 E:\\Projects 全部项目。",
        "intent": "旧版 Python 三语 i18n CLI 的全面升级：从命令行工具演进为本地 Web UI + 分布式 .teaproject 配置的项目管理器。",
        "tags": ["项目管理", "Go", "Web UI", "重构"],
        "notes": "旧版 Python 三语 i18n CLI 已打包 build/main.exe；当前为 2.0 重构分支",
    },
    "TextDiff.Python": {
        "type": "cli", "language": "Python", "tech_stack": [],
        "description": "命令行文本对比工具，main.py 51 行 + diff_run.py 28 行 = 79 行，README 1.6KB + MIT License + diff-preview.png 截图。",
        "intent": "2025-08 想要个终端里快速 diff 两段文本的小工具，顺手补全 README 与 MIT。",
        "tags": ["文本对比", "diff", "CLI", "Python"],
    },
    "TF-Card Music Manager": {
        "type": "script", "language": "Python", "tech_stack": [],
        "description": "TF 卡音乐管理工具集：封面清理/歌词管理/MP3 压缩/文件列表合并，7 个 .py 共约 863 行（clean_mp3_cover/lrc_man/mp3_compressor 等），另产出 90 个 .txt 列表。",
        "intent": "2026-08 管理 TF 卡随身听里的 MyGO/Ave Mujica 曲目，持续产出歌词列表并清理封面/压缩 MP3。",
        "tags": ["TF卡", "音乐管理", "歌词列表", "Python"],
    },
    "Time Countdown": {
        "type": "desktop", "language": "Python", "tech_stack": ["PyQt5", "tkinter"],
        "description": "2023 年小型倒计时器，main.py 98 行 + time_.py 17 行 = 115 行，PyQt5 与 tkinter 混用，main.ui 为 Qt Designer 界面，info.json 配置。",
        "intent": "2023-11 起步期练 Qt Designer 与倒计时，一个小窗里同时用了 PyQt5 和 tkinter。",
        "tags": ["倒计时", "PyQt5", "2023旧", "小工具"],
    },
    "VideoPlayerWeb": {
        "type": "frontend", "language": "JavaScript", "tech_stack": ["HTML5"],
        "description": "自定义 HTML5 视频播放器页面，index.html 135 行完整控制栏 + scripts.js + styles.css，支持倍速/截图/循环/主题切换/全屏，IIFE 封装。",
        "intent": "2026-02 想摆脱浏览器原生播放器的简陋控制栏，自做一个带倍速/截图/主题的网页播放器。",
        "tags": ["视频播放器", "HTML5", "前端", "自定义控件"],
    },
    "YTDown": {
        "type": "desktop", "language": "Python", "tech_stack": ["tkinter", "ctypes"],
        "description": "tkinter GUI 包 yt-dlp：ctypes 读剪贴板预填 URL，选画质（最高/1080p/720p/仅音频）+ 输出格式（mp4/mkv/webm/mp3）+ 指定 yt-dlp.exe 路径，subprocess 调下载；main.py 113 行。",
        "intent": "2025-07 uv 工程化首秀，想用黑底 tkinter GUI 给自己包一层 yt-dlp 方便下 YouTube。",
        "tags": ["yt-dlp", "tkinter", "下载", "GUI"],
        "notes": "README 0 字节空壳；建议与 Easy YT-DLP 合并",
    },
}


# ---------------------------------------------------------------------------
# 磁盘枚举
# ---------------------------------------------------------------------------
def list_target_projects():
    """返回 [(磁盘绝对路径, 叶子名), ...]。顶层非_目录 + 嵌套 New Songs。"""
    out = []
    for e in sorted(os.scandir(PROJECTS_ROOT), key=lambda x: x.name.lower()):
        if not e.is_dir():
            continue
        if e.name.startswith("_"):
            continue
        out.append((e.path, e.name))
    for rel in NESTED_PROJECTS:
        p = os.path.join(PROJECTS_ROOT, rel)
        out.append((p, os.path.basename(p)))
    return out


# ---------------------------------------------------------------------------
# YAML 组装（按设计稿 §3 字段顺序；用 PyYAML 校验可解析）
# ---------------------------------------------------------------------------
def dq(s):
    """双引号安全标量（JSON 风格，UTF-8 不转义）。"""
    return json.dumps(s, ensure_ascii=False)


def flow_list(items):
    return "[" + ", ".join(dq(i) if _needs_quote(i) else i for i in items) + "]"


def _needs_quote(s):
    # 含空格/冒号/井号等需在 flow 里加引号的项
    return (" " in s) or (":" in s) or ("#" in s) or ("，" in s) or ("、" in s)


def build_record(path, name, inv, ov):
    category = derive_category(inv.get("归属分类", ""))
    status = ov.get("status_override", inv.get("完成状态", "无法判断"))
    quality = inv.get("质量评级", "无法判断")
    rec = {
        "name": name,
        "path": path,           # 磁盘真实路径，反斜杠原样
        "type": ov["type"],
        "category": category,
        "language": ov["language"],
        "status": status,
        "quality": quality,
        "description": ov["description"],
        "intent": ov["intent"],
        "tags": ov["tags"],
        "ai": True,
    }
    tech = ov.get("tech_stack") or []
    return rec, tech, ov.get("notes")


def render_yaml(rec, tech, notes):
    lines = []
    lines.append("# ---- 标识区（手写，扫描器不覆盖）----")
    lines.append(f"name: {dq(rec['name'])}")
    lines.append(f"path: {rec['path']}")          # 路径纯标量，反斜杠原样
    lines.append(f"type: {rec['type']}")
    lines.append(f"category: {dq(rec['category'])}")
    lines.append(f"language: {rec['language']}")
    if tech:
        lines.append(f"tech_stack: {flow_list(tech)}")
    lines.append(f"status: {rec['status']}")
    lines.append(f"quality: {rec['quality']}")
    lines.append(f"description: {dq(rec['description'])}")
    lines.append(f"intent: {dq(rec['intent'])}")
    lines.append(f"tags: {flow_list(rec['tags'])}")
    lines.append("ai: true")
    lines.append("")
    lines.append("# ---- 自动区（每次 scan 刷新）----")
    lines.append("# last_active / created / code_files / code_size_kb / total_size_mb / git / deps")
    lines.append("# （种子阶段不写，由首次 tea scan 刷新填充）")
    lines.append("")
    lines.append("# ---- 操作与备注（手写）----")
    if notes:
        lines.append(f"notes: {dq(notes)}")
    else:
        lines.append("# notes: \"\"")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args()

    inv = load_inventory(INVENTORY)
    targets = list_target_projects()

    results = []          # (path, leaf, record_yaml, inv_row)
    skipped_no_inv = []
    for path, leaf in targets:
        ov = OVERRIDES.get(leaf)
        if ov is None:
            skipped_no_inv.append((path, leaf, "覆盖表缺该项目"))
            continue
        row = inv.get(norm(path))
        if row is None:
            skipped_no_inv.append((path, leaf, "盘点清单无对应行"))
            continue
        rec, tech, notes = build_record(path, row["名称"], row, ov)
        yaml_text = render_yaml(rec, tech, notes)
        # 校验：可被 yaml 库解析
        parsed = yaml.safe_load(yaml_text)
        assert parsed["path"] == path, f"path round-trip 失败: {parsed['path']} != {path}"
        results.append((path, leaf, rec, yaml_text))

    print(f"目标项目数: {len(targets)}  生成: {len(results)}  跳过: {len(skipped_no_inv)}")
    for p, l, why in skipped_no_inv:
        print(f"  [跳过] {p}  ({why})")

    if args.dry_run:
        os.makedirs(os.path.dirname(DRY_RUN_MD), exist_ok=True)
        with open(DRY_RUN_MD, "w", encoding="utf-8") as f:
            f.write("# 种子 dry-run 预览（2026-10-03）\n\n")
            f.write(f"共 {len(results)} 个项目。每份 YAML 均已通过 yaml.safe_load 解析与 path 反查校验。\n\n")
            f.write("> 以下为各项目 .teaproject 的完整内容预览。\n\n---\n\n")
            for path, leaf, rec, yt in results:
                f.write(f"## {rec['name']}\n\n`{path}`\n\n```yaml\n{yt}```\n\n")
        print(f"dry-run 已写出: {DRY_RUN_MD}")
    else:
        written = []
        for path, leaf, rec, yt in results:
            out = os.path.join(path, ".teaproject")
            # UTF-8 无 BOM
            with open(out, "w", encoding="utf-8", newline="\n") as f:
                f.write(yt)
            written.append(out)
        print(f"已写入 {len(written)} 个 .teaproject")
        for w in written:
            print("  " + w)


if __name__ == "__main__":
    main()
