"""Build one import batch for 导入历史/<日期 名称>/.

Usage:  python tools/import_history.py "导入历史/2026-11-09 Martin & Maloney"

Reads data.py in that folder and writes:
  导入用-新增.xlsx      -> App: 表达库 → 导入 Excel
  导入用-补充旧组.xlsx  -> same, rows go into existing groups with the same name
  阅读版.pdf            -> for reading on the computer (A4 landscape)
Then rebuilds 导入历史/目录.md.

The xlsx headers match src/core/xlsx.js HEADER_ALIASES. 拓展 is shown as a hint during
dictation, so it must never contain the English answer.
"""
import html
import importlib.util
import pathlib
import shutil
import subprocess
import sys
import tempfile

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

HEADERS = ['类别', '分组', '单词/短语', '（美）音标', '简短中文释义', '例句', '拓展', '备注与易错点']
WIDTHS = [10, 22, 34, 24, 26, 60, 26, 60]


def load(folder):
    spec = importlib.util.spec_from_file_location('batch', folder / 'data.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rows_of(groups):
    for category, group, items in groups:
        for english, ipa, zh, example, hint, note in items:
            yield [category, group, english, ipa, zh, example, hint, note]


def check(groups):
    for category, group, items in groups:
        assert category in ('词汇积累', '表达积累'), category
        for english, _ipa, _zh, _ex, hint, _note in items:
            assert english.strip(), group
            assert ' / ' not in english, f'英文栏只放一个说法：{english}'
            # The hint is visible while writing the answer.
            core = [w for w in english.lower().replace('.', ' ').split() if len(w) > 3 and w not in ('sth', 'with', 'into', 'from', 'that', 'over')]
            leaked = [w for w in core if w in hint.lower()]
            assert not leaked, f'拓展里出现了答案 {leaked}：{english}'


def write_xlsx(path, groups):
    wb = Workbook()
    ws = wb.active
    ws.title = '导入'
    ws.append(HEADERS)
    for row in rows_of(groups):
        ws.append(row)
    head_fill = PatternFill('solid', fgColor='F3E3DA')
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = head_fill
    for i, width in enumerate(WIDTHS):
        ws.column_dimensions[chr(65 + i)].width = width
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(wrap_text=True, vertical='top')
        row[2].font = Font(bold=True)
    ws.freeze_panes = 'C2'
    wb.save(path)


CSS = """
@page { size: A4 landscape; margin: 14mm 14mm 14mm 14mm; }
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #2b2522; font-size: 10.5pt; line-height: 1.45; }
h1 { font-family: Georgia, "Microsoft YaHei", serif; font-size: 20pt; margin: 0 0 2mm; }
.sub { color: #8a7d74; margin: 0 0 5mm; }
.box { border: 1px solid #e7d6cc; background: #fbf5f1; border-radius: 6px; padding: 3mm 4mm; margin: 0 0 5mm; }
.box h3 { margin: 0 0 1.5mm; font-size: 11pt; color: #b85a43; }
.box ul { margin: 0; padding-left: 5mm; }
h2 { font-size: 14pt; margin: 7mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 2px solid #d9735b; }
.group { break-inside: avoid; margin: 0 0 4.5mm; }
.group h4 { margin: 0 0 1.5mm; font-size: 11.5pt; }
.tag { display: inline-block; font-size: 8.5pt; font-weight: normal; color: #b85a43; border: 1px solid #e3b4a6; border-radius: 99px; padding: 0 2mm; margin-left: 2mm; vertical-align: 1px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
td, th { border-top: 1px solid #eee3dc; padding: 1.4mm 2mm; vertical-align: top; text-align: left; }
th { font-size: 8.5pt; color: #8a7d74; font-weight: normal; border-top: none; }
.en { font-family: Georgia, serif; font-weight: bold; font-size: 11pt; }
.ipa { color: #8a7d74; font-size: 8.5pt; font-weight: normal; font-family: "Segoe UI", sans-serif; }
.ex { font-family: Georgia, serif; font-style: italic; color: #4a403b; }
.hint { color: #6b7d5c; font-size: 9pt; }
.note { font-size: 9pt; color: #5a4f49; }
"""


def table(items):
    out = ['<table><colgroup><col style="width:22%"><col style="width:15%"><col style="width:31%"><col style="width:32%"></colgroup>',
           '<tr><th>单词 / 短语</th><th>中文</th><th>例句</th><th>拓展 · 备注</th></tr>']
    for english, ipa, zh, example, hint, note in items:
        e = html.escape
        extra = ''.join(x for x in (f'<div class="hint">{e(hint)}</div>' if hint else '', f'<div class="note">{e(note)}</div>' if note else ''))
        out.append(f'<tr><td><div class="en">{e(english)}</div><div class="ipa">{e(ipa)}</div></td><td>{e(zh)}</td>'
                   f'<td class="ex">{e(example)}</td><td>{extra}</td></tr>')
    out.append('</table>')
    return ''.join(out)


def section(title, groups):
    parts = [f'<h2>{html.escape(title)}</h2>']
    for category, group, items in groups:
        parts.append(f'<div class="group"><h4>{html.escape(group)}<span class="tag">{category} · {len(items)} 条</span></h4>{table(items)}</div>')
    return ''.join(parts)


def build_html(mod):
    e = html.escape
    vocab = [g for g in mod.GROUPS if g[0] == '词汇积累']
    expr = [g for g in mod.GROUPS if g[0] == '表达积累']
    count = lambda gs: sum(len(g[2]) for g in gs)
    body = [f'<h1>{e(mod.TITLE)}</h1>',
            f'<p class="sub">{mod.DATE} · 新增 {count(mod.GROUPS)} 条（词汇 {count(vocab)} · 表达 {count(expr)}），补进旧组 {count(mod.SUPPLEMENTS)} 条</p>']
    if getattr(mod, 'CORRECTIONS', None):
        body.append('<div class="box"><h3>本次核对要点</h3><ul>' + ''.join(f'<li>{e(c)}</li>' for c in mod.CORRECTIONS) + '</ul></div>')
    body.append(section('一、词汇积累', vocab))
    body.append(section('二、表达积累', expr))
    if mod.SUPPLEMENTS:
        body.append(section('三、补进已有分组', mod.SUPPLEMENTS))
    if getattr(mod, 'NOT_IMPORTED', None):
        body.append('<h2>四、已有笔记，不再导入</h2><table><colgroup><col style="width:28%"><col></colgroup>'
                    + ''.join(f'<tr><td class="en">{e(a)}</td><td class="note">{e(b)}</td></tr>' for a, b in mod.NOT_IMPORTED) + '</table>')
    return f'<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>{e(mod.TITLE)}</title><style>{CSS}</style></head><body>{"".join(body)}</body></html>'


def write_pdf(path, mod):
    doc = build_html(mod)

    browser = next((p for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                                r'C:\Program Files\Google\Chrome\Application\chrome.exe') if pathlib.Path(p).exists()), None)
    if not browser:
        raise SystemExit('找不到 Edge / Chrome，无法生成 PDF')
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / 'reading.html'
        out = pathlib.Path(tmp) / 'reading.pdf'
        src.write_text(doc, encoding='utf-8')
        subprocess.run([browser, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                        f'--user-data-dir={pathlib.Path(tmp) / "profile"}',
                        f'--print-to-pdf={out}', src.as_uri()], check=True, capture_output=True, timeout=120)
        shutil.copyfile(out, path)


