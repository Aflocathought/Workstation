// src-tauri/src/services/ssh.rs
//
// SSH 服务 — 通过 Windows OpenSSH 客户端实现
// 用途:
//   1. 测试远程机器连通性
//   2. 部署/更新 Worker 代码到远程机器
//   3. 启动/停止远程 Worker 服务
//   4. 文件传输 (SCP)
//
// 为什么用 Command 调 ssh 而不是 Rust ssh2 crate?
//   - Windows 10/11 自带 OpenSSH 客户端
//   - 不额外引入 libssh2 依赖
//   - 支持 .ssh/config 和 ssh-agent
//   - MVP 阶段够用

use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize)]
pub struct SshResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u128,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SshTestResult {
    pub reachable: bool,
    pub hostname: String,
    pub python_version: String,
    pub gpu_info: String,
    pub message: String,
    pub duration_ms: u128,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkerDeployResult {
    pub success: bool,
    pub message: String,
    pub steps: Vec<String>,
}

pub struct SshService;

impl SshService {
    pub fn new() -> Self {
        Self
    }

    /// 构建 SSH 命令的公共参数
    fn ssh_base_args(host: &str, user: &str, key_path: Option<&str>) -> Vec<String> {
        let mut args = vec![
            "-o".to_string(), "StrictHostKeyChecking=no".to_string(),
            "-o".to_string(), "ConnectTimeout=10".to_string(),
            "-o".to_string(), "BatchMode=yes".to_string(),
        ];

        if let Some(key) = key_path {
            if !key.is_empty() {
                args.push("-i".to_string());
                args.push(key.to_string());
            }
        }

        args.push(format!("{}@{}", user, host));
        args
    }

    /// 执行远程 SSH 命令
    pub fn exec_remote(
        &self,
        host: &str,
        user: &str,
        key_path: Option<&str>,
        command: &str,
    ) -> Result<SshResult, String> {
        let start = Instant::now();

        let mut args = Self::ssh_base_args(host, user, key_path);
        args.push(command.to_string());

        let output = Command::new("ssh")
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("SSH 执行失败: {}. 确保 OpenSSH 客户端已安装。", e))?;

        Ok(SshResult {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code(),
            duration_ms: start.elapsed().as_millis(),
        })
    }

    /// 测试远程连接 — 获取主机信息
    pub fn test_connection(
        &self,
        host: &str,
        user: &str,
        key_path: Option<&str>,
    ) -> Result<SshTestResult, String> {
        let start = Instant::now();

        // 先 ping 一下
        let test_cmd = "echo OK && hostname && python3 --version 2>&1 || python --version 2>&1 && nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'No GPU'";

        let result = self.exec_remote(host, user, key_path, test_cmd)?;

        if !result.success {
            return Ok(SshTestResult {
                reachable: false,
                hostname: String::new(),
                python_version: String::new(),
                gpu_info: String::new(),
                message: format!("连接失败: {}", result.stderr.trim()),
                duration_ms: start.elapsed().as_millis(),
            });
        }

        let lines: Vec<&str> = result.stdout.trim().lines().collect();

        Ok(SshTestResult {
            reachable: true,
            hostname: lines.get(1).unwrap_or(&"").to_string(),
            python_version: lines.get(2).unwrap_or(&"").to_string(),
            gpu_info: lines.get(3).unwrap_or(&"N/A").to_string(),
            message: "连接成功".to_string(),
            duration_ms: start.elapsed().as_millis(),
        })
    }

    /// SCP 上传文件到远程
    pub fn upload_file(
        &self,
        host: &str,
        user: &str,
        key_path: Option<&str>,
        local_path: &str,
        remote_path: &str,
    ) -> Result<SshResult, String> {
        let start = Instant::now();

        let mut args = vec![
            "-o".to_string(), "StrictHostKeyChecking=no".to_string(),
            "-o".to_string(), "ConnectTimeout=10".to_string(),
        ];

        if let Some(key) = key_path {
            if !key.is_empty() {
                args.push("-i".to_string());
                args.push(key.to_string());
            }
        }

        // 递归上传
        args.push("-r".to_string());
        args.push(local_path.to_string());
        args.push(format!("{}@{}:{}", user, host, remote_path));

        let output = Command::new("scp")
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("SCP 执行失败: {}", e))?;

        Ok(SshResult {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code(),
            duration_ms: start.elapsed().as_millis(),
        })
    }

    /// 部署 Worker 到远程机器
    /// 步骤: 上传代码 → 安装依赖 → 启动服务
    pub fn deploy_worker(
        &self,
        host: &str,
        user: &str,
        key_path: Option<&str>,
        worker_dir: &str,       // 本地 worker 目录路径
        remote_dir: &str,       // 远程安装目录
    ) -> Result<WorkerDeployResult, String> {
        let mut steps = Vec::new();

        // 1. 创建远程目录
        steps.push("创建远程目录...".to_string());
        let mkdir_result = self.exec_remote(host, user, key_path,
            &format!("mkdir -p {}", remote_dir))?;
        if !mkdir_result.success {
            return Ok(WorkerDeployResult {
                success: false,
                message: format!("创建目录失败: {}", mkdir_result.stderr),
                steps,
            });
        }
        steps.push("✅ 远程目录已创建".to_string());

        // 2. 上传 Worker 代码
        steps.push("上传 Worker 代码...".to_string());
        let upload_result = self.upload_file(host, user, key_path, worker_dir, remote_dir)?;
        if !upload_result.success {
            return Ok(WorkerDeployResult {
                success: false,
                message: format!("上传失败: {}", upload_result.stderr),
                steps,
            });
        }
        steps.push("✅ 代码已上传".to_string());

        // 3. 安装 Python 依赖
        steps.push("安装 Python 依赖...".to_string());
        let pip_cmd = format!(
            "cd {} && pip install -r requirements.txt --quiet 2>&1",
            remote_dir
        );
        let pip_result = self.exec_remote(host, user, key_path, &pip_cmd)?;
        if !pip_result.success {
            steps.push(format!("⚠️ 依赖安装可能有问题: {}", pip_result.stderr.chars().take(200).collect::<String>()));
        } else {
            steps.push("✅ 依赖已安装".to_string());
        }

        // 4. 启动 Worker 服务 (nohup 后台运行)
        steps.push("启动 Worker 服务...".to_string());
        let start_cmd = format!(
            "cd {} && nohup python -m uvicorn server:app --host 0.0.0.0 --port 8765 > worker.log 2>&1 &",
            remote_dir
        );
        let start_result = self.exec_remote(host, user, key_path, &start_cmd)?;
        steps.push("✅ Worker 已启动 (端口 8765)".to_string());

        Ok(WorkerDeployResult {
            success: true,
            message: "Worker 部署完成".to_string(),
            steps,
        })
    }

    /// 停止远程 Worker
    pub fn stop_worker(
        &self,
        host: &str,
        user: &str,
        key_path: Option<&str>,
    ) -> Result<SshResult, String> {
        self.exec_remote(host, user, key_path,
            "pkill -f 'uvicorn server:app' || echo 'No worker process found'")
    }
}
