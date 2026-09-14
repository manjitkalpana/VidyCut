"""Build deterministic delivery archives after npm run build and npm test."""
from pathlib import Path
import zipfile
import shutil
import json

root = Path(__file__).resolve().parents[1]
import sys
out = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parent / 'delivery'
out.mkdir(parents=True, exist_ok=True)
source = out / 'VidyCut-source.zip'
exclude = {'node_modules', 'dist', '.git', '.openai', '.data'}
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(root.rglob('*')):
        rel = path.relative_to(root)
        if not path.is_file() or any(part in exclude for part in rel.parts):
            continue
        if str(rel).startswith('public/ffmpeg/') or path.name.endswith(('.log', '.tsbuildinfo')):
            continue
        if path.name.startswith('.env') and path.name != '.env.example':
            continue
        archive.write(path, 'vidycut/' + rel.as_posix())
ready = out / 'VidyCut-ready-to-run.zip'
with zipfile.ZipFile(ready, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted((root / 'dist').rglob('*')):
        if path.is_file():
            archive.write(path, 'vidycut/' + path.relative_to(root / 'dist').as_posix())
    archive.write(root / 'scripts/serve.mjs', 'vidycut/serve.mjs')
    archive.write(root / 'LICENSE', 'vidycut/LICENSE')
    archive.write(root / 'THIRD_PARTY_NOTICES.md', 'vidycut/THIRD_PARTY_NOTICES.md')
    for path in sorted((root / 'docs').rglob('*')):
        if path.is_file(): archive.write(path, 'vidycut/docs/' + path.relative_to(root / 'docs').as_posix())
    archive.writestr('vidycut/START-WINDOWS.cmd', '''@echo off\r
cd /d "%~dp0"\r
where node >nul 2>nul\r
if errorlevel 1 (\r
  echo Install Node.js 22.12 or later, then try again.\r
  pause\r
  exit /b 1\r
)\r
start "" http://localhost:4173\r
node serve.mjs\r
pause\r
''')
    archive.writestr('vidycut/start-local.sh', '#!/bin/sh\nset -eu\ncd "$(dirname "$0")"\nnode serve.mjs\n')
    archive.writestr('vidycut/README.md', '''# VidyCut — ready to run

1. Extract the entire ZIP.
2. Install Node.js 22.12 or later if it is not already installed.
3. On Windows, open START-WINDOWS.cmd. Keep that terminal open.
4. Visit http://localhost:4173 and choose Try sample project or import your media.

On macOS/Linux run `sh start-local.sh`. Alternatively run `node serve.mjs` in this folder. No npm install is needed for this prebuilt package. Do not double-click index.html.

This is the local editor build: no login or cloud credentials required. The separate source ZIP contains editable source, tests, backend, database and deployment files. This package includes no subscription or watermark.

Projects and media save in this browser. Use Projects to download portable ZIP backups with source media. JSON-only backups require keeping the original media separately. Read docs/FEATURES.md for exactly which features work and which remain incomplete. docs/QA.md records tests and limitations. This release is not yet a complete production-audited commercial-editor equivalent.

To publish the static editor, serve this folder over HTTPS with the headers described in docs/DEPLOYMENT.md. Hosting was not created during this delivery because the hosting account returned a usage limit.
''')
shutil.copy2(root / 'docs/workspace.jpg', out / 'VidyCut-preview.jpg')
print(json.dumps([{'path':str(p),'bytes':p.stat().st_size} for p in [source,ready,out/'VidyCut-preview.jpg']],indent=2))
