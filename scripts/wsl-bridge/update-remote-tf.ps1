param(
  [Parameter(Mandatory=$true)]
  [string]$RemoteHost,
  [string]$RemoteUser = "",
  [string]$Branch = "main",
  [string]$Distro = "Ubuntu-22.04",
  [string]$LinuxPath = "/home/aflocat/tf",
  [string]$SshOptions = "-o StrictHostKeyChecking=no -o ConnectTimeout=10"
)

$target = if ([string]::IsNullOrWhiteSpace($RemoteUser)) { $RemoteHost } else { "$RemoteUser@$RemoteHost" }
$gitCmd = ('cd "{0}"; git fetch --all --prune; git checkout {1}; git pull --ff-only origin {1}' -f $LinuxPath, $Branch)
$escapedGitCmd = $gitCmd.Replace("\"", "\\\"")
$remoteCmd = "wsl -d $Distro -- bash -lc \"$escapedGitCmd\""

Write-Host "[remote-update] $target :: branch=$Branch"

$sshArgs = @()
if (-not [string]::IsNullOrWhiteSpace($SshOptions)) {
  $sshArgs += $SshOptions.Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
}
$sshArgs += $target
$sshArgs += $remoteCmd

& ssh @sshArgs
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  throw "Remote code update failed. Exit code: $exitCode"
}