def rebuild_index(root):
    lines = ['# 导入历史', '',
             '每次往 App 导入的新词都放在这里：一批一个文件夹，名字是“日期 来源”。', '',
             '- `导入用-新增.xlsx`：在 iPad 上打开 App → 表达库 → 导入 Excel，选这个文件。',
             '- `导入用-补充旧组.xlsx`（只有少数批次有）：同样导入；分组名和 App 里的旧组一样时，会加进旧组。尽量不动旧组，确实有新用法才用。',
             '- `阅读版.pdf`：没带本子时在电脑上看。',
             '- `data.py`：原始数据。改了它以后运行 `python tools/import_history.py "导入历史/<文件夹>"`，重新生成上面三个文件。',
             '', '| 日期 | 来源 | 新增 | 补进旧组 | 已导入到 iPad |', '|---|---|---|---|---|']
    for folder in sorted(p for p in root.iterdir() if (p / 'data.py').exists()):
        mod = load(folder)
        n = sum(len(g[2]) for g in mod.GROUPS)
        s = sum(len(g[2]) for g in mod.SUPPLEMENTS)
        done = (folder / '已导入.txt').exists()
        lines.append(f'| {mod.DATE} | {mod.TITLE} | {n} 条 | {s} 条 | {"是" if done else "还没有"} |')
    (root / '目录.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    folder = pathlib.Path(sys.argv[1]).resolve()
    mod = load(folder)
    check(mod.GROUPS)
    check(mod.SUPPLEMENTS)
    write_xlsx(folder / '导入用-新增.xlsx', mod.GROUPS)
    supp = folder / '导入用-补充旧组.xlsx'
    if mod.SUPPLEMENTS:
        write_xlsx(supp, mod.SUPPLEMENTS)
    elif supp.exists():
        supp.unlink()
    write_pdf(folder / '阅读版.pdf', mod)
    rebuild_index(folder.parent)
    print(f'{folder.name}: 新增 {sum(len(g[2]) for g in mod.GROUPS)} 条 / {len(mod.GROUPS)} 组；'
          f'补充 {sum(len(g[2]) for g in mod.SUPPLEMENTS)} 条 / {len(mod.SUPPLEMENTS)} 组')


if __name__ == '__main__':
    main()
