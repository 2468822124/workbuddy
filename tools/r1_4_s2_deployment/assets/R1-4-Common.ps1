Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:R14ExpectedExeSha256 = 'D952D488A0878D0A8B9BC65E5063FFFFD4A7EDE58C99C2981407B96E1DDC7577'
$script:R14ExpectedManifestSha256 = '316D3CF6318ED5F268375DC24C8CBA0EF0AEF8B6C7B11D17FE2C9841ACEAD5A0'
$script:R14ExpectedFileCount = 100
$script:R14ExpectedTotalBytes = 335403668
$script:R14SnapshotRoot = 'E:\workbuddy-snapshots\v0.3.0-qa.2-r1-fix2-s2'
$script:R14SnapshotManifest = Join-Path $script:R14SnapshotRoot 'S2-manifest.sha256'

function Get-HashUpper {
  param([Parameter(Mandatory = $true)][string]$Path)
  $stream = [IO.File]::OpenRead($Path)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

function Get-NormalizedFullPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Test-PathWithin {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )
  $fullPath = Get-NormalizedFullPath $Path
  $fullRoot = Get-NormalizedFullPath $Root
  $fullPath.Equals($fullRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $fullPath.StartsWith($fullRoot + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Read-JsonFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "JSON file not found: $Path"
  }
  Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Write-AtomicJson {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$Value
  )
  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $temp = Join-Path $parent ('.' + [IO.Path]::GetFileName($Path) + '.' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    $Value | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -LiteralPath $temp -Destination $Path -Force
  } finally {
    if (Test-Path -LiteralPath $temp -PathType Leaf) {
      Remove-Item -LiteralPath $temp -Force
    }
  }
}

function Read-IniValues {
  param([Parameter(Mandatory = $true)][string]$Path)
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $values
  }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) {
      continue
    }
    $parts = $line -split '=', 2
    if ($parts.Count -eq 2) {
      $values[$parts[0].Trim().ToUpperInvariant()] = $parts[1].Trim()
    }
  }
  $values
}

