default: check

init:
    uv sync --group dev

build:
    uv build --all-packages

test:
    uv run pytest

lint:
    uv run ruff check .

fmt:
    uv run ruff format .

typecheck:
    uv run ty check libs apps

check: fmt lint test

# broadcast CLI, e.g. `just run list`
run *args="":
    uv run broadcast {{args}}

mcp:
    uv run broadcast-mcp
