#!/usr/bin/env bash

echo "===== CURRENT PATH ====="
pwd
echo

echo "===== TOP-LEVEL FILES ====="
ls -lah
echo

echo "===== FOLDER TREE (depth=4) ====="
find . -maxdepth 4 -type d \
  ! -path "./.git/*" \
  ! -path "./node_modules/*" \
  | sort
echo

echo "===== SOURCE FILES (ts/js/py) ====="
find . \
  \( -name "*.ts" -o -name "*.js" -o -name "*.py" \) \
  ! -path "./.git/*" \
  ! -path "./node_modules/*" \
  | sort
echo

echo "===== WORKFLOWS & CONFIG ====="
find . \
  \( -name "*.yml" -o -name "*.yaml" -o -name "*.json" \) \
  ! -path "./.git/*" \
  ! -path "./node_modules/*" \
  | sort
echo

echo "===== DOCUMENTATION ====="
find . -name "*.md" | sort
echo
