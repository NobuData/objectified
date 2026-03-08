#!/usr/bin/env python3
"""
Generate OpenAPI Specification 3.2.0 from the objectified-rest FastAPI app.

Run from the objectified-rest directory:
    uv run python scripts/generate_openapi.py

Always writes openapi/openapi.json. Also writes openapi/openapi.yaml when
PyYAML is installed (uv sync --group dev).
"""

import json
import sys
from pathlib import Path

# Ensure src is on path so app can be imported
project_root = Path(__file__).resolve().parent.parent
src = project_root / "src"
if str(src) not in sys.path:
    sys.path.insert(0, str(src))

from app.main import app


def main() -> None:
    spec = app.openapi()
    assert spec.get("openapi") == "3.2.0", f"Expected openapi 3.2.0, got {spec.get('openapi')}"

    out_dir = project_root / "openapi"
    out_dir.mkdir(exist_ok=True)

    json_path = out_dir / "openapi.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2, default=str)
    print(f"Wrote {json_path}")

    try:
        import yaml
        yaml_path = out_dir / "openapi.yaml"
        with open(yaml_path, "w", encoding="utf-8") as f:
            yaml.dump(
                spec,
                f,
                sort_keys=False,
                default_flow_style=False,
                allow_unicode=True,
            )
        print(f"Wrote {yaml_path}")
    except ImportError:
        print("Install pyyaml (uv sync --group dev) to generate openapi.yaml")


if __name__ == "__main__":
    main()
