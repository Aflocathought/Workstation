// src/services/PythonService.ts
import { invoke } from '@tauri-apps/api/core';

/**
 * Python 执行结果
 */
export interface PythonResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  execution_time_ms: number;
}

/**
 * 脚本信息
 */
export interface ScriptInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
}

/**
 * Python 环境信息
 */
export interface PythonInfo {
  version: string;
  executable: string;
  is_available: boolean;
}

/**
 * Python 服务类
 * 提供与后端 Python 功能的交互接口
 */
class PythonService {
  /**
   * 执行 Python 脚本
   * @param scriptName 脚本名称（例如: "hello.py"）
   * @param args 传递给脚本的参数数组
   * @returns Python 执行结果
   */
  async executeScript(
    scriptName: string,
    args: string[] = []
  ): Promise<PythonResult> {
    try {
      const result = await invoke<PythonResult>('execute_python_script', {
        scriptName,
        args,
      });
      return result;
    } catch (error) {
      throw new Error(`Failed to execute script: ${error}`);
    }
  }

  /**
   * 列出所有可用的 Python 脚本
   * @returns 脚本信息数组
   */
  async listScripts(): Promise<ScriptInfo[]> {
    try {
      const scripts = await invoke<ScriptInfo[]>('list_python_scripts');
      return scripts;
    } catch (error) {
      throw new Error(`Failed to list scripts: ${error}`);
    }
  }

  /**
   * 保存 Python 脚本
   * @param name 脚本名称（必须以 .py 结尾）
   * @param content 脚本内容
   */
  async saveScript(name: string, content: string): Promise<void> {
    try {
      await invoke('save_python_script', { name, content });
    } catch (error) {
      throw new Error(`Failed to save script: ${error}`);
    }
  }

  /**
   * 读取 Python 脚本内容
   * @param name 脚本名称
   * @returns 脚本内容
   */
  async readScript(name: string): Promise<string> {
    try {
      const content = await invoke<string>('read_python_script', { name });
      return content;
    } catch (error) {
      throw new Error(`Failed to read script: ${error}`);
    }
  }

  /**
   * 删除 Python 脚本
   * @param name 脚本名称
   */
  async deleteScript(name: string): Promise<void> {
    try {
      await invoke('delete_python_script', { name });
    } catch (error) {
      throw new Error(`Failed to delete script: ${error}`);
    }
  }

  /**
   * 获取 Python 环境信息
   * @returns Python 环境信息
   */
  async getPythonInfo(): Promise<PythonInfo> {
    try {
      const info = await invoke<PythonInfo>('get_python_info');
      return info;
    } catch (error) {
      throw new Error(`Failed to get Python info: ${error}`);
    }
  }

  /**
   * 执行 Python 脚本并解析 JSON 输出
   * @param scriptName 脚本名称
   * @param args 参数数组
   * @returns 解析后的 JSON 对象
   */
  async executeScriptWithJSON<T = any>(
    scriptName: string,
    args: string[] = []
  ): Promise<T> {
    const result = await this.executeScript(scriptName, args);
    
    if (!result.success) {
      throw new Error(`Script execution failed: ${result.stderr}`);
    }
    
    try {
      return JSON.parse(result.stdout) as T;
    } catch (error) {
      throw new Error(`Failed to parse script output as JSON: ${error}`);
    }
  }
}

// 导出单例
export const pythonService = new PythonService();
