param(
  [switch]$SkipLaunchProbe,
  [string]$ResultPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deploymentRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$entryRoot = Join-Path $deploymentRoot 'entry'
. (Join-Path $entryRoot 'R1-4-Common.ps1')

$appRoot = Join-Path $deploymentRoot 'app'
$appPath = Join-Path $appRoot 'WorkBuddy.exe'
$selectorPath = Join-Path $deploymentRoot ([string]([char]0x9009) + [char]0x62E9 + 'R1-4' + [char]0x5B9E + [char]0x6D4B + [char]0x89D2 + [char]0x8272 + '.bat')
$launcherPath = Join-Path $deploymentRoot ([string]([char]0x542F) + [char]0x52A8 + 'R1-4' + [char]0x5B9E + [char]0x6D4B + '.bat')
$deploymentRecordPath = Join-Path $entryRoot 'deployment-record.json'
$statePath = Join-Path $entryRoot 'selected-role.ini'
$phaseSwitchPath = 'E:\workbuddy-test\current\phase-switch.json'
$b1LauncherPath = 'E:\workbuddy-test\启动实测.bat'
$b1SelectorPath = 'E:\workbuddy-test\选择B1实测角色.bat'
$syncPath = 'E:\workbuddy 复审\B2\control\source-sync-result.json'
$pointerPath = 'E:\workbuddy 复审\current-development-pointer.json'
$recoveryPath = 'E:\workbuddy-snapshots\B2-R1-Fix2-only-source-recovery\control\history-source-recovery-result.json'
$snapshotRecordPath = Join-Path $script:R14SnapshotRoot 'S2-snapshot-record.json'
if ([string]::IsNullOrWhiteSpace($ResultPath)) {
  $ResultPath = Join-Path $deploymentRoot 'evidence\R1-4-E0-preflight.json'
  if (Test-Path -LiteralPath $ResultPath -PathType Leaf) {
    $ResultPath = Join-Path $deploymentRoot ("evidence\R1-4-E0-preflight-attempt-{0}.json" -f (Get-Date).ToString('yyyyMMdd-HHmmss'))
  }
}

function Invoke-CapturedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FileName,
    [Parameter(Mandatory = $true)][string]$Arguments,
    [hashtable]$Environment = @{}
  )
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FileName
  $psi.Arguments = $Arguments
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($name in $Environment.Keys) {
    $psi.EnvironmentVariables[$name] = [string]$Environment[$name]
  }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  $null = $process.Start()
  $process.WaitForExit()
  [pscustomobject]@{
    exitCode = $process.ExitCode
    stdout = $process.StandardOutput.ReadToEnd()
    stderr = $process.StandardError.ReadToEnd()
  }
}

function Stop-R14Processes {
  param([Parameter(Mandatory = $true)][string]$ExpectedAppPath)
  $forced = $false
  $processes = @(Get-R14AppProcesses $ExpectedAppPath)
  foreach ($process in @($processes | Where-Object { $_.MainWindowHandle -ne 0 })) {
    try { $null = $process.CloseMainWindow() } catch { }
  }
  Start-Sleep -Seconds 2
  $remaining = @(Get-R14AppProcesses $ExpectedAppPath)
  if ($remaining.Count -gt 0) {
    $forced = $true
    foreach ($process in $remaining) {
      try { & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null } catch { }
    }
    Start-Sleep -Seconds 2
  }
  [pscustomobject]@{
    forcedCleanup = $forced
    remaining = @((Get-R14AppProcesses $ExpectedAppPath) | ForEach-Object { $_.Id })
  }
}

