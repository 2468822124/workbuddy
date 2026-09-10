param(
  [switch]$VerifyOnly,
  [switch]$CheckOnly,
  [switch]$RefreshEntryAssets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$toolRoot = $PSScriptRoot
$assetsRoot = Join-Path $toolRoot 'assets'
. (Join-Path $assetsRoot 'R1-4-Common.ps1')

$deploymentRoot = 'E:\workbuddy-test\R1-4-S2'
$testRoot = 'E:\workbuddy-test'
$snapshotRoot = $script:R14SnapshotRoot
$snapshotApp = Join-Path $snapshotRoot 'out'
$snapshotRecordPath = Join-Path $snapshotRoot 'S2-snapshot-record.json'
$syncPath = 'E:\workbuddy 复审\B2\control\source-sync-result.json'
$pointerPath = 'E:\workbuddy 复审\current-development-pointer.json'
$recoveryPath = 'E:\workbuddy-snapshots\B2-R1-Fix2-only-source-recovery\control\history-source-recovery-result.json'
$fixPath = 'E:\workbuddy 复审\B2\R1-Fix2-only\control\fix-complete.json'
$reviewPath = 'E:\workbuddy 复审\B2\R1-Fix2-only\control\review-status-Review3.json'
$phaseSwitchPath = 'E:\workbuddy-test\current\phase-switch.json'
$b1LauncherPath = 'E:\workbuddy-test\启动实测.bat'
$b1SelectorPath = 'E:\workbuddy-test\选择B1实测角色.bat'

if ((Get-NormalizedFullPath $deploymentRoot) -ne (Get-NormalizedFullPath 'E:\workbuddy-test\R1-4-S2')) {
  throw "Unexpected deployment target: $deploymentRoot"
}
if (-not (Test-PathWithin $deploymentRoot $testRoot)) {
  throw "Deployment target is outside the test root: $deploymentRoot"
}

$sourcePackage = Test-R14Package -AppRoot $snapshotApp -ManifestPath $script:R14SnapshotManifest
if (-not $sourcePackage.passed) {
  throw ('Frozen S2 package verification failed: ' + (@($sourcePackage.errors) -join '; '))
}

$sync = Read-JsonFile $syncPath
$pointer = Read-JsonFile $pointerPath
$recovery = Read-JsonFile $recoveryPath
$fix = Read-JsonFile $fixPath
$review = Read-JsonFile $reviewPath
$snapshot = Read-JsonFile $snapshotRecordPath
$phaseSwitch = Read-JsonFile $phaseSwitchPath

$checks = [ordered]@{
  fixIdentity = ([string]$fix.batchId -eq 'B2' -and [string]$fix.rId -eq 'R1' -and [string]$fix.fixId -eq 'Fix2')
  reviewPassed = ([string]$review.status -eq 'passed' -and [string]$review.reviewId -eq 'Review3')
  sourceRecoveryVerified = ([string]$recovery.sourceRecoveryStatus -eq 'verified')
  requiredSourcePresent = (@($recovery.requiredSourceFiles) -contains 'tests/r1Fix2.spec.ts')
  sourceSyncVerified = ([string]$sync.sourceSyncStatus -eq 'verified')
  sourceSyncIdentity = ([string]$sync.batchId -eq 'B2' -and [string]$sync.candidateStrategy -eq 'direct')
  sourcePackageReadOnly = [bool]$sync.sourcePackageReadOnly
  sourceSyncNoConflict = (@($sync.conflicts).Count -eq 0)
  pointerVerified = ([string]$pointer.sourceSyncStatus -eq 'verified')
  pointerCandidateMatches = ([string]$pointer.candidateDir -eq [string]$sync.candidateDir)
  pointerSourcePackageMatches = ([string]$pointer.sourcePackageDir -eq [string]$sync.sourcePackageDir)
  pointerManifestMatches = ([string]$pointer.candidateSourceManifestSha256 -eq [string]$sync.candidateSourceManifestSha256)
  pointerTreeMatches = ([string]$pointer.candidateSourceTreeFingerprint -eq [string]$sync.candidateSourceTreeFingerprint)
  pointerDiffMatches = ([string]$pointer.approvedDiffFingerprint -eq [string]$sync.approvedDiffFingerprint)
  snapshotIdentity = ([string]$snapshot.snapshot -eq 'S2' -and [string]$snapshot.qa -eq 'QA2' -and [string]$snapshot.candidate -eq 'R1-Fix2')
  snapshotReadOnly = [bool]$snapshot.immutableFilesReadOnly
  snapshotContentVerified = [bool]$snapshot.candidateAndSnapshotFileContentVerified
  phaseSwitchDisabled = ([string]$phaseSwitch.state -eq 'disabled' -and [string]$phaseSwitch.stage -eq 'B1' -and [string]$phaseSwitch.b1Status -eq 'in-progress')
  r14NotInLongTermGate = (-not (@($phaseSwitch.planIds) -contains 'R1-4'))
  noWorkBuddyProcess = (@(Get-WorkBuddyProcesses).Count -eq 0)
}
$failedChecks = @($checks.GetEnumerator() | Where-Object { -not [bool]$_.Value } | ForEach-Object { $_.Key })
if ($failedChecks.Count -gt 0) {
  throw ('R1-4 deployment prerequisite checks failed: ' + ($failedChecks -join ', '))
}
$modeFlags = @($VerifyOnly.IsPresent, $CheckOnly.IsPresent, $RefreshEntryAssets.IsPresent)
if (@($modeFlags | Where-Object { $_ }).Count -gt 1) {
  throw 'VerifyOnly, CheckOnly, and RefreshEntryAssets are mutually exclusive.'
}
if ($CheckOnly) {
  [pscustomobject]@{
    status = 'prerequisites-passed'
    target = $deploymentRoot
    targetExists = Test-Path -LiteralPath $deploymentRoot
    sourcePackage = $sourcePackage
    checks = $checks
  } | ConvertTo-Json -Depth 8
  exit 0
}
if ($RefreshEntryAssets) {
  if (-not (Test-Path -LiteralPath $deploymentRoot -PathType Container)) {
    throw "Deployment target does not exist: $deploymentRoot"
  }
  if (@(Get-WorkBuddyProcesses).Count -ne 0) {
    throw 'A WorkBuddy process is running; entry assets will not be changed.'
  }
  $deployed = Test-R14Package -AppRoot (Join-Path $deploymentRoot 'app') -ManifestPath $script:R14SnapshotManifest
  if (-not $deployed.passed) {
    throw ('Existing deployment verification failed: ' + (@($deployed.errors) -join '; '))
  }
  $selectorName = ([string]([char]0x9009) + [char]0x62E9 + 'R1-4' + [char]0x5B9E + [char]0x6D4B + [char]0x89D2 + [char]0x8272 + '.bat')
  $launcherName = ([string]([char]0x542F) + [char]0x52A8 + 'R1-4' + [char]0x5B9E + [char]0x6D4B + '.bat')
  $preflightName = 'R1-4-E0' + [char]0x9884 + [char]0x68C0 + '.ps1'
  $entryRoot = Join-Path $deploymentRoot 'entry'
  Copy-Item -LiteralPath (Join-Path $assetsRoot 'Select-R1-4-Role.bat') -Destination (Join-Path $deploymentRoot $selectorName) -Force
  Copy-Item -LiteralPath (Join-Path $assetsRoot 'Start-R1-4-Test.bat') -Destination (Join-Path $deploymentRoot $launcherName) -Force
  Copy-Item -LiteralPath (Join-Path $assetsRoot 'R1-4-E0-Preflight.ps1') -Destination (Join-Path $deploymentRoot $preflightName) -Force
  Copy-Item -LiteralPath (Join-Path $assetsRoot 'R1-4-Common.ps1') -Destination (Join-Path $entryRoot 'R1-4-Common.ps1') -Force
  Copy-Item -LiteralPath (Join-Path $assetsRoot 'Verify-R1-4-Package.ps1') -Destination (Join-Path $entryRoot 'Verify-R1-4-Package.ps1') -Force
  $repairRecord = [ordered]@{
    schemaVersion = 1
    record = 'R1-4-entry-asset-refresh'
    status = 'refreshed-after-e0-entry-hash-runtime-failure'
    updatedAt = (Get-Date).ToString('o')
    updatedBy = 'GPT/deployment-flow'
    reason = 'Replace module-dependent hashing with the self-contained .NET SHA-256 verifier and preserve the failed E0 evidence.'
    deploymentRoot = $deploymentRoot
    appPackageUnchanged = $deployed.passed
    appExeSha256 = $deployed.exeSha256
    appManifestSha256 = $deployed.manifestSha256
    dataDirectoriesPreserved = $true
    existingEvidencePreserved = $true
    assets = @(
      [ordered]@{ path = Join-Path $deploymentRoot $selectorName; sha256 = Get-HashUpper (Join-Path $deploymentRoot $selectorName) },
      [ordered]@{ path = Join-Path $deploymentRoot $launcherName; sha256 = Get-HashUpper (Join-Path $deploymentRoot $launcherName) },
      [ordered]@{ path = Join-Path $deploymentRoot $preflightName; sha256 = Get-HashUpper (Join-Path $deploymentRoot $preflightName) },
      [ordered]@{ path = Join-Path $entryRoot 'R1-4-Common.ps1'; sha256 = Get-HashUpper (Join-Path $entryRoot 'R1-4-Common.ps1') },
      [ordered]@{ path = Join-Path $entryRoot 'Verify-R1-4-Package.ps1'; sha256 = Get-HashUpper (Join-Path $entryRoot 'Verify-R1-4-Package.ps1') }
    )
    nextAction = 'Re-run the dedicated R1-4 E0 preflight. Do not overwrite the failed evidence record.'
  }
  $repairPath = Join-Path $entryRoot ("entry-asset-refresh-{0}.json" -f (Get-Date).ToString('yyyyMMdd-HHmmss'))
  Write-AtomicJson -Path $repairPath -Value $repairRecord
  Write-Output "R1-4 entry assets refreshed: $repairPath"
  exit 0
}

if (Test-Path -LiteralPath $deploymentRoot) {
  if (-not $VerifyOnly) {
    throw "Deployment target already exists and will not be overwritten: $deploymentRoot"
  }
  $deployed = Test-R14Package -AppRoot (Join-Path $deploymentRoot 'app') -ManifestPath $script:R14SnapshotManifest
  if (-not $deployed.passed) {
    throw ('Existing deployment verification failed: ' + (@($deployed.errors) -join '; '))
  }
  Write-Output "Existing R1-4 S2 deployment verified: $deploymentRoot"
  exit 0
}
if ($VerifyOnly) {
  throw "Deployment target does not exist: $deploymentRoot"
}

$staging = Join-Path $testRoot ('.R1-4-S2-staging-' + [guid]::NewGuid().ToString('N'))
if (-not (Test-PathWithin $staging $testRoot) -or -not ([IO.Path]::GetFileName($staging).StartsWith('.R1-4-S2-staging-', [StringComparison]::Ordinal))) {
  throw "Unsafe staging path: $staging"
}

try {
  $stagingApp = Join-Path $staging 'app'
  $stagingEntry = Join-Path $staging 'entry'
  $stagingEvidence = Join-Path $staging 'evidence'
  $stagingData = Join-Path $staging 'data'
  New-Item -ItemType Directory -Path $stagingApp,$stagingEntry,$stagingEvidence,$stagingData | Out-Null

  Get-ChildItem -LiteralPath $snapshotApp -Force | Copy-Item -Destination $stagingApp -Recurse -Force
  Get-ChildItem -LiteralPath $stagingApp -File -Recurse -Force | ForEach-Object { $_.IsReadOnly = $true }

  $selectorName = ([string]([char]0x9009) + [char]0x62E9 + 'R1-4' + [char]0x5B9E + [char]0x6D4B + [char]0x89D2 + [char]0x8272 + '.bat')
  $launcherName = ([string]([char]0x542F) + [char]0x52A8 + 'R1-4' + [char]0x5B9E + [char]0x6D4B + '.bat')
  $preflightName = 'R1-4-E0' + [char]0x9884 + [char]0x68C0 + '.ps1'
  Copy-Item -LiteralPath (Join-Path $assetsRoot 'Select-R1-4-Role.bat') -Destination (Join-Path $staging $selectorName)
  Copy-Item -LiteralPath (Join-Path $assetsRoot 'Start-R1-4-Test.bat') -Destination (Join-Path $staging $launcherName)
  Copy-Item -LiteralPath (Join-Path $assetsRoot 'R1-4-E0-Preflight.ps1') -Destination (Join-Path $staging $preflightName)
  Copy-Item -LiteralPath (Join-Path $assetsRoot 'R1-4-Common.ps1') -Destination (Join-Path $stagingEntry 'R1-4-Common.ps1')
  Copy-Item -LiteralPath (Join-Path $assetsRoot 'Verify-R1-4-Package.ps1') -Destination (Join-Path $stagingEntry 'Verify-R1-4-Package.ps1')

  $deployedPackage = Test-R14Package -AppRoot $stagingApp -ManifestPath $script:R14SnapshotManifest
  if (-not $deployedPackage.passed) {
    throw ('Staged R1-4 package verification failed: ' + (@($deployedPackage.errors) -join '; '))
  }

  $protectedAssets = [ordered]@{
    phaseSwitchPath = $phaseSwitchPath
    phaseSwitchSha256 = Get-HashUpper $phaseSwitchPath
    b1LauncherPath = $b1LauncherPath
    b1LauncherSha256 = Get-HashUpper $b1LauncherPath
    b1SelectorPath = $b1SelectorPath
    b1SelectorSha256 = Get-HashUpper $b1SelectorPath
    b1DataInspected = $false
    realUserDataInspected = $false
    longTermEntryUsed = $false
    b1EntryUsed = $false
  }
  $record = [ordered]@{
    schemaVersion = 1
    record = 'R1-4-QA2-S2-formal-test-deployment'
    status = 'deployed-awaiting-e0'
    planId = 'R1-4'
    version = 'v0.3'
    feature = 'R1 project projection template and weekly planning creation'
    qa = 'QA2'
    snapshotId = 'S2'
    deployedAt = (Get-Date).ToString('o')
    deployedBy = 'GPT/deployment-flow'
    deploymentRoot = $deploymentRoot
    sourceSnapshotRoot = $snapshotRoot
    sourceManifest = $script:R14SnapshotManifest
    sourceSnapshotRecord = $snapshotRecordPath
    programCopy = Join-Path $deploymentRoot 'app'
    officialEntry = Join-Path $deploymentRoot $launcherName
    roleSelector = Join-Path $deploymentRoot $selectorName
    e0Preflight = Join-Path $deploymentRoot $preflightName
    dataRoot = Join-Path $deploymentRoot 'data'
    evidenceRoot = Join-Path $deploymentRoot 'evidence'
    roleModel = @(
      [ordered]@{ role = 'GPT'; dataPattern = Join-Path $deploymentRoot 'data\GPT-YYYYMMDD\userData'; prefixPattern = 'v0.3-R1-4-GPT-YYYYMMDD' },
      [ordered]@{ role = 'USER'; dataPattern = Join-Path $deploymentRoot 'data\USER-YYYYMMDD\userData'; prefixPattern = 'v0.3-R1-4-USER-YYYYMMDD' }
    )
    package = $deployedPackage
    prerequisiteChecks = $checks
    fixRecord = $fixPath
    reviewRecord = $reviewPath
    sourceRecoveryRecord = $recoveryPath
    sourceSyncRecord = $syncPath
    developmentPointer = $pointerPath
    protectedAssets = $protectedAssets
    state = [ordered]@{
      planStatus = 'created'
      staticGate = 'pending'
      testPointStatus = 'R1-4-T01..T06=not-tested'
      closureStatus = 'not-started'
      statusKind = 'pre-E0 deployment state'
    }
    nextAction = 'Run the dedicated R1-4 E0 preflight. Do not start R1-4-T01 until E0 passes.'
  }
  Write-AtomicJson -Path (Join-Path $stagingEntry 'deployment-record.json') -Value $record

  Move-Item -LiteralPath $staging -Destination $deploymentRoot
  $staging = $null
  Write-Output "R1-4 QA2/S2 deployment created: $deploymentRoot"
} finally {
  if ($null -ne $staging -and (Test-Path -LiteralPath $staging)) {
    $resolvedStaging = Get-NormalizedFullPath $staging
    if (-not (Test-PathWithin $resolvedStaging $testRoot) -or -not ([IO.Path]::GetFileName($resolvedStaging).StartsWith('.R1-4-S2-staging-', [StringComparison]::Ordinal))) {
      throw "Refusing to clean unexpected staging path: $resolvedStaging"
    }
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
  }
}
