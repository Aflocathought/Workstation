# Win ↔ Win(SSH) ↔ WSL 操作指南（tf 项目）

这套脚本的核心原则：
- Win ↔ Win 走 `ssh`
- Win → WSL 一律走 `wsl.exe`（不依赖 WSL 虚拟网卡）

脚本目录：
- `Workstation/scripts/wsl-bridge/invoke-local-wsl.ps1`
- `Workstation/scripts/wsl-bridge/invoke-remote-wsl.ps1`
- `Workstation/scripts/wsl-bridge/update-remote-tf.ps1`
- `Workstation/scripts/wsl-bridge/sync-win-to-local-wsl.ps1`

## 1) 本机直接在 WSL 里执行

```powershell
./Workstation/scripts/wsl-bridge/invoke-local-wsl.ps1 `
  -Distro Ubuntu-22.04 `
  -LinuxPath /home/aflocat/tf `
  -Command "git status"
```

训练示例：
```powershell
./Workstation/scripts/wsl-bridge/invoke-local-wsl.ps1 `
  -Command "python train/lstm/run_train.py"
```

## 2) 远端 Windows 上执行其 WSL 命令

```powershell
./Workstation/scripts/wsl-bridge/invoke-remote-wsl.ps1 `
  -RemoteHost 192.168.1.88 `
  -RemoteUser admin `
  -Distro Ubuntu-22.04 `
  -LinuxPath /home/aflocat/tf `
  -Command "python train/lstm/run_train.py"
```

## 3) 远端 WSL 一键更新代码（git）

```powershell
./Workstation/scripts/wsl-bridge/update-remote-tf.ps1 `
  -RemoteHost 192.168.1.88 `
  -RemoteUser admin `
  -Branch main `
  -Distro Ubuntu-22.04 `
  -LinuxPath /home/aflocat/tf
```

## 4) 本机 Windows 目录同步到本机 WSL（无网络兜底）

```powershell
./Workstation/scripts/wsl-bridge/sync-win-to-local-wsl.ps1 `
  -WindowsSourcePath "D:\Programming\AI&Workstation\some-local-copy" `
  -Distro Ubuntu-22.04 `
  -LinuxTargetPath /home/aflocat/tf
```

若希望目标目录与源目录完全一致（删除目标多余文件）：
```powershell
./Workstation/scripts/wsl-bridge/sync-win-to-local-wsl.ps1 `
  -WindowsSourcePath "D:\Programming\AI&Workstation\some-local-copy" `
  -LinuxTargetPath /home/aflocat/tf `
  -DeleteExtra
```

## 5) 推荐日常流程

1. 本机改代码并提交到 git
2. 用 `update-remote-tf.ps1` 在远端拉取最新代码
3. 用 `invoke-remote-wsl.ps1` 启动训练/验证
4. 日志问题时先用 `invoke-remote-wsl.ps1 -Command "nvidia-smi"` 做健康检查

## 6) 说明

- 这套方案不会依赖“直连 WSL SSH”。
- 只要“Windows 的 SSH 可达 + 远端装有 WSL Ubuntu”，就可以稳定执行。
- `sync-win-to-local-wsl.ps1` 依赖 WSL 内 `rsync`；如未安装，可先在 WSL 执行：
  - `sudo apt update && sudo apt install -y rsync`
