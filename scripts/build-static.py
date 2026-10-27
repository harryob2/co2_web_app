#!/usr/bin/env python3
"""Produce a static-only artifact; never publish the repository root."""
from pathlib import Path
import shutil
import sys

source = Path(__file__).resolve().parents[1]
target = Path(sys.argv[1]).resolve()
if target == source or source in target.parents:
    raise SystemExit('Build outside the source checkout')
files = [source / name for name in ['index.html', 'app.js', 'styles.css', 'sample_data.csv', 'social-preview.html']]
files += list((source / 'screenshots').glob('*.png'))
for path in files:
    if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(source):
        raise SystemExit('Unsafe or missing public asset: ' + str(path))
target.mkdir(parents=True, exist_ok=True)
for path in files:
    dest = target / path.relative_to(source)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, dest)
    dest.chmod(0o644)
print(f'Built {len(files)} public assets')
