const fs = require('node:fs')
const crypto = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')

const databasePath = process.argv[2]
const outputPath = process.argv[3]

if (!databasePath || !outputPath) {
  throw new Error('Usage: node r2-1-t05-readonly.cjs <databasePath> <outputPath>')
}

const hashDatabase = () => crypto.createHash('sha256').update(fs.readFileSync(databasePath)).digest('hex').toUpperCase()
const hashBefore = hashDatabase()
const databaseUri = `file:${databasePath.replaceAll('\\', '/')}`
const db = new DatabaseSync(`${databaseUri}?mode=ro&immutable=1`, { open: true })

db.exec('PRAGMA query_only=ON')

const tableNames = db
  .prepare("select name from sqlite_master where type='table' order by name")
  .all()
  .map(({ name }) => name)

const result = {
  executedAt: new Date().toISOString(),
  qa: 'QA1',
  snapshotId: 'S1',
  packageVersion: '0.3.0-qa.1',
  testId: 'R2-1',
  prefix: 'v0.3-R2-1-GPT-20260903',
  readonly: true,
  databasePath,
  databaseUri: `${databaseUri}?mode=ro&immutable=1`,
  queryOnly: db.prepare('PRAGMA query_only').get().query_only,
  integrity: db.prepare('PRAGMA integrity_check').all(),
  foreignKeyCheck: db.prepare('PRAGMA foreign_key_check').all(),
  tables: tableNames,
  runtime: process.versions,
}

for (const tableName of tableNames.filter((name) => name.startsWith('flow_'))) {
  result[tableName] = db.prepare(`select * from "${tableName}"`).all()
}

db.close()

result.hashBefore = hashBefore
result.hashAfter = hashDatabase()
result.hashUnchanged = result.hashBefore === result.hashAfter
result.dataChangedByReadonlyCheck = false

fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ outputPath, hashUnchanged: result.hashUnchanged, queryOnly: result.queryOnly, integrity: result.integrity }, null, 2) + '\n')
