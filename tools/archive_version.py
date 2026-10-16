#!/usr/bin/env python3
"""Archive the site as it is on a git ref into versions/<name>/ (see CLAUDE.md rule 7).

Usage: python3 tools/archive_version.py <name> [git-ref=origin/main]
Afterwards add the entry to VERSIONS in every copy of src/views/versions.js.
"""
import re, subprocess, sys
from pathlib import Path

name = sys.argv[1]
ref = sys.argv[2] if len(sys.argv) > 2 else 'origin/main'
dest = Path('versions') / name
if dest.exists():
    sys.exit(f'{dest} already exists')
dest.mkdir(parents=True)
tar = subprocess.run(['git', 'archive', ref, 'index.html', 'src', 'styles', 'icons'], check=True, capture_output=True).stdout
subprocess.run(['tar', '-x', '-C', str(dest)], input=tar, check=True)

index = dest / 'index.html'
html = index.read_text()
html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
html = re.sub(r'\s*<script>\s*// Open the version chosen.*?</script>', '', html, flags=re.S)
html = html.replace('<title>PLA Memory Lab</title>', f'<title>PLA Memory Lab · {name}</title>')
index.write_text(html)

app = dest / 'src/app.js'
js = app.read_text()
js = re.sub(r"  if \('serviceWorker' in navigator.*?\n  \}\n", "  // Archived version: the site's root service worker already covers this path.\n", js, flags=re.S)
app.write_text(js)

store = dest / 'src/store.js'
store.write_text(store.read_text().replace("fetch('./data/seed.json'", "fetch('../../data/seed.json'"))

versions = dest / 'src/views/versions.js'
versions.write_text(re.sub(r"const SELF = '[^']*';", f"const SELF = '{name}';", versions.read_text()))

checks = {
    'manifest link removed': 'manifest' not in index.read_text(),
    'redirect removed': 'pla-preferred-version' not in index.read_text(),
    'service worker removed': 'serviceWorker.register' not in app.read_text(),
    'seed path': '../../data/seed.json' in store.read_text(),
    'SELF set': f"const SELF = '{name}';" in versions.read_text(),
}
for label, ok in checks.items():
    print(('ok  ' if ok else 'FAIL') + ' ' + label)
if not all(checks.values()):
    sys.exit(1)