function Invoke-RoleLaunchProbe {
  param([Parameter(Mandatory = $true)][ValidateSet('GPT', 'USER')][string]$Role)

  $selector = Invoke-CapturedCommand -FileName 'cmd.exe' -Arguments "/d /c call `"$selectorPath`" $Role" -Environment @{ R1_4_NO_PAUSE = '1' }
  $selected = Read-IniValues $statePath
  $date = if ($selected.ContainsKey('DATE')) { [string]$selected['DATE'] } else { '' }
  $identity = if ($date -match '^\d{8}$') { Get-RoleIdentity -DeploymentRoot $deploymentRoot -Role $Role -Date $date } else { $null }

  $record = [ordered]@{
    role = $Role
    selector = $selector
    selectedState = $selected
    identity = $identity
    launchStarted = $false
    databasePresentBefore = $false
    databaseCreated = $false
    processObserved = $false
    processRecords = @()
    commandLines = @()
    launcherExitCode = $null
    launcherStdout = $null
    launcherStderr = $null
    launcherTimedOut = $false
    cleanup = $null
    passed = $false
    errors = @()
  }
  if ($selector.exitCode -ne 0) {
    $record.errors += "Selector failed with exit code $($selector.exitCode)"
    return [pscustomobject]$record
  }
  if ($null -eq $identity) {
    $record.errors += 'Selector did not create a valid DATE value.'
    return [pscustomobject]$record
  }
  if ([string]$selected['PLAN'] -ne 'R1-4' -or [string]$selected['ROLE'] -ne $Role -or [string]$selected['PREFIX'] -ne $identity.prefix -or (Get-NormalizedFullPath ([string]$selected['DATA'])) -ne (Get-NormalizedFullPath $identity.dataDir)) {
    $record.errors += 'Selected role state does not match the expected R1-4 identity.'
    return [pscustomobject]$record
  }

  $record.databasePresentBefore = Test-Path -LiteralPath $identity.databasePath -PathType Leaf
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'cmd.exe'
  $psi.Arguments = "/d /c call `"$launcherPath`""
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.EnvironmentVariables['R1_4_NO_PAUSE'] = '1'
  $launcher = [Diagnostics.Process]::new()
  $launcher.StartInfo = $psi
  $null = $launcher.Start()
  $record.launchStarted = $true

  $deadline = (Get-Date).AddSeconds(75)
  $appProcesses = @()
  while ((Get-Date) -lt $deadline) {
    $appProcesses = @(Get-R14AppProcesses $appPath)
    if ($appProcesses.Count -gt 0 -and (Test-Path -LiteralPath $identity.databasePath -PathType Leaf)) {
      break
    }
    if ($launcher.HasExited -and $appProcesses.Count -eq 0) {
      break
    }
    Start-Sleep -Milliseconds 250
  }

  $record.processObserved = $appProcesses.Count -gt 0
  $record.processRecords = @($appProcesses | ForEach-Object {
      [ordered]@{ id = $_.Id; path = $_.Path; title = $_.MainWindowTitle; mainWindowHandle = $_.MainWindowHandle }
    })
  if ($appProcesses.Count -gt 0) {
    try {
      $ids = @($appProcesses | ForEach-Object { $_.Id })
      $record.commandLines = @(Get-CimInstance Win32_Process -Filter "Name='WorkBuddy.exe'" | Where-Object { $ids -contains [int]$_.ProcessId } | ForEach-Object {
          [ordered]@{ processId = [int]$_.ProcessId; executablePath = $_.ExecutablePath; commandLine = $_.CommandLine }
        })
    } catch {
      $record.commandLines = @([ordered]@{ unavailable = $true; reason = $_.Exception.Message })
    }
  }

  $record.databaseCreated = Test-Path -LiteralPath $identity.databasePath -PathType Leaf
  $record.cleanup = Stop-R14Processes $appPath
  if (-not $launcher.HasExited -and -not $launcher.WaitForExit(20000)) {
    $record.launcherTimedOut = $true
    try { $launcher.Kill() } catch { }
    try { $launcher.WaitForExit() } catch { }
  }
  if ($launcher.HasExited) {
    $record.launcherExitCode = $launcher.ExitCode
  }
  $record.launcherStdout = $launcher.StandardOutput.ReadToEnd()
  $record.launcherStderr = $launcher.StandardError.ReadToEnd()

  if (-not $record.processObserved) { $record.errors += 'The official entry did not expose the deployed WorkBuddy process.' }
  if (-not $record.databaseCreated) { $record.errors += 'The role-specific workbuddy.db was not created.' }
  if ($record.launcherTimedOut) { $record.errors += 'The entry wrapper did not exit after controlled cleanup.' }
  if (@($record.cleanup.remaining).Count -ne 0) { $record.errors += 'A deployed WorkBuddy process remained after cleanup.' }
  if ($null -ne $record.launcherExitCode -and $record.launcherExitCode -ne 0 -and -not $record.cleanup.forcedCleanup) {
    $record.errors += "The entry wrapper exited with code $($record.launcherExitCode)."
  }
  $record.passed = $record.errors.Count -eq 0
  [pscustomobject]$record
}

$startedAt = Get-Date
$errors = @()
$deployment = Read-JsonFile $deploymentRecordPath
$package = Test-R14Package -AppRoot $appRoot -ManifestPath $script:R14SnapshotManifest
if (-not $package.passed) { $errors += @($package.errors) }

$sync = Read-JsonFile $syncPath
$pointer = Read-JsonFile $pointerPath
$recovery = Read-JsonFile $recoveryPath
$snapshot = Read-JsonFile $snapshotRecordPath
$phaseSwitch = Read-JsonFile $phaseSwitchPath

