param(
  [Parameter(Mandatory=$true)]
  [string]$WindowsSourcePath,
  [string]$Distro = "Ubuntu-22.04",
  [string]$LinuxTargetPath = "/home/aflocat/tf",
  [switch]$DeleteExtra
)

if (-not (Test-Path $WindowsSourcePath)) {
  throw "Source path does not exist: $WindowsSourcePath"
}

$sourceResolved = (Resolve-Path $WindowsSourcePath).Path
$sourceWslPath = $sourceResolved -replace '^([A-Za-z]):', '/mnt/$1'
$sourceWslPath = $sourceWslPath -replace '\\', '/'
$sourceWslPath = $sourceWslPath.ToLower()

$deleteFlag = if ($DeleteExtra.IsPresent) { "--delete" } else { "" }
$rsyncCmd = "mkdir -p $LinuxTargetPath; rsync -a $deleteFlag --exclude '.git/' --exclude '__pycache__/' \"$sourceWslPath/\" \"$LinuxTargetPath/\""

Write-Host "[sync-local] $sourceResolved -> $LinuxTargetPath"
& wsl.exe -d $Distro -- bash -lc $rsyncCmd
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  throw "Local sync failed. Exit code: $exitCode"
}
