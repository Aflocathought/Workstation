// src-tauri/src/python.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use crate::app_paths::{python_user_dir, python_examples_dir};

#[derive(Debug, Serialize, Deserialize)]
pub struct PythonResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub execution_time_ms: u128,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScriptInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PythonInfo {
    pub version: String,
    pub executable: String,
    pub is_available: bool,
}

pub struct PythonService;

impl PythonService {
    pub fn new() -> Self {
        Self
    }
    
    fn get_python_executable(&self) -> Result<String, String> {
        let python_commands = vec!["python3", "python", "py"];
        
        for cmd in python_commands {
            if let Ok(output) = Command::new(cmd).arg("--version").output() {
                if output.status.success() {
                    return Ok(cmd.to_string());
                }
            }
        }
        
        Err("Python not found".to_string())
    }
    
    pub fn get_python_info(&self) -> Result<PythonInfo, String> {
        match self.get_python_executable() {
            Ok(executable) => {
                // some Python distributions print version to stderr, so capture both
                let output = Command::new(&executable)
                    .arg("--version")
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
                    .map_err(|e| format!("Failed to get version: {}", e))?;

                // prefer stdout, fall back to stderr
                let mut ver_bytes = output.stdout.clone();
                if ver_bytes.is_empty() {
                    ver_bytes = output.stderr.clone();
                }

                let version = String::from_utf8_lossy(&ver_bytes).trim().to_string();

                Ok(PythonInfo {
                    version,
                    executable,
                    is_available: true,
                })
            }
            Err(_) => Ok(PythonInfo {
                version: String::new(),
                executable: String::new(),
                is_available: false,
            }),
        }
    }
    
    fn validate_script_path(&self, script_name: &str) -> Result<PathBuf, String> {
        // 禁止路径遍历
        if script_name.contains("..") {
            return Err("Invalid script name: path traversal not allowed".to_string());
        }
        
        if !script_name.ends_with(".py") {
            return Err("Must end with .py".to_string());
        }
        
        // 处理 "user/script.py" 或 "examples/script.py" 格式
        if script_name.starts_with("user/") || script_name.starts_with("user\\") {
            let file_name = script_name.strip_prefix("user/")
                .or_else(|| script_name.strip_prefix("user\\"))
                .unwrap();
            let user_path = python_user_dir().join(file_name);
            if user_path.exists() {
                return Ok(user_path);
            }
        } else if script_name.starts_with("examples/") || script_name.starts_with("examples\\") {
            let file_name = script_name.strip_prefix("examples/")
                .or_else(|| script_name.strip_prefix("examples\\"))
                .unwrap();
            let examples_path = python_examples_dir().join(file_name);
            if examples_path.exists() {
                return Ok(examples_path);
            }
        } else {
            // 如果没有前缀,先尝试 user 目录,再尝试 examples 目录
            let user_path = python_user_dir().join(script_name);
            if user_path.exists() {
                return Ok(user_path);
            }
            
            let examples_path = python_examples_dir().join(script_name);
            if examples_path.exists() {
                return Ok(examples_path);
            }
        }
        
        Err(format!("Script not found: {}", script_name))
    }
    
    pub fn execute_script(&self, script_name: String, args: Vec<String>) -> Result<PythonResult, String> {
        let start_time = std::time::Instant::now();
        let python_exe = self.get_python_executable()?;
        let script_path = self.validate_script_path(&script_name)?;
        
        // Force unbuffered output and UTF-8 encoding to avoid mojibake for non-ASCII output
        let output = Command::new(&python_exe)
            // -u = unbuffered binary stdout and stderr
            .arg("-u")
            .arg(script_path)
            .args(args)
            .env("PYTHONIOENCODING", "utf-8")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to execute: {}", e))?;
        
        let execution_time = start_time.elapsed().as_millis();
        
        Ok(PythonResult {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code(),
            execution_time_ms: execution_time,
        })
    }
    
    pub fn list_scripts(&self) -> Result<Vec<ScriptInfo>, String> {
        let mut scripts = Vec::new();
        self.list_scripts_in_dir(&python_user_dir(), "user", &mut scripts)?;
        self.list_scripts_in_dir(&python_examples_dir(), "examples", &mut scripts)?;
        Ok(scripts)
    }
    
    fn list_scripts_in_dir(&self, dir: &PathBuf, category: &str, scripts: &mut Vec<ScriptInfo>) -> Result<(), String> {
        if !dir.exists() {
            return Ok(());
        }
        
        let entries = std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;
        
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("py") {
                let metadata = std::fs::metadata(&path).map_err(|e| format!("Failed to read metadata: {}", e))?;
                
                let modified = metadata.modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| {
                        chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                            .unwrap_or_default()
                    })
                    .unwrap_or_default();
                
                scripts.push(ScriptInfo {
                    name: format!("{}/{}", category, path.file_name().unwrap().to_string_lossy()),
                    path: path.to_string_lossy().to_string(),
                    size: metadata.len(),
                    modified,
                });
            }
        }
        
        Ok(())
    }
    
    pub fn save_script(&self, name: String, content: String) -> Result<(), String> {
        if name.contains("..") || name.contains("/") || name.contains("\\") {
            return Err("Invalid script name".to_string());
        }
        
        if !name.ends_with(".py") {
            return Err("Must end with .py".to_string());
        }
        
        let script_path = python_user_dir().join(name);
        std::fs::write(&script_path, content).map_err(|e| format!("Failed to save: {}", e))?;
        Ok(())
    }
    
    pub fn read_script(&self, name: String) -> Result<String, String> {
        let script_path = self.validate_script_path(&name)?;
        std::fs::read_to_string(&script_path).map_err(|e| format!("Failed to read: {}", e))
    }
    
    pub fn delete_script(&self, name: String) -> Result<(), String> {
        if !name.starts_with("user/") && !name.contains("..") {
            return Err("Can only delete user scripts".to_string());
        }
        
        let script_name = name.strip_prefix("user/").unwrap_or(&name);
        let script_path = python_user_dir().join(script_name);
        
        if !script_path.exists() {
            return Err("Script not found".to_string());
        }
        
        std::fs::remove_file(&script_path).map_err(|e| format!("Failed to delete: {}", e))?;
        Ok(())
    }
}
