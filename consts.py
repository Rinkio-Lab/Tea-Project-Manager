from pathlib import Path


MANIFEST_FILE_NAME: str = ".teaproject"
PROJECTS_DIRECTORY: Path = Path("E:/Projects/DebugFolder")

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