$identityChecks = [ordered]@{
  deploymentStatus = ([string]$deployment.status -eq 'deployed-awaiting-e0')
  deploymentPlan = ([string]$deployment.planId -eq 'R1-4')
  deploymentSnapshot = ([string]$deployment.snapshotId -eq 'S2' -and [string]$deployment.qa -eq 'QA2')
  sourceSyncVerified = ([string]$sync.sourceSyncStatus -eq 'verified')
  sourceSyncBatch = ([string]$sync.batchId -eq 'B2')
  sourceSyncCandidate = ((Get-NormalizedFullPath ([string]$sync.candidateDir)) -eq (Get-NormalizedFullPath 'E:\workbuddy 复审\B2\R1-Fix2-only'))
  sourceSyncStrategy = ([string]$sync.candidateStrategy -eq 'direct')
  sourcePackageReadOnly = [bool]$sync.sourcePackageReadOnly
  pointerVerified = ([string]$pointer.sourceSyncStatus -eq 'verified')
  pointerMatchesCandidate = ([string]$pointer.candidateDir -eq [string]$sync.candidateDir)
  pointerMatchesSourcePackage = ([string]$pointer.sourcePackageDir -eq [string]$sync.sourcePackageDir)
  pointerMatchesManifest = ([string]$pointer.candidateSourceManifestSha256 -eq [string]$sync.candidateSourceManifestSha256)
  pointerMatchesTree = ([string]$pointer.candidateSourceTreeFingerprint -eq [string]$sync.candidateSourceTreeFingerprint)
  pointerMatchesApprovedDiff = ([string]$pointer.approvedDiffFingerprint -eq [string]$sync.approvedDiffFingerprint)
  recoveryVerified = ([string]$recovery.sourceRecoveryStatus -eq 'verified')
  recoveryRequiredSourcePresent = (@($recovery.requiredSourceFiles) -contains 'tests/r1Fix2.spec.ts')
  snapshotIdentity = ([string]$snapshot.snapshot -eq 'S2' -and [string]$snapshot.qa -eq 'QA2' -and [string]$snapshot.candidate -eq 'R1-Fix2')
  snapshotReadOnly = [bool]$snapshot.immutableFilesReadOnly
  snapshotExeMatches = ([string]$snapshot.snapshotWorkbuddyExeSha256 -eq $script:R14ExpectedExeSha256)
  snapshotManifestMatches = ([string]$snapshot.snapshotManifestSha256 -eq $script:R14ExpectedManifestSha256)
  phaseSwitchStillDisabled = ([string]$phaseSwitch.state -eq 'disabled' -and [string]$phaseSwitch.stage -eq 'B1' -and [string]$phaseSwitch.b1Status -eq 'in-progress')
  longTermDoesNotIncludeR14 = (-not (@($phaseSwitch.planIds) -contains 'R1-4'))
}
foreach ($item in $identityChecks.GetEnumerator()) {
  if (-not [bool]$item.Value) { $errors += "Identity check failed: $($item.Key)" }
}

$boundaryBefore = [ordered]@{
  phaseSwitchSha256 = Get-HashUpper $phaseSwitchPath
  b1LauncherSha256 = Get-HashUpper $b1LauncherPath
  b1SelectorSha256 = Get-HashUpper $b1SelectorPath
}
if ([string]$deployment.protectedAssets.phaseSwitchSha256 -ne $boundaryBefore.phaseSwitchSha256) { $errors += 'phase-switch.json changed after deployment.' }
if ([string]$deployment.protectedAssets.b1LauncherSha256 -ne $boundaryBefore.b1LauncherSha256) { $errors += 'The B1 launcher changed after deployment.' }
if ([string]$deployment.protectedAssets.b1SelectorSha256 -ne $boundaryBefore.b1SelectorSha256) { $errors += 'The B1 selector changed after deployment.' }

$initialProcesses = @(Get-WorkBuddyProcesses)
if ($initialProcesses.Count -ne 0) { $errors += 'A WorkBuddy process existed before E0 preflight.' }

$launches = @()
if (-not $SkipLaunchProbe -and $errors.Count -eq 0) {
  foreach ($role in @('GPT', 'USER')) {
    $probe = Invoke-RoleLaunchProbe -Role $role
    $launches += $probe
    if (-not $probe.passed) { $errors += @($probe.errors | ForEach-Object { "${role}: $_" }) }
    if (@(Get-WorkBuddyProcesses).Count -ne 0) {
      $errors += "A WorkBuddy process remained after the $role probe."
      break
    }
  }
}

$roleIdentities = @()
foreach ($role in @('GPT', 'USER')) {
  $registry = Join-Path $entryRoot "registered-R1-4-$role.ini"
  $values = Read-IniValues $registry
  if ($values.ContainsKey('DATE') -and [string]$values['DATE'] -match '^\d{8}$') {
    $roleIdentities += Get-RoleIdentity -DeploymentRoot $deploymentRoot -Role $role -Date ([string]$values['DATE'])
  } else {
    $errors += "Missing or invalid R1-4 $role registry."
  }
}
if ($roleIdentities.Count -eq 2) {
  if ((Get-NormalizedFullPath $roleIdentities[0].dataDir) -eq (Get-NormalizedFullPath $roleIdentities[1].dataDir)) {
    $errors += 'GPT and USER resolved to the same userData directory.'
  }
  if ($roleIdentities[0].prefix -eq $roleIdentities[1].prefix) {
    $errors += 'GPT and USER resolved to the same prefix.'
  }
  foreach ($identity in $roleIdentities) {
    if (-not (Test-PathWithin $identity.dataDir (Join-Path $deploymentRoot 'data'))) {
      $errors += "Role data escaped the R1-4 deployment root: $($identity.dataDir)"
    }
  }
}

