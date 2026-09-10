$path = 'E:\workbuddy-test\archive\v0.3\B1-20260829\batch-manifest.json'
$json = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
$json.purpose = 'B1 closed batch archive index; legacy runtime data archived with verified E/D replicas.'
$json.legacyB1RuntimeRoot = 'E:\workbuddy-test\R1-3&R2-1\B1-20260829'
foreach ($item in @(
  @{ Name='legacyB1RuntimeArchive'; Value='E:\workbuddy-test\archive\v0.3\B1-20260829\legacy-runtime' },
  @{ Name='legacyB1RuntimeBackup'; Value='D:\workbuddy-test-archive\v0.3\B1-20260829\legacy-runtime' },
  @{ Name='legacyB1RuntimeArchiveStatus'; Value='backup-complete' },
  @{ Name='b1ClosureStatus'; Value='closed' },
  @{ Name='archiveUpdatedAt'; Value=(Get-Date).ToString('o') }
)) {
  $json | Add-Member -NotePropertyName $item.Name -NotePropertyValue $item.Value -Force
}
$json | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $path -Encoding UTF8
Get-Content -LiteralPath $path -Raw -Encoding UTF8
