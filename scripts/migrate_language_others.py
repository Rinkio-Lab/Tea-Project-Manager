# -*- coding: utf-8 -*-
"""
Tea PM 2.0 — language 字段 Others 归类直改（2026-10-03）

只改 59 份 .teaproject 的 language 字段：
  - 代码语言白名单内的值（按 / 拆分后全部命中）保留；
  - 非代码类（资源/发布包/素材/字体包/产物）一律改为 Others。
其余字段、字段顺序、注释结构一字不动；UTF-8 无 BOM。

用法：
  python migrate_language_others.py --apply     # 真改
  python migrate_language_others.py              # dry-run，只打印不写
"""
import argparse
import pathlib

import yaml

ROOT = pathlib.Path(r"E:\Projects")
SELF = pathlib.Path(r"E:\Projects\Tea Project Manager")
REPORT = SELF / "docs" / "others-migration-2026-10-03.md"

# 代码语言白名单（小写）
CODE = {
    "python", "javascript", "go", "html", "css", "typescript", "astro",
    "java", "c", "c++", "c#", "rust", "ruby", "php", "kotlin", "swift",
    "shell", "batch",
}


def collect_files():
    fs = sorted(ROOT.glob("*/.teaproject"))
    fs.append(ROOT / "Lyrics Layout" / "New Songs" / ".teaproject")
    return fs


def is_code(lang: str) -> bool:
    parts = [p.strip().lower() for p in str(lang).split("/")]
    return bool(parts) and all(p in CODE for p in parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    changed, kept = [], []
    for f in collect_files():
        text = f.read_text(encoding="utf-8")
        lang = yaml.safe_load(text).get("language", "")
        if is_code(lang):
            kept.append((f.parent.name, lang))
            continue
        # 需要改为 Others：仅替换 language 这一行
        old_line = f"language: {lang}\n"
        new_line = "language: Others\n"
        assert old_line in text, f"未找到 language 行: {f}"
        new_text = text.replace(old_line, new_line, 1)
        changed.append((f.parent.name, lang, "Others"))
        if args.apply:
            f.write_text(new_text, encoding="utf-8", newline="\n")

    mode = "APPLIED" if args.apply else "DRY-RUN"
    print(f"[{mode}] 改 {len(changed)} 份, 未改 {len(kept)} 份")
    for name, old, new in changed:
        print(f"  {name}: {old} -> {new}")

    if args.apply:
        lines = [
            "# language → Others 归类迁移报告（2026-10-03）",
            "",
            f"- 判定规则：language 按 `/` 拆分后全部命中代码白名单（Python/JavaScript/Go/HTML/CSS/TypeScript/Astro/Java/C/C++/C#/Rust/Ruby/PHP/Kotlin/Swift/Shell/Batch）则保留；否则改 `Others`。",
            f"- **改动 {len(changed)} 份，未改 {len(kept)} 份**（共 {len(changed)+len(kept)} 份）。",
            "- 仅改 language 这一行，其余字段/顺序/注释未动；UTF-8 无 BOM。",
            "",
            "| 项目名 | 原 language | 新 language |",
            "|---|---|---|",
        ]
        for name, old, new in changed:
            lines.append(f"| {name} | {old} | {new} |")
        lines += ["", "## 未改（代码类，保留原 language）", "", "| 项目名 | language |", "|---|---|"]
        for name, lang in kept:
            lines.append(f"| {name} | {lang} |")
        REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        print(f"报告: {REPORT}")


if __name__ == "__main__":
    main()
