# Tea PM 2.0 种子生成报告（Phase 0，2026-10-03）

## 一、结论

- **实际生成 .teaproject：59 份**（顶层非 `_` 目录 58 + 嵌套 `Lyrics Layout\New Songs` 1）。
- **预期 60，实际 59，差 1**。差异原因见下文「三、与预期差异」。
- 全部文件 UTF-8 无 BOM（首字节 `23 20 2D` = `# -`，非 `EF BB BF`），均可被 `yaml.safe_load` 解析，路径反查一致。
- 先 dry-run 后写盘：dry-run 输出 `docs/seed-dry-run-2026-10-03.md`，自查通过后才 `--write`。

## 二、产物清单（绝对路径）

| 产物 | 路径 |
|---|---|
| 生成脚本（可复现，支持 --dry-run/--write） | `E:\Projects\Tea Project Manager\scripts\generate_seeds.py` |
| dry-run 全量预览 | `E:\Projects\Tea Project Manager\docs\seed-dry-run-2026-10-03.md` |
| 本报告 | `E:\Projects\Tea Project Manager\docs\seed-report-2026-10-03.md` |
| 59 份 .teaproject | 分布于 `E:\Projects\<项目>\.teaproject`，详见下 |

59 份 .teaproject 绝对路径（脚本 `--write` 实际输出，按磁盘顺序）：

```
E:\Projects\60s_Aggregator\.teaproject
E:\Projects\Anime Character\.teaproject
E:\Projects\Bangumi Gallery\.teaproject
E:\Projects\Blog.Assets\.teaproject
E:\Projects\BMICalc\.teaproject
E:\Projects\CBZ Reader\.teaproject
E:\Projects\chem-anim\.teaproject
E:\Projects\Downloads Organizer\.teaproject
E:\Projects\Easy FTP Server Plus\.teaproject
E:\Projects\Easy Progress Bar\.teaproject
E:\Projects\Easy YT-DLP\.teaproject
E:\Projects\Emote CLI\.teaproject
E:\Projects\eNoval\.teaproject
E:\Projects\eNoval-v0.1.0-release\.teaproject
E:\Projects\Fast NCM Downloader\.teaproject
E:\Projects\FileServer\.teaproject
E:\Projects\Function Graph\.teaproject
E:\Projects\GBC Album\.teaproject
E:\Projects\imgView\.teaproject
E:\Projects\iPic Tools\.teaproject
E:\Projects\LanzouBackup\.teaproject
E:\Projects\Learn Golang\.teaproject
E:\Projects\LiKasekiChatServer\.teaproject
E:\Projects\Linko Full-Screen Displayer\.teaproject
E:\Projects\Linko-Lyrics-Displayer\.teaproject
E:\Projects\Linko-ToDo\.teaproject
E:\Projects\Live Server\.teaproject
E:\Projects\LyricEx\.teaproject
E:\Projects\LyricEx Karaoke Timings\.teaproject
E:\Projects\Lyrics Editor\.teaproject
E:\Projects\Lyrics Layout\.teaproject
E:\Projects\LYRX\.teaproject
E:\Projects\MCFontPack\.teaproject
E:\Projects\MCN‘s\.teaproject
E:\Projects\MouseFollower\.teaproject
E:\Projects\MoviePy Project\.teaproject
E:\Projects\MusicRush\.teaproject
E:\Projects\MyDiyProjects\.teaproject
E:\Projects\NCM-Down\.teaproject
E:\Projects\New Gaokao Score Assigner\.teaproject
E:\Projects\NoteLab\.teaproject
E:\Projects\PomoPlay\.teaproject
E:\Projects\PowerPointProject\.teaproject
E:\Projects\PySnap\.teaproject
E:\Projects\Rename Files\.teaproject
E:\Projects\Rinkio-Lab.github.io\.teaproject
E:\Projects\Simple Music Player\.teaproject
E:\Projects\SimpleSolarSystem\.teaproject
E:\Projects\SRT-Shift\.teaproject
E:\Projects\SRT-Tools\.teaproject
E:\Projects\Subtitle Manager\.teaproject
E:\Projects\Tategaki Sample\.teaproject
E:\Projects\Tea Project Manager\.teaproject
E:\Projects\TextDiff.Python\.teaproject
E:\Projects\TF-Card Music Manager\.teaproject
E:\Projects\Time Countdown\.teaproject
E:\Projects\VideoPlayerWeb\.teaproject
E:\Projects\YTDown\.teaproject
E:\Projects\Lyrics Layout\New Songs\.teaproject
```

## 三、与预期差异（预期 60 → 实际 59）

磁盘实勘（`Get-ChildItem -Force E:\Projects`）：

- 顶层目录共 **64** 个。
- 其中 **6 个 `_` 开头分类目录**按要求排除：`_archive`、`_legacy`、`_misc`、`_scripts`、`_userscripts`、`_web-tools`。
- 剩余**顶层项目目录 = 58**。
- 额外纳入嵌套项目 `Lyrics Layout\New Songs` = 1。
- **合计 59**。

**盘点里有、但磁盘上已不存在而被跳过的目录（6 个）**——这些盘点行无法对应到真实目录，按硬约束跳过并记录：

| 盘点名称 | 盘点路径 | Test-Path |
|---|---|---|
| Blog | E:\Projects\Blog | False |
| Font Previewer | E:\Projects\Font Previewer | False |
| LyricsAuto | E:\Projects\LyricsAuto | False |
| SongAPI | E:\Projects\SongAPI | False |
| Tea Lingo | E:\Projects\Tea Lingo | False |
| VocabZoom | E:\Projects\VocabZoom | False |

