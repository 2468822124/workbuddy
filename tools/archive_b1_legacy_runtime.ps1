param(
  [string]$SourceRoot = 'E:\workbuddy-test\R1-3&R2-1\B1-20260829',
  [string]$ArchiveRoot = 'E:\workbuddy-test\archive\v0.3\B1-20260829\legacy-runtime',
  [string]$BackupRoot = 'D:\workbuddy-test-archive\v0.3\B1-20260829\legacy-runtime'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Hash($p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
function Add-File($src, $dst, $kind) {
  if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { return $null }
  $parent = Split-Path -Parent $dst
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  Copy-Item -LiteralPath $src -Destination $dst -Force
  [ordered]@{ relativePath = $dst.Substring($ArchiveRoot.Length).TrimStart('\'); sourcePath = $src; kind = $kind; length = (Get-Item $src).Length; sha256 = Hash $src }
}

if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) { throw "Source not found: $SourceRoot" }
if (Get-Process -Name WorkBuddy -ErrorAction SilentlyContinue) { throw 'WorkBuddy is running; close it before archival.' }
if (Test-Path -LiteralPath $ArchiveRoot) { throw "Archive destination already exists: $ArchiveRoot" }
New-Item -ItemType Directory -Force -Path $ArchiveRoot | Out-Null
$entries = [System.Collections.Generic.List[object]]::new()

# Preserve entry evidence and logs, but exclude selectors' transient state and caches.
$entry = Join-Path $SourceRoot 'entry'
Get-ChildItem -LiteralPath $entry -File -Recurse | Where-Object { $_.Name -notin @('selected-role.ini') } | ForEach-Object {
  $rel = $_.FullName.Substring($SourceRoot.Length).TrimStart('\')
  $e = Add-File $_.FullName (Join-Path $ArchiveRoot $rel) 'entry-evidence'
  if ($null -ne $e) { $entries.Add($e) }
}

# Retain every B1 role/date database and necessary Electron state only.
Get-ChildItem -LiteralPath $SourceRoot -Directory -Recurse | Where-Object { $_.Name -eq 'userData' } | ForEach-Object {
  $userData = $_.FullName
  Get-ChildItem -LiteralPath $userData -File | Where-Object { $_.Name -in @('workbuddy.db','workbuddy.db-wal','workbuddy.db-shm','Local State','Preferences') } | ForEach-Object {
    $rel = $_.FullName.Substring($SourceRoot.Length).TrimStart('\')
    $e = Add-File $_.FullName (Join-Path $ArchiveRoot $rel) 'database-or-state'
    if ($null -ne $e) { $entries.Add($e) }
  }
}

$manifest = [ordered]@{
  schemaVersion = 1
  record = 'b1-legacy-runtime-archive'
  batchId = 'B1-20260829'
  status = 'completed'
  sourceRoot = $SourceRoot
  archiveRoot = $ArchiveRoot
  archivedAt = (Get-Date).ToString('o')
  includedFiles = @($entries)
  excluded = @('Cache','Code Cache','GPUCache','Dawn*','Cookies','LOCK','*.key','*.pem','selected-role.ini')
  sourceOfTruth = 'E:\workspace documents and this archive'
  note = 'B1 legacy runtime data preserved read-only by policy; source was not moved or deleted.'
}
$manifestPath = Join-Path $ArchiveRoot 'archive-manifest.json'
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

# Verify every archived payload before creating the external backup.
foreach ($e in $entries) {
  $dst = Join-Path $ArchiveRoot ([string]$e.relativePath)
  if ((Hash $dst) -ne [string]$e.sha256) { throw "Archive hash mismatch: $dst" }
}
$manifest.sha256 = Hash $manifestPath

if (Test-Path -LiteralPath $BackupRoot) { throw "Backup destination already exists: $BackupRoot" }
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
Copy-Item -LiteralPath $ArchiveRoot -Destination (Split-Path -Parent $BackupRoot) -Recurse -Force
$backupManifest = [ordered]@{
  schemaVersion = 1
  record = 'b1-legacy-runtime-backup'
  status = 'backup-complete'
  sourceArchive = $ArchiveRoot
  backupPath = $BackupRoot
  copiedAt = (Get-Date).ToString('o')
  fileCount = $entries.Count
  archiveManifestSha256 = Hash $manifestPath
  note = 'Backup is a replica; workspace documents and E archive remain source of truth.'
}
$backupManifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $BackupRoot 'backup-manifest.json') -Encoding UTF8
[pscustomobject]@{ archiveRoot=$ArchiveRoot; backupRoot=$BackupRoot; fileCount=$entries.Count; status='backup-complete' } | ConvertTo-Json
