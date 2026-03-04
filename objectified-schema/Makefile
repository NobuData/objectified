VENV_DIR := .venv
VENV_BIN := $(VENV_DIR)/bin

.PHONY: venv install test clean

venv:
	python3 -m venv $(VENV_DIR)
	$(VENV_BIN)/pip install --upgrade pip
	$(VENV_BIN)/pip install -r requirements.txt

install: venv

test: venv
	$(VENV_BIN)/python3 -m pytest

clean:
	rm -rf $(VENV_DIR) .pytest_cache __pycache__ tests/__pycache__