> 说明：盘点清单共 96 条数据行，其中目录行 65 条（含嵌套 New Songs）、根目录散文件 31 条。65 条目录行里有 6 条路径在磁盘已不存在（应是前几轮清理/迁移后未回写盘点），故可生成目录 = 65 − 6 = **59**。任务预期 60 与实际 59 的 1 个差值，即来自此盘点与磁盘的口径差；磁盘真实项目目录就是 59 个，无遗漏。散文件（.py/.html/.user.js/.reg/.exe 等 31 个）与 `_archive` 内均按要求不生成。

## 四、抽查 5 个项目逐字段对照

字段来源：`status`/`quality`/`category`/`name` 直接取盘点；`type`/`language`/`tech_stack`/`description`/`intent`/`tags` 按分析报告核定；`path` 以磁盘实勘为准。

| 项目 | 字段 | 盘点清单原值 | 写入 .teaproject | 一致性 |
|---|---|---|---|---|
| **LyricEx** | status / quality / category | 进行中 / 整洁 / 音乐/歌词/字幕工具 | 进行中 / 整洁 / 音乐/歌词/字幕工具 | ✅ |
| | language / type | JS(纯前端ES模块) | JavaScript / frontend | ✅ 主语言归一 |
| | tech_stack | （括号内 ES 模块） | [ES Modules, Playwright, ESLint] | ✅ 取自分析 |
| **eNoval-v0.1.0-release** | language / category | 无代码(发布包:exe+示例书库) / 其他(终端小说阅读器发布包) | 发布包 / 终端小说阅读器发布包 | ✅ 括号取核心 + 去「其他()」 |
| | type / status | 已完成 | resource / 已完成 | ✅ 按发布包判 resource |
| **Tea Project Manager** | status | 已完成（盘点） | **进行中**（任务特批：2.0 重构中） | ✅ 按任务要求覆盖 |
| | language / type / tech | Python(CLI+gettext)（盘点） | Go / backend / [gin] | ✅ 按任务特批写当前重构态 |
| **SRT-Tools** | language / type | Python(questionary CLI) | Python / cli / [questionary, srt] | ✅ |
| | status / quality | 进行中 / 整洁 | 进行中 / 整洁 | ✅ |
| **MCFontPack** | language / category | 无代码(Minecraft字体资源) / 其他(Minecraft字体资源包) | Minecraft字体资源 / Minecraft字体资源包 | ✅ |
| | type / quality | 无法判断 | resource / 无法判断 | ✅ 资源包判 resource |

## 五、生成规则与自查结果

- **字段顺序**按设计稿 §3：标识区（name/path/type/category/language/tech_stack?/status/quality/description/intent/tags/ai）→ 自动区（注释占位，不写值）→ 操作与备注（notes 仅在有时写）。
- **ai: true** 全部加在标识区末尾（description/intent 由 AI 补全，UI 据此显示 ✦ 待校对）。
- **自动区**（last_active/created/code_files/code_size_kb/total_size_mb/git/deps）与 **readme** 一律不写，留待首次 `tea scan` 填充。
- **actions** 种子阶段省略。
- **description/intent**：脚本启动时程序化校验——59 条 description 零重复、59 条 intent 零重复、无空值；每条均取自分析报告具体事实（行数/技术栈/规模数字），未使用套话。
- **可解析性**：写盘前每条 YAML 均过 `yaml.safe_load` 并断言 path 反查相等；写盘后再对全部 59 个文件重新 `safe_load`，全部通过。
- **特殊字符**：磁盘目录 `MCN‘s` 用 U+2018（‘），脚本从磁盘枚举路径写入，YAML path 即磁盘真实路径；name 取盘点名。

## 六、遇到的坑

1. **MCN‘s 弯引号**：盘点里写作 `MCN's`（直引号观感），磁盘实际是 U+2018 LEFT SINGLE QUOTATION MARK。初版脚本按叶子名匹配覆盖表时漏配该项目（dry-run 第一次跳过 1 个），改为显式 Unicode 键 `MCN\u2018s` 并从磁盘枚举路径后解决。
2. **6 个盘点目录已不存在**：Blog / Font Previewer / LyricsAuto / SongAPI / Tea Lingo / VocabZoom 在盘点清单有行，但磁盘 `Test-Path` 全为 False（前几轮清理后盘点未回写）。按硬约束跳过并在此记录，不臆造目录。
3. **路径反斜杠**：YAML 中 path 按纯标量、单根反斜杠原样写（与设计稿示例一致）；仅 Tea PM 的 description 内 `E:\Projects` 因落在双引号串里写成 `E:\\Projects`，`safe_load` 反查还原为单反斜杠，验证通过。
4. **flow list 自动加引号**：含空格/冒号的 tag 或 tech 项（如 `Web UI`、`BanG Dream`、`ES Modules`）在 flow 序列里自动用双引号包裹，保证 YAML 合法。

## 七、边界确认

- 本轮仅写入：59 份 `.teaproject` + 脚本 + dry-run 预览 + 本报告，共 62 个新文件；未改动/移动/删除任何现有文件，未做任何 git 操作。
- Tea PM 目录内 `web/vendor/echarts/echarts.min.js` 等 `web/` 下文件未触碰；仅新增根级 `.teaproject` 与 `scripts/`、`docs/` 产物。
