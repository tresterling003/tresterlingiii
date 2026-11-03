#!/usr/bin/env python3
"""Build DODGE NATION into one self-contained HTML file.

  python3 dodge/build.py          -> writes dodge/index.html

Inlines src/style.css, every src/js/*.js module (in filename order) and every
file in assets/ (base64) into src/shell.html. Only three.js itself and the web
fonts are loaded from a CDN at runtime.
"""
import base64, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ASSETS = os.path.join(ROOT, 'assets')


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def main():
    shell = read(os.path.join(SRC, 'shell.html'))
    css = read(os.path.join(SRC, 'style.css'))
    jsdir = os.path.join(SRC, 'js')
    parts = []
    for name in sorted(os.listdir(jsdir)):
        if name.endswith('.js'):
            parts.append('// ===== %s =====\n%s' % (name, read(os.path.join(jsdir, name))))
    js = '\n'.join(parts)
    if '</script' in js:
        sys.exit('JS source must not contain a closing script tag')
    entries = []
    for name in sorted(os.listdir(ASSETS)):
        if name.endswith(('.bin', '.jpg', '.png')):
            with open(os.path.join(ASSETS, name), 'rb') as f:
                entries.append('"%s":"%s"' % (name, base64.b64encode(f.read()).decode('ascii')))
    assets = '<script>window.DN_ASSETS={%s};</script>' % ',\n'.join(entries)
    lic = read(os.path.join(ASSETS, 'LICENSE-Rocketbox.md')).replace('--', '- -')
    out = (shell.replace('/*@@CSS@@*/', css)
                .replace('<!--@@ASSETS@@-->', assets)
                .replace('/*@@JS@@*/', js)
                .replace('@@ROCKETBOX_LICENSE@@', lic))
    dest = os.path.join(ROOT, 'index.html')
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(out)
    print('wrote %s (%.2f MB)' % (dest, len(out.encode('utf-8')) / 1e6))


if __name__ == '__main__':
    main()
