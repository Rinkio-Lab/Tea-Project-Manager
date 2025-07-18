from pathlib import Path
from typing import Any

# === 基础路径常量 ===
MANIFEST_FILE_NAME: str = ".teaproject"

# === 默认配置模板 ===
APP_CONFIG_TEMPLATE: dict[str, Any] = {
    "LANGUAGE": "AUTO",  # 自动检测语言
    "PROJECTS_DIRECTORY": str(
        Path.home() / "Projects"
    ),  # 用户主目录下的 Projects 文件夹
}


# === README 模板 ===
README_TEMPLATE: str = """# {project_name}

## Description

{project_description}

---

## Features

- Feature 1
- Feature 2
- Feature 3

---

## Installation

```bash
git clone https://github.com/yourusername/{project_name}.git
cd {project_name}
uv pip install -r requirements.txt
python main.py
```

---

## Usage

```bash
python main.py
```

---

## Project Structure

```
{project_name}/
├── README.md
└── main.py
```

---

## Dependencies

- uv
- other-library-name

---

## Contributing

Pull requests are welcome!

---

## License

MIT License
"""
