# PLA Memory Lab — notes for future changes

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
