[CmdletBinding()]
param(
  [string]$Version,
  [switch]$Latest,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-RepoRoot {
  $scriptDir = $PSScriptRoot

  if (-not $scriptDir) {
    throw 'PSScriptRoot is unavailable; cannot resolve repository root.'
  }

  return (Resolve-Path (Join-Path $scriptDir '..')).Path
}

function Get-PdfiumVersionFromCargo {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CargoTomlPath
  )

  $content = Get-Content -Path $CargoTomlPath -Raw
  $match = [regex]::Match($content, 'pdfium_(\d{4})')

  if ($match.Success) {
    return $match.Groups[1].Value
  }

  if ($content -match 'pdfium_latest') {
    throw 'Cargo.toml uses pdfium_latest. Run this script with -Latest or pass -Version 7763-style explicitly.'
  }

  throw 'Could not infer a pdfium_XXXX feature from src-tauri/Cargo.toml.'
}

function Get-LatestPdfiumVersion {
  $headers = @{ 'User-Agent' = 'Workstation-PDFium-Sync' }
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/bblanchon/pdfium-binaries/releases/latest' -Headers $headers

  if ($release.tag_name -match 'chromium/(\d+)') {
    return $Matches[1]
  }

  throw "Unexpected latest release tag: $($release.tag_name)"
}

function Resolve-ExtractedPackageDir {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ExtractDir
  )

  $candidateDirs = @(
    (Join-Path $ExtractDir 'pdfium-win-x64'),
    $ExtractDir
  )

  foreach ($candidateDir in $candidateDirs) {
    $dllPath = Join-Path $candidateDir 'bin\pdfium.dll'
    if (Test-Path $dllPath) {
      return $candidateDir
    }
  }

  throw "Extracted archive does not contain bin\\pdfium.dll under $ExtractDir"
}

if ($Latest -and $Version) {
  throw 'Use either -Latest or -Version, not both.'
}

$repoRoot = Get-RepoRoot
$cargoTomlPath = Join-Path $repoRoot 'src-tauri\Cargo.toml'
$targetDir = Join-Path $repoRoot 'src-tauri\bin\pdfium-win-x64'
$targetDllPath = Join-Path $targetDir 'bin\pdfium.dll'
$assetName = 'pdfium-win-x64.tgz'
$cargoFeatureVersion = $null

try {
  $cargoFeatureVersion = Get-PdfiumVersionFromCargo -CargoTomlPath $cargoTomlPath
}
catch {
  if (-not $Latest) {
    throw
  }
}

if (-not $Version) {
  if ($Latest) {
    $Version = Get-LatestPdfiumVersion
  }
  else {
    $Version = $cargoFeatureVersion
  }
}

if ($Latest -and $cargoFeatureVersion -and ($cargoFeatureVersion -ne $Version)) {
  Write-Warning "Cargo.toml is pinned to pdfium_$cargoFeatureVersion, but -Latest resolved to $Version. Update src-tauri/Cargo.toml as well if you intend to use the newer DLL at runtime."
}

$tag = "chromium/$Version"
$encodedTag = [Uri]::EscapeDataString($tag)
$downloadUrl = "https://github.com/bblanchon/pdfium-binaries/releases/download/$encodedTag/$assetName"

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("workstation-pdfium-" + [Guid]::NewGuid().ToString('N'))
$archivePath = Join-Path $tempRoot $assetName
$extractDir = Join-Path $tempRoot 'extract'

try {
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  New-Item -ItemType Directory -Path $extractDir | Out-Null

  Write-Host "[pdfium] target feature version: $Version"
  Write-Host "[pdfium] downloading: $downloadUrl"

  Invoke-WebRequest -Uri $downloadUrl -Headers @{ 'User-Agent' = 'Workstation-PDFium-Sync' } -OutFile $archivePath

  $tarCommand = Get-Command tar.exe -ErrorAction SilentlyContinue

  if (-not $tarCommand) {
    throw 'tar.exe was not found. Install Windows bsdtar/tar support or extract the archive manually once.'
  }

  & $tarCommand.Source -xzf $archivePath -C $extractDir

  if ($LASTEXITCODE -ne 0) {
    throw "Archive extraction failed with exit code $LASTEXITCODE"
  }

  $packageDir = Resolve-ExtractedPackageDir -ExtractDir $extractDir
  $downloadedDllPath = Join-Path $packageDir 'bin\pdfium.dll'
  $downloadedVersion = (Get-Item $downloadedDllPath).VersionInfo.FileVersion
  $existingVersion = $null

  if (Test-Path $targetDllPath) {
    $existingVersion = (Get-Item $targetDllPath).VersionInfo.FileVersion
  }

  if ((-not $Force) -and $existingVersion -and ($existingVersion -eq $downloadedVersion)) {
    Write-Host "[pdfium] already up to date: $existingVersion"
    return
  }

  if (Test-Path $targetDir) {
    Remove-Item -Path $targetDir -Recurse -Force
  }

  Move-Item -Path $packageDir -Destination $targetDir

  Write-Host "[pdfium] synced $targetDir"
  if ($existingVersion) {
    Write-Host "[pdfium] version: $existingVersion -> $downloadedVersion"
  }
  else {
    Write-Host "[pdfium] version: <none> -> $downloadedVersion"
  }
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -Path $tempRoot -Recurse -Force
  }
}