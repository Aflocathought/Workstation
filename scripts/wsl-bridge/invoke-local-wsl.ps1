param(
  [string]$Distro = "Ubuntu-22.04",
  [string]$LinuxPath = "/home/aflocat/tf",
  [Parameter(Mandatory=$true)]
  [string]$Command
)

$wslExe = Get-Command wsl.exe -ErrorAction SilentlyContinue
if (-not $wslExe) {
  throw "wsl.exe not found. Please install WSL first."
}

$bashCmd = ('cd "{0}"; {1}' -f $LinuxPath, $Command)
Write-Host "[local-wsl] $Distro :: $bashCmd"

& wsl.exe -d $Distro -- bash -lc $bashCmd
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  throw "WSL command failed. Exit code: $exitCode"
}
