import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const candidate = 'E:/workbuddy 复审/B3/R3-Fix2-only';
const label = process.argv[2];
if (!/^[a-z0-9-]+$/.test(label ?? '')) throw new Error('A unique evidence label is required');
const hash = (file) => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
const dbPath = path.join(candidate, 'userData/workbuddy.db');
const dataHashes = () => Object.fromEntries(['', '-wal', '-shm'].map(suffix => [path.basename(dbPath + suffix), hash(dbPath + suffix)]));
const before = dataHashes();
const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec('PRAGMA query_only=ON');
const tables = ['flow_fixed_defs', 'flow_week_instances', 'flow_day_entries', 'flow_receipts'];
const known = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
const result = {
  reviewId: 'Review3', reviewMode: '用户实测 R', rId: 'R3', fixId: 'Fix2',
  label, capturedAt: new Date().toISOString(), candidate, dbPath, readOnly: true,
  queryOnly: db.prepare('PRAGMA query_only').get(),
  integrity: db.prepare('PRAGMA integrity_check').all(),
  foreignKeys: db.prepare('PRAGMA foreign_key_check').all(),
  schemas: Object.fromEntries(tables.filter(table => known.has(table)).map(table => [table, db.prepare(`PRAGMA table_info(${table})`).all()])),
  rows: Object.fromEntries(tables.filter(table => known.has(table)).map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()])),
  before,
};
db.close();
result.after = dataHashes();
result.databaseUnchangedByRead = before['workbuddy.db'] === result.after['workbuddy.db'];
if (label === 'initial' || label === 'final') {
  const metaPath = path.join(candidate, 'review-meta.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const build = JSON.parse(fs.readFileSync(meta.build.manifestPath, 'utf8'));
  const actualFiles = fs.readdirSync(meta.appDir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => path.relative(meta.appDir, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
  const expectedFiles = build.files.map(entry => entry.path).sort();
  result.candidateAudit = {
    meta,
    metaSha256: hash(metaPath),
    sourceManifestSha256: hash(meta.candidateSourceManifestPath),
    buildManifestSha256: hash(meta.build.manifestPath),
    restore: JSON.parse(fs.readFileSync(path.join(candidate, 'control/restore-result.json'), 'utf8')),
    sourceManifestMatches: hash(meta.candidateSourceManifestPath) === meta.candidateSourceManifestSha256,
    buildManifestMatches: hash(meta.build.manifestPath) === meta.build.manifestSha256,
    fileCount: actualFiles.length,
    totalBytes: build.files.reduce((sum, entry) => sum + fs.statSync(path.join(meta.appDir, entry.path)).size, 0),
    addedOrMissingFiles: [...actualFiles.filter(file => !expectedFiles.includes(file)), ...expectedFiles.filter(file => !actualFiles.includes(file))],
    mismatches: build.files.filter(entry => hash(path.join(meta.appDir, entry.path)) !== entry.sha256 || fs.statSync(path.join(meta.appDir, entry.path)).size !== entry.size),
    launcher: fs.readFileSync(meta.reviewLauncher, 'utf8'),
    launcherSha256: hash(meta.reviewLauncher),
  };
}
const output = new URL(`${label}-readonly.json`, import.meta.url);
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output: output.pathname, label, counts: Object.fromEntries(Object.entries(result.rows).map(([table, rows]) => [table, rows.length])), integrity: result.integrity, foreignKeys: result.foreignKeys, databaseUnchangedByRead: result.databaseUnchangedByRead, candidateAudit: result.candidateAudit && { fileCount: result.candidateAudit.fileCount, totalBytes: result.candidateAudit.totalBytes, sourceManifestMatches: result.candidateAudit.sourceManifestMatches, buildManifestMatches: result.candidateAudit.buildManifestMatches, addedOrMissingFiles: result.candidateAudit.addedOrMissingFiles, mismatches: result.candidateAudit.mismatches } }, null, 2));
