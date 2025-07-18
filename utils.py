from pathlib import Path
import yaml

from consts import *


def normalize_file_name(file_name: str) -> str:
    """
    Normalizes a file name by replacing spaces with underscores and converting to lowercase.
    
    Args:
        file_name (str): The original file name.
    
    Returns:
        str: The normalized file name.
    """
    return file_name.replace(" ", "_").lower()

def write_yaml_file(file_path: str, data: dict) -> None:
    """
    Writes a dictionary to a YAML file.
    
    Args:
        file_path (str): The path where the YAML file will be saved.
        data (dict): The data to write to the YAML file.
    """
    with open(file_path, 'w') as file:
        yaml.dump(data, file, default_flow_style=False)


def create_project_dir(project_name: str | Path) -> Path:
    """创建项目根目录"""
    path = (
        PROJECTS_DIRECTORY / project_name
        if isinstance(project_name, str)
        else project_name
    )
    path.mkdir(parents=True, exist_ok=True)
    return path


