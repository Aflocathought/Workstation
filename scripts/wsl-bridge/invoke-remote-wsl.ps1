param(
  [Parameter(Mandatory=$true)]
  [string]$RemoteHost,
  [string]$RemoteUser = "",
  [string]$Distro = "Ubuntu-22.04",
  [string]$LinuxPath = "/home/aflocat/tf",
  [Parameter(Mandatory=$true)]
  [string]$Command,
  [string]$SshOptions = "-o StrictHostKeyChecking=no -o ConnectTimeout=10"
)

$target = if ([string]::IsNullOrWhiteSpace($RemoteUser)) { $RemoteHost } else { "$RemoteUser@$RemoteHost" }

$remoteBash = ('cd "{0}"; {1}' -f $LinuxPath, $Command)
$escapedRemoteBash = $remoteBash.Replace("\"", "\\\"")
$remoteCmd = "wsl -d $Distro -- bash -lc \"$escapedRemoteBash\""

Write-Host "[remote-wsl] $target :: $remoteBash"

$sshArgs = @()
if (-not [string]::IsNullOrWhiteSpace($SshOptions)) {
  $sshArgs += $SshOptions.Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
}
$sshArgs += $target
$sshArgs += $remoteCmd

& ssh @sshArgs
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  throw "Remote WSL command failed. Exit code: $exitCode"
}
