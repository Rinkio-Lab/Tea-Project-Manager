import gettext
import locale
import argparse
from pathlib import Path
import shutil
import subprocess
import questionary
from rich.console import Console
from rich.traceback import install as install_rich_traceback

from utils import *
from consts import *

# 初始化 rich traceback
install_rich_traceback(show_locals=True)
console = Console()

# 设置 i18n 语言
LANGUAGE = "zh_CN"

if LANGUAGE == "AUTO":
    LANGUAGE = locale.getdefaultlocale()[0]
    print(f"⚠ 自动检测语言: {LANGUAGE}")

# 确保 LANGUAGE 不是 None
if LANGUAGE is None:
    LANGUAGE = "en_US"

LOCALE_DIR = Path(__file__).parent / "locales"

try:
    t = gettext.translation("messages", localedir=LOCALE_DIR, languages=[str(LANGUAGE)])
    _ = t.gettext
except FileNotFoundError:
    print("⚠ 翻译文件未找到，使用默认语言")
    _ = gettext.gettext


SUPPORTED_PROJECT_TYPES: dict[str, str] = {
    "empty": _("project_type.empty"),
    "web": _("project_type.web"),
    "python": _("project_type.python"),
}


def initial_project_manifest(
    project_path: Path,
    project_name: str,
    project_type: str,
    description: str,
    need_readme: bool,
) -> None:
    """初始化 Manifest 文件"""
    manifest = {
        "name": project_name,
        "type": project_type,
        "description": description,
        "readme": need_readme,
    }
    try:
        write_yaml_file(str(project_path / MANIFEST_FILE_NAME), manifest)
        console.print(_("success.manifest_written", file=str(MANIFEST_FILE_NAME)))  # type: ignore
    except Exception as e:
        console.print(f"[red]✘ {_('error.write_manifest_failed')}[/red] {e}")


def create_python_template(project_path: Path) -> None:
    """初始化 Python 项目模板"""
    uv_path = shutil.which("uv")
    if uv_path is None:
        console.print(f"[yellow]⚠ {_('warn.uv_missing')}[/yellow]")
        (project_path / "main.py").write_text("# Your Python code goes here\n")
        return
    console.print(f"[blue]→ {_('info.uv_found')}: {uv_path}[/blue]")
    console.print(f"[blue]→ {_('info.running_uv')}[/blue]")
    subprocess.run(["uv", "init"], cwd=project_path, check=True)
    subprocess.run(["uv", "sync"], cwd=project_path, check=True)


def create_web_template(project_path: Path) -> None:
    """初始化 Web 项目模板"""
    template_dir = Path.cwd() / "templates" / "web"
    if template_dir.exists():
        shutil.copytree(template_dir, project_path, dirs_exist_ok=True)
    else:
        console.print(_("warn.template_not_found", path=str(template_dir)))  # type: ignore


def initial_project_template(project_path: Path, project_type: str) -> None:
    """根据项目类型初始化模板"""
    try:
        match project_type:
            case "python":
                create_python_template(project_path)
            case "web":
                create_web_template(project_path)
            case "empty":
                pass
            case _:
                console.print(_("warn.unsupported_type", type=project_type)) # type: ignore
                return

        console.print(_("success.template_initialized"))
        console.print(f"[bold]{_('success.next_steps')}[/bold]")
        console.print(f"  [cyan]cd {project_path}[/cyan]")
        console.print("  [cyan]code .[/cyan]")
        console.print(f"[bold green]{_('success.project_done')}[/bold green]")
    except Exception as e:
        console.print(f"[red]✘ {_('error.template_failed')}[/red] {e}")


def initial_readme(project_path: Path, project_name: str, description: str) -> None:
    """生成 README.md"""
    try:
        readme_path = project_path / "README.md"
        readme_path.write_text(
            README_TEMPLATE.format(
                project_name=project_name, project_description=description
            ),
            encoding="utf-8",
        )
        console.print(_("success.readme_created"))
    except Exception as e:
        console.print(f"[red]✘ {_('error.readme_failed')}[/red] {e}")


def select_project_type() -> str | None:
    """用户选择项目类型"""
    type_label = questionary.select(
        _("prompt.project_type"),
        choices=list(SUPPORTED_PROJECT_TYPES.values()),
    ).ask()
    return next(
        (k for k, v in SUPPORTED_PROJECT_TYPES.items() if v == type_label), None
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Tea Project Manager CLI")
    parser.add_argument("path", nargs="?", default=None, help=_("arg.path_help"))
    parser.add_argument("--new", action="store_true", help=_("arg.new_help"))

    args = parser.parse_args()

    if args.path:
        base_path = Path(args.path).resolve()
        project_name = questionary.text(_("prompt.project_name")).ask()
        if not project_name:
            console.print(f"[red]✘ {_('error.no_project_name')}[/red]")
            return

        final_path = (
            base_path / project_name if args.new else base_path
        )
        description = (
            questionary.text(_("prompt.project_description")).ask()
            or "No description provided."
        )
        project_type = select_project_type()
        if not project_type:
            console.print(f"[red]✘ {_('error.no_project_type')}[/red]")
            return

        need_readme = questionary.confirm(_("prompt.need_readme")).ask()
        final_path.mkdir(parents=True, exist_ok=True)
        initial_project_manifest(
            final_path, project_name, project_type, description, need_readme
        )
        initial_project_template(final_path, project_type)
        if need_readme:
            initial_readme(final_path, project_name, description)
    else:
        console.print(f"[bold cyan]{_('app.title')}[/bold cyan]")
        console.print(f"{_('app.byline')}")
        console.print("")

        project_name = questionary.text(_("prompt.project_name")).ask()
        if not project_name:
            console.print(f"[red]✘ {_('error.no_project_name')}[/red]")
            return

        description = (
            questionary.text(_("prompt.project_description")).ask()
            or "No description provided."
        )
        project_type = select_project_type()
        if not project_type:
            console.print(f"[red]✘ {_('error.no_project_type')}[/red]")
            return

        need_readme = questionary.confirm(_("prompt.need_readme")).ask()
        project_path = create_project_dir(project_name)
        initial_project_manifest(
            project_path, project_name, project_type, description, need_readme
        )
        initial_project_template(project_path, project_type)
        if need_readme:
            initial_readme(project_path, project_name, description)
            
    print(_("success.processing_complete"))


if __name__ == "__main__":
    main()
