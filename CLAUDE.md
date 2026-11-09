# PLA Memory Lab — notes for future changes

## 她的要求（11-09 从记忆整理，加在原规则前面；原来的数据安全规则一条没改）
- 这是她 iPad 上正在用的版本（GitHub Pages：https://luxinyi034-dotcom.github.io/pla-memory-lab/）。旁边「PLA单词应用」文件夹是 9 月 Codex 旧版，不要改那个。
- 主要设备 11 寸 iPad Pro 横屏，也要能在电脑浏览器用；离线 PWA；左边固定导航，“今日学习”是默认首页。
- 回复用中文；大改（界面、排版、流程）先出几版设计稿给她选，她说“改”才做。
- 改代码前先 `git pull` 拉到最新，读现在的代码，不凭记忆改。
- 导入只带进数据，不能覆盖 App 版本和功能、不能弄坏学习进度；新学、复习、快速刷词都要能从中断处接着做。
- 所有功能要真的能用（按钮、返回、导入、进度保存）。iPad 触控的老问题要特别注意：拖动时页面乱跳、误选中文字变蓝、列表闪、滚不动、按钮没反应。
- 她的全部功能偏好（学习流程、默写、补打卡、错题本、导入表头格式等）在记忆 `~/.claude/memory/pla-app.md`，改功能前先读。
- 发布：照下面 8 条做完，推到 GitHub main，等 Pages 更新后她在 iPad 上打开就是新版。

## 导入新词（11-09 起）
- 她发来新积累（照片、文字、分析稿都行）时，整理到 `导入历史/<日期 来源>/data.py`，再运行
  `python tools/import_history.py "导入历史/<文件夹>"`，生成 `导入用-新增.xlsx`、`导入用-补充旧组.xlsx`、`阅读版.pdf`，并更新 `导入历史/目录.md`。
- 分“词汇积累 / 表达积累”两类，每个小标题是一个分组；分组名用中文（和 App 里旧组同名就会加进旧组）。
- 英文栏一行只放一个说法，不写斜杠和“+ n. / -ing”（默写要逐字母对上）；后接什么写进“拓展”，其他说法、区别写进“备注与易错点”。
- “拓展”在默写时会显示在中文下面当提示，**不能出现英文答案**（工具会检查）。
- 例句：确定是原文的照原文；不确定的写通用句，不编原文没有的细节。
- 生成后用 App 自己的 `readXlsx` / `rowsToRecords` / `importRecords` 在浏览器里验证，并对照已有数据查重。App 导入不查重，重复导入会出现两条。
- 她在 iPad 上导入后，在那一批文件夹里放一个 `已导入.txt`，目录里就会显示“是”。

Static PWA (vanilla ES modules, no build). Tests: `npm test`. Deployed by GitHub Pages from `main`.
The learner's real study data lives only in their browser, so **protecting it comes before any feature or design work.**

## Data safety rules (required for every release)

1. **Never rename or split the storage.** `localStorage` key `pla-memory-lab-state`, meta key `pla-memory-lab-meta`,
   IndexedDB `pla-memory-lab` / store `snapshots`. Every version under `versions/` reads and writes the same data.
2. **Bump `APP_VERSION` in `src/version.js` and `VERSION` in `sw.js` on every release.** A changed `APP_VERSION` makes
   `store.load()` save a "`<day> · 打开 <version> 前`" snapshot of the untouched data before anything else runs.
3. **Data changes go through keyed, idempotent migrations** (`state.migrations`, `applyMigrations` in `src/core/model.js`).
   `prepareState` saves a "整理复习前" snapshot before a migration changes anything. Never rewrite data outside a migration.
4. **Normalising keeps unknown fields.** Older archived versions must not drop fields newer versions added.
5. **Snapshot pruning only touches automatic daily keys (`YYYY-MM-DD`)**, newest 30 kept. Named and version snapshots
   (newest 10 version ones) are never removed by the daily prune — in any copy of `store.js`, including archived ones.
6. **Test against the real data before merging:** load `data/seed.json` (the learner's backup), run `npm test`, and open
   the site in Playwright with existing localStorage to check nothing is lost (counts of groups, expressions, progress,
   check-ins) and that the version snapshot appears in Settings.
7. **Every release archives the previous one** (`python3 tools/archive_version.py <version>`) so the learner can open it or make it the default
   (Settings → 版本, or #/versions). Archive from the last commit on `main`: copy `index.html`, `src`, `styles`, `icons`
   into `versions/<version>/`; in the copy drop the manifest link, the default-version redirect `<script>` and the
   service-worker registration, point the seed fetch at `../../data/seed.json`, keep its own `APP_VERSION` for
   `store.load()`, and set its `SELF` in `src/views/versions.js`. Then add the entry to `VERSIONS` — the file is the same
   in every copy except `SELF`, so update it in all of them (root, `versions/*` except `foundation`).
8. **Version snapshots never overwrite each other** (key `<day> · 打开 <version> 前 #hhmmss`); pruning keeps the newest 10
   plus the first one for each version. Restoring a snapshot marks pending migrations as `skipped-restore` so a restore
   gives the data back exactly as it was.

## How the learner recovers data

- Settings → 自动快照: one-tap restore of any daily, version or migration snapshot.
- Today shows a weekly reminder to export a backup file (Settings → 导出完整备份) to Files / iCloud, because Safari
  can clear site data. Importing a backup (merge or replace) is in Settings.