function Get-ManifestEntries {
  param([Parameter(Mandatory = $true)][string]$ManifestPath)
  $entries = @()
  $lineNumber = 0
  foreach ($line in Get-Content -LiteralPath $ManifestPath -Encoding ASCII) {
    $lineNumber += 1
    if ($line -notmatch '^([0-9A-Fa-f]{64})\s+(.+)$') {
      throw "Invalid manifest line $lineNumber in $ManifestPath"
    }
    $relativePath = $Matches[2].Trim().Replace('/', '\')
    if ([IO.Path]::IsPathRooted($relativePath) -or $relativePath -match '(^|[\\/])\.\.([\\/]|$)') {
      throw "Unsafe manifest path at line ${lineNumber}: $relativePath"
    }
    $entries += [pscustomobject]@{
      relativePath = $relativePath
      sha256 = $Matches[1].ToUpperInvariant()
    }
  }
  @($entries)
}

function Test-R14Package {
  param(
    [Parameter(Mandatory = $true)][string]$AppRoot,
    [string]$ManifestPath = $script:R14SnapshotManifest
  )
  $errors = @()
  $checked = @()
  $entries = @()
  $actualFiles = @()

  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    $errors += "Manifest missing: $ManifestPath"
  } else {
    $manifestHash = Get-HashUpper $ManifestPath
    if ($manifestHash -ne $script:R14ExpectedManifestSha256) {
      $errors += "Manifest hash mismatch: $manifestHash"
    }
    try {
      $entries = @(Get-ManifestEntries $ManifestPath)
    } catch {
      $errors += $_.Exception.Message
    }
  }

  if (-not (Test-Path -LiteralPath $AppRoot -PathType Container)) {
    $errors += "App root missing: $AppRoot"
  } else {
    $actualFiles = @(Get-ChildItem -LiteralPath $AppRoot -File -Recurse -Force)
  }

  $expectedPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $entries) {
    if (-not $expectedPaths.Add([string]$entry.relativePath)) {
      $errors += "Duplicate manifest path: $($entry.relativePath)"
      continue
    }
    $path = Join-Path $AppRoot ([string]$entry.relativePath)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      $errors += "Missing package file: $($entry.relativePath)"
      continue
    }
    $actualHash = Get-HashUpper $path
    $matches = $actualHash -eq [string]$entry.sha256
    if (-not $matches) {
      $errors += "Package hash mismatch: $($entry.relativePath)"
    }
    $checked += [pscustomobject]@{
      relativePath = [string]$entry.relativePath
      expectedSha256 = [string]$entry.sha256
      actualSha256 = $actualHash
      matches = $matches
    }
  }

  $appRootLength = (Get-NormalizedFullPath $AppRoot).Length
  foreach ($file in $actualFiles) {
    $relative = $file.FullName.Substring($appRootLength).TrimStart('\')
    if (-not $expectedPaths.Contains($relative)) {
      $errors += "Unexpected package file: $relative"
    }
  }

  $totalBytes = if ($actualFiles.Count -gt 0) {
    [int64](($actualFiles | Measure-Object -Property Length -Sum).Sum)
  } else {
    [int64]0
  }
  if ($entries.Count -ne $script:R14ExpectedFileCount) {
    $errors += "Manifest entry count mismatch: $($entries.Count)"
  }
  if ($actualFiles.Count -ne $script:R14ExpectedFileCount) {
    $errors += "Package file count mismatch: $($actualFiles.Count)"
  }
  if ($totalBytes -ne $script:R14ExpectedTotalBytes) {
    $errors += "Package byte count mismatch: $totalBytes"
  }

  $exePath = Join-Path $AppRoot 'WorkBuddy.exe'
  $exeHash = if (Test-Path -LiteralPath $exePath -PathType Leaf) { Get-HashUpper $exePath } else { $null }
  if ($exeHash -ne $script:R14ExpectedExeSha256) {
    $errors += "WorkBuddy.exe hash mismatch: $exeHash"
  }

  [pscustomobject]@{
    passed = ($errors.Count -eq 0)
    appRoot = Get-NormalizedFullPath $AppRoot
    manifestPath = $ManifestPath
    manifestSha256 = if (Test-Path -LiteralPath $ManifestPath -PathType Leaf) { Get-HashUpper $ManifestPath } else { $null }
    manifestEntryCount = $entries.Count
    actualFileCount = $actualFiles.Count
    totalBytes = $totalBytes
    exePath = $exePath
    exeSha256 = $exeHash
    errors = @($errors)
    files = @($checked)
  }
}

function Get-WorkBuddyProcesses {
  @(Get-Process -Name 'WorkBuddy' -ErrorAction SilentlyContinue | ForEach-Object {
      $path = $null
      try { $path = $_.Path } catch { }
      [pscustomobject]@{
        id = $_.Id
        path = $path
        title = $_.MainWindowTitle
        mainWindowHandle = $_.MainWindowHandle
      }
    })
}

function Get-R14AppProcesses {
  param([Parameter(Mandatory = $true)][string]$AppPath)
  $expected = Get-NormalizedFullPath $AppPath
  @(Get-Process -Name 'WorkBuddy' -ErrorAction SilentlyContinue | Where-Object {
      try {
        $_.Path -and (Get-NormalizedFullPath $_.Path).Equals($expected, [StringComparison]::OrdinalIgnoreCase)
      } catch {
        $false
      }
    })
}

function Get-RoleIdentity {
  param(
    [Parameter(Mandatory = $true)][string]$DeploymentRoot,
    [Parameter(Mandatory = $true)][ValidateSet('GPT', 'USER')][string]$Role,
    [Parameter(Mandatory = $true)][ValidatePattern('^\d{8}$')][string]$Date
  )
  [pscustomobject]@{
    plan = 'R1-4'
    role = $Role
    date = $Date
    prefix = "v0.3-R1-4-$Role-$Date"
    dataDir = Join-Path $DeploymentRoot "data\$Role-$Date\userData"
    databasePath = Join-Path $DeploymentRoot "data\$Role-$Date\userData\workbuddy.db"
    registryPath = Join-Path $DeploymentRoot "entry\registered-R1-4-$Role.ini"
  }
}
