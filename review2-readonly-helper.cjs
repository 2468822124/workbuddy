const fs = require('fs')
const Database = require('E:/workbuddy-snapshots/v0.3.0-qa.1-b1-merge-source/workbuddy/node_modules/better-sqlite3')

fs.writeFileSync('E:/workspace/review2-helper-args.txt', JSON.stringify(process.argv, null, 2), 'utf8')

const db = new Database(process.argv[2], {
  readonly: true,
  fileMustExist: true,
})

const tables = db.prepare("select name from sqlite_master where type='table' order by name").all()
const result = {
  runtime: process.versions,
  integrity: db.pragma('integrity_check', { simple: true }),
  tables: tables.map(row => row.name),
}

for (const row of tables.filter(row => /^flow_/.test(row.name))) {
  result[row.name] = db.prepare(`select * from "${row.name}"`).all()
}

const output = JSON.stringify(result, null, 2) + '\n'
if (process.argv[3]) fs.writeFileSync(process.argv[3], output, 'utf8')
else process.stdout.write(output)
db.close()