$boundaryAfter = [ordered]@{
  phaseSwitchSha256 = Get-HashUpper $phaseSwitchPath
  b1LauncherSha256 = Get-HashUpper $b1LauncherPath
  b1SelectorSha256 = Get-HashUpper $b1SelectorPath
}
if (($boundaryBefore | ConvertTo-Json -Compress) -ne ($boundaryAfter | ConvertTo-Json -Compress)) {
  $errors += 'A protected B1 or long-term gate asset changed during E0.'
}

$finalProcesses = @(Get-WorkBuddyProcesses)
if ($finalProcesses.Count -ne 0) { $errors += 'A WorkBuddy process remained at the end of E0.' }

$passed = $errors.Count -eq 0 -and ($SkipLaunchProbe -or (@($launches | Where-Object { $_.passed }).Count -eq 2))
$result = [ordered]@{
  schemaVersion = 1
  record = 'R1-4-E0-static-entry-gate'
  planId = 'R1-4'
  version = 'v0.3'
  qa = 'QA2'
  snapshotId = 'S2'
  runAt = (Get-Date).ToString('o')
  status = if ($passed) { 'passed' } else { 'pending-or-failed' }
  allChecksPassed = $passed
  scope = 'Static E0 deployment, entry, package, role-isolation, and boundary verification only. No R1-4 business test point was executed.'
  state = [ordered]@{
    planStatus = if ($passed) { 'ready' } else { 'created' }
    staticGate = if ($passed) { 'passed' } else { 'pending' }
    testPointStatus = 'R1-4-T01..T06=not-tested'
    closureStatus = 'not-started'
    statusKind = 'E0 status'
  }
  officialEntry = $launcherPath
  roleSelector = $selectorPath
  programCopy = $appRoot
  evidenceRoot = Join-Path $deploymentRoot 'evidence'
  sourceSnapshot = $script:R14SnapshotRoot
  entryAssets = [ordered]@{
    launcher = [ordered]@{ path = $launcherPath; sha256 = Get-HashUpper $launcherPath }
    selector = [ordered]@{ path = $selectorPath; sha256 = Get-HashUpper $selectorPath }
    preflight = [ordered]@{ path = $PSCommandPath; sha256 = Get-HashUpper $PSCommandPath }
    common = [ordered]@{ path = Join-Path $entryRoot 'R1-4-Common.ps1'; sha256 = Get-HashUpper (Join-Path $entryRoot 'R1-4-Common.ps1') }
    verifier = [ordered]@{ path = Join-Path $entryRoot 'Verify-R1-4-Package.ps1'; sha256 = Get-HashUpper (Join-Path $entryRoot 'Verify-R1-4-Package.ps1') }
  }
  package = $package
  identityChecks = $identityChecks
  roleIdentities = @($roleIdentities)
  controlledLaunchProbes = @($launches)
  guiPrefix = [ordered]@{
    status = 'not-observed'
    reason = 'Visible business-record prefix evidence belongs to R1-4-T01 and remains not-tested.'
  }
  protectedAssets = [ordered]@{
    before = $boundaryBefore
    after = $boundaryAfter
    unchanged = (($boundaryBefore | ConvertTo-Json -Compress) -eq ($boundaryAfter | ConvertTo-Json -Compress))
    b1DataInspected = $false
    realUserDataInspected = $false
    longTermEntryUsed = $false
    b1EntryUsed = $false
  }
  initialProcesses = @($initialProcesses)
  finalProcesses = @($finalProcesses)
  errors = @($errors)
  updatedAt = (Get-Date).ToString('o')
  updatedBy = 'GPT/E0-preflight'
  evidence = @($deploymentRecordPath, $syncPath, $pointerPath, $recoveryPath, $snapshotRecordPath)
  nextAction = if ($passed) { 'R1-4-T01 may start under Prompt 12; no business result is implied.' } else { 'Keep R1-4 at planStatus=created/staticGate=pending and repair only the listed E0 prerequisite gaps.' }
}
Write-AtomicJson -Path $ResultPath -Value $result

Write-Output ("R1-4 E0: passed={0}; status={1}; evidence={2}" -f $passed,$result.status,$ResultPath)
if (-not $passed) { exit 1 }
