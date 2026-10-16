// Minimal local .xlsx / .csv reader (no network, works offline on iPad).
// Returns rows as arrays of strings; row 0 is the header.

export async function readSpreadsheet(file) {
  const name = file.name?.toLowerCase() ?? '';
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) return parseDelimited(await file.text());
  return readXlsx(new Uint8Array(await file.arrayBuffer()));
}

export function parseDelimited(text) {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ',';
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(value => String(value).trim()));
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持读取 Excel，请先另存为 CSV 再导入。');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readXlsx(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('无法读取 Excel 文件（不是 .xlsx 格式）。');
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const size = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const offset = view.getUint32(cursor + 42, true);
    entries.set(decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)), { method, size, offset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  const read = async name => {
    const entry = entries.get(name);
    if (!entry) return null;
    const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
    const data = bytes.subarray(start, start + entry.size);
    const raw = entry.method === 0 ? data : await inflate(data);
    return decoder.decode(raw);
  };
  const parse = xml => new DOMParser().parseFromString(xml, 'application/xml');
  const els = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];

  const sharedXml = await read('xl/sharedStrings.xml');
  const shared = sharedXml ? els(parse(sharedXml), 'si').map(si => els(si, 't').map(t => t.textContent ?? '').join('')) : [];

  // Use the first sheet in workbook order.
  let sheetPath = null;
  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  if (workbook && rels) {
    const firstSheet = els(parse(workbook), 'sheet')[0];
    const rid = firstSheet?.getAttribute('r:id') ?? firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = els(parse(rels), 'Relationship').find(rel => rel.getAttribute('Id') === rid)?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  if (!sheetPath || !entries.has(sheetPath)) sheetPath = [...entries.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()[0];
  if (!sheetPath) throw new Error('Excel 中没有找到工作表。');

  const columnIndex = ref => { let n = 0; for (const ch of String(ref).replace(/\d/g, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  return els(parse(await read(sheetPath)), 'row').map(row => {
    const cells = [];
    els(row, 'c').forEach((cell, position) => {
      const ref = cell.getAttribute('r');
      const index = ref ? columnIndex(ref) : position;
      const type = cell.getAttribute('t');
      let value;
      if (type === 'inlineStr') value = els(cell, 't').map(t => t.textContent ?? '').join('');
      else {
        value = els(cell, 'v')[0]?.textContent ?? '';
        if (type === 's') value = shared[Number(value)] ?? '';
      }
      cells[index] = value;
    });
    return Array.from(cells, value => value ?? '');
  }).filter(r => r.some(value => String(value).trim()));
}

const HEADER_ALIASES = {
  english: ['单词/短语', '英文表达', '单词', '短语', '表达', 'english', 'expression', 'word'],
  phonetic: ['（美）音标', '(美)音标', '美式音标', '音标', 'phonetic', 'ipa'],
  chinese: ['简短中文释义', '中文释义', '释义', '中文', 'chinese', 'meaning'],
  example: ['例句', 'example'],
  writingPosition: ['拓展', '常见写作位置', '写作位置', 'extension', 'position'],
  notes: ['备注与易错点', '备注', '易错点', 'notes'],
  group: ['分组', '组名', 'group'],
  category: ['类别', '分类', '大类', '积累类型', 'category', 'type'],
};

/** Map header cells to fields. English column is required. */
export function mapHeaders(headerRow) {
  const normalized = headerRow.map(cell => String(cell ?? '').trim().toLowerCase().replace(/\s+/g, ''));
  const mapping = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    // Prefer exact matches, then "contains".
    let index = normalized.findIndex(cell => aliases.some(alias => cell === alias.toLowerCase()));
    if (index < 0) index = normalized.findIndex((cell, i) => cell && !Object.values(mapping).includes(i) && aliases.some(alias => cell.includes(alias.toLowerCase())));
    if (index >= 0 && !Object.values(mapping).includes(index)) mapping[field] = index;
  }
  return mapping;
}

export function normalizeCategory(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (/词汇|词语|单词|vocab|^words?$/.test(raw)) return 'vocabulary';
  if (/表达|短语|句式|express|phrase/.test(raw)) return 'expression';
  return null;
}

/** Turn rows into plain records in table order. */
export function rowsToRecords(rows) {
  if (rows.length < 2) throw new Error('表格至少需要一行表头和一行内容。');
  const mapping = mapHeaders(rows[0]);
  if (mapping.english == null) throw new Error('找不到“单词/短语”列，请检查表头。');
  const get = (row, field) => (mapping[field] == null ? '' : String(row[mapping[field]] ?? '').trim());
  const records = rows.slice(1).map(row => ({
    english: get(row, 'english'), chinese: get(row, 'chinese'), phonetic: get(row, 'phonetic'),
    example: get(row, 'example'), writingPosition: get(row, 'writingPosition'), notes: get(row, 'notes'),
    group: get(row, 'group'), category: normalizeCategory(get(row, 'category')),
  })).filter(record => record.english);
  if (!records.length) throw new Error('没有找到可导入的单词或短语。');
  return { records, mapping };
}
