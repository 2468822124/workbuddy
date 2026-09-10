param(
  [Parameter(Mandatory = $true)][string]$AppRoot,
  [Parameter(Mandatory = $true)][string]$ManifestPath,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'R1-4-Common.ps1')

$result = Test-R14Package -AppRoot $AppRoot -ManifestPath $ManifestPath
if ($Json) {
  $result | ConvertTo-Json -Depth 8
} elseif (-not $result.passed) {
  $result.errors | ForEach-Object { Write-Error $_ }
}

if (-not $result.passed) {
  exit 1
}
