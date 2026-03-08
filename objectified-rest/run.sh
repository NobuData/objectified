#!/usr/bin/env sh
#
# Runs the server with default port 8000

uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
