# config_manager.py
from pathlib import Path
import yaml
import locale
from consts import APP_CONFIG_TEMPLATE

CONFIG_PATH = Path(__file__).parent / "config.yaml"


def load_config() -> dict:
    """加载整个配置文件为 dict"""
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as file:
            return yaml.safe_load(file) or {}
    else:
        save_config(APP_CONFIG_TEMPLATE)
        return APP_CONFIG_TEMPLATE.copy()


def get_config_value(key: str, default: str = "") -> str:
    """获取配置项"""
    config = load_config()
    return config.get(key, default)


def set_config_value(key: str, value: str) -> None:
    """设置配置项并保存"""
    config = load_config()
    config[key] = value
    save_config(config)


def save_config(config: dict) -> None:
    """保存整个配置 dict 到文件"""
    # 打开配置文件，以写入模式打开，编码为utf-8
    with open(CONFIG_PATH, "w", encoding="utf-8") as file:
        yaml.dump(config, file)
