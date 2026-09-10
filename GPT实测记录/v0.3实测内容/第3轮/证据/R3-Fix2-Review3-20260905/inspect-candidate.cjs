const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('E:/workspace/workbuddy/node_modules/@electron/asar');

const root = 'E:/workbuddy 复审/B3/R3-Fix2-only';
const archive = path.join(root, 'app/resources/app.asar');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const entries = asar.listPackage(archive).map(entry => entry.replaceAll('\\', '/').replace(/^\//, ''));
const read = name => asar.extractFile(archive, path.normalize(name)).toString('utf8');
const main = read('out/main/index.js');
const mainLines = main.split(/\r?\n/);
const mainStart = mainLines.findIndex(line => /^function deleteFixedDef\(/.test(line));
if (mainStart < 0) throw new Error('Packaged deleteFixedDef not found');
const cssPath = entries.find(entry => /\/FlowWeekView-.*\.css$/.test(entry));
const jsPath = entries.find(entry => /\/FlowWeekView-.*\.js$/.test(entry));
const css = read(cssPath);
const renderer = read(jsPath);
const hint = renderer.indexOf('未进入的未来实例隐藏');
const sourcePath = 'src/renderer/src/components/flow/FixedDefsPanel.vue';
const codePath = 'E:/workspace/workbuddy/' + sourcePath;
const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, 'control/candidate-source-manifest.json'), 'utf8'));
const closure = 'E:/workspace/用户实测阶段/v0.3-任务数据流通重构/第3轮/v0.3-R3-停用后固定任务未来周边界-全流程闭环记录.md';
const protectedPaths = [
  closure,
  'E:/workspace/当前代码状态.md',
  'E:/workspace/用户实测阶段/v0.3-任务数据流通重构/第2轮/v0.3-R2-1-实测计划.md',
  'E:/workspace/用户实测阶段/v0.3-任务数据流通重构/第2轮/v0.3-R2-月目标重复选取-全流程闭环记录.md',
  'E:/workspace/GPT实测记录/v0.3实测内容/第2轮/v0.3-R2-1-GPT实测.md',
];
const report = {
  reviewId: 'Review3', capturedAt: new Date().toISOString(), archive,
  archiveSha256: hash(fs.readFileSync(archive)),
  package: JSON.parse(read('package.json')),
  deleteFixedDef: { path: 'out/main/index.js', startLine: mainStart + 1, text: mainLines.slice(mainStart, mainStart + 32).join('\n') },
  fixedDefsStyles: { path: cssPath, rules: css.split('}').filter(rule => /\.def-(row|title|actions)|\.confirm-hint/.test(rule)).map(rule => rule + '}') },
  confirmationTemplate: { path: jsPath, text: renderer.slice(Math.max(0, hint - 400), hint + 550) },
  localSourceReference: { path: codePath, sha256: hash(fs.readFileSync(codePath)), candidateExpected: sourceManifest.files.find(entry => entry.path === sourcePath), note: 'The restored source is a navigation reference; packaged extracts above are candidate evidence.' },
  protectedFiles: protectedPaths.map(file => { const data = fs.readFileSync(file); return { path: file, bytes: data.length, sha256: hash(data) }; }),
};
fs.writeFileSync(path.join(__dirname, 'candidate-static-review.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({package:report.package,deleteFixedDef:report.deleteFixedDef,fixedDefsStyles:report.fixedDefsStyles,confirmationTemplate:report.confirmationTemplate,localSourceReference:report.localSourceReference},null,2));
