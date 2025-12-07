// src/Tools/Python/PythonTool.tsx
import { Component, createSignal, onMount, For, Show } from 'solid-js';
import { pythonService, type PythonInfo, type ScriptInfo, type PythonResult } from '../../services/PythonService';
import styles from './PythonTool.module.css';

/**
 * Python 工具主界面
 * 提供 Python 脚本管理和执行功能
 */
const PythonTool: Component = () => {
  const [pythonInfo, setPythonInfo] = createSignal<PythonInfo | null>(null);
  const [scripts, setScripts] = createSignal<ScriptInfo[]>([]);
  const [selectedScript, setSelectedScript] = createSignal<string>('');
  const [scriptArgs, setScriptArgs] = createSignal<string>('');
  const [result, setResult] = createSignal<PythonResult | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string>('');

  // 加载 Python 环境信息和脚本列表
  onMount(async () => {
    await loadPythonInfo();
    await loadScripts();
  });

  // 加载 Python 环境信息
  const loadPythonInfo = async () => {
    try {
      const info = await pythonService.getPythonInfo();
      setPythonInfo(info);
      
      if (!info.is_available) {
        setError('Python 未安装或未找到。请安装 Python 3.7 或更高版本。');
      }
    } catch (err) {
      setError(`获取 Python 信息失败: ${err}`);
    }
  };

  // 加载脚本列表
  const loadScripts = async () => {
    try {
      console.log('🔍 开始加载脚本列表...');
      const scriptList = await pythonService.listScripts();
      console.log('✅ 脚本列表加载成功:', scriptList);
      setScripts(scriptList);
    } catch (err) {
      console.error('❌ 加载脚本列表失败:', err);
      setError(`加载脚本列表失败: ${err}`);
    }
  };

  // 执行脚本
  const handleExecute = async () => {
    if (!selectedScript()) {
      setError('请选择一个脚本');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      // 解析参数（空格分隔）
      const args = scriptArgs().trim() 
        ? scriptArgs().trim().split(/\s+/)
        : [];

      const execResult = await pythonService.executeScript(selectedScript(), args);
      setResult(execResult);
    } catch (err) {
      setError(`执行失败: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // 快速测试示例脚本
  const handleQuickTest = async (scriptName: string, args: string[] = []) => {
    setSelectedScript(scriptName);
    setScriptArgs(args.join(' '));
    
    // 延迟一下再执行，让用户看到选择
    setTimeout(() => handleExecute(), 100);
  };

  return (
    <div class={styles.container}>
      {/* 标题 */}
      <div class={styles.header}>
        <h2 class={styles.title}>🐍 Python 脚本工具</h2>
        <p class={styles.description}>
          执行 Python 脚本进行数据处理、文件操作等任务
        </p>
      </div>

      {/* Python 环境信息 */}
      <Show when={pythonInfo()}>
        <div class={styles.infoCard}>
          <div class={styles.infoRow}>
            <span class={styles.infoLabel}>Python 状态:</span>
            <span class={pythonInfo()?.is_available ? styles.statusAvailable : styles.statusUnavailable}>
              {pythonInfo()?.is_available ? '✓ 可用' : '✗ 不可用'}
            </span>
          </div>
          <Show when={pythonInfo()?.is_available}>
            <div class={styles.infoRow}>
              <span class={styles.infoLabel}>版本:</span>
              <span class={styles.infoValue}>{pythonInfo()?.version}</span>
            </div>
            <div class={styles.infoRow}>
              <span class={styles.infoLabel}>可执行文件:</span>
              <span class={styles.infoValue}>{pythonInfo()?.executable}</span>
            </div>
          </Show>
        </div>
      </Show>

      {/* 错误提示 */}
      <Show when={error()}>
        <div class={styles.errorBox}>
          <strong>错误：</strong> {error()}
        </div>
      </Show>

      {/* 脚本执行区域 */}
      <Show when={pythonInfo()?.is_available}>
        <div class={styles.executionSection}>
          <h3 class={styles.sectionTitle}>执行脚本</h3>
          
          {/* 脚本选择 */}
          <div class={styles.formGroup}>
            <label class={styles.label}>选择脚本:</label>
            <select
              class={styles.select}
              value={selectedScript()}
              onChange={(e) => setSelectedScript(e.currentTarget.value)}
            >
              <option value="">-- 选择脚本 --</option>
              <For each={scripts()}>
                {(script) => (
                  <option value={script.name}>{script.name}</option>
                )}
              </For>
            </select>
          </div>

          {/* 参数输入 */}
          <div class={styles.formGroup}>
            <label class={styles.label}>参数 (空格分隔):</label>
            <input
              type="text"
              class={styles.input}
              value={scriptArgs()}
              onInput={(e) => setScriptArgs(e.currentTarget.value)}
              placeholder='例如: arg1 arg2 {"key": "value"}'
            />
          </div>

          {/* 执行按钮 */}
          <button
            class={styles.executeButton}
            onClick={handleExecute}
            disabled={loading() || !selectedScript()}
          >
            {loading() ? '⏳ 执行中...' : '▶️ 执行脚本'}
          </button>

          {/* 快速测试按钮 */}
          <div class={styles.quickTestSection}>
            <h4 class={styles.quickTestTitle}>快速测试:</h4>
            <div class={styles.quickTestButtons}>
              <button
                class={styles.quickTestButton}
                onClick={() => handleQuickTest('hello.py', ['Workstation'])}
                disabled={loading()}
              >
                Hello World
              </button>
              <button
                class={styles.quickTestButton}
                onClick={() => handleQuickTest('data_processor.py', [JSON.stringify({ items: ['test', 'data', 123] })])}
                disabled={loading()}
              >
                数据处理
              </button>
            </div>
          </div>
        </div>

        {/* 执行结果 */}
        <Show when={result()}>
          <div class={styles.resultSection}>
            <div class={styles.resultHeader}>
              <h3 class={styles.sectionTitle}>执行结果</h3>
              <span class={result()?.success ? styles.resultSuccess : styles.resultError}>
                {result()?.success ? '✓ 成功' : '✗ 失败'}
              </span>
            </div>

            {/* 执行信息 */}
            <div class={styles.resultInfo}>
              <span class={styles.resultLabel}>执行时间:</span>
              <span class={styles.resultValue}>{result()?.execution_time_ms} ms</span>
              <span class={styles.resultLabel}>退出码:</span>
              <span class={styles.resultValue}>{result()?.exit_code ?? 'N/A'}</span>
            </div>

            {/* 标准输出 */}
            <Show when={result()?.stdout}>
              <div class={styles.outputBox}>
                <h4 class={styles.outputTitle}>标准输出 (stdout):</h4>
                <pre class={styles.outputContent}>{result()?.stdout}</pre>
              </div>
            </Show>

            {/* 错误输出 */}
            <Show when={result()?.stderr}>
              <div class={styles.outputBox}>
                <h4 class={styles.outputTitle}>错误输出 (stderr):</h4>
                <pre class={styles.outputError}>{result()?.stderr}</pre>
              </div>
            </Show>
          </div>
        </Show>

        {/* 可用脚本列表 */}
        <div class={styles.scriptsSection}>
          <h3 class={styles.sectionTitle}>可用脚本 ({scripts().length})</h3>
          <div class={styles.scriptsList}>
            <For each={scripts()}>
              {(script) => (
                <div class={styles.scriptCard}>
                  <div class={styles.scriptName}>{script.name}</div>
                  <div class={styles.scriptInfo}>
                    <span class={styles.scriptSize}>
                      {(script.size / 1024).toFixed(2)} KB
                    </span>
                    <span class={styles.scriptDate}>{script.modified}</span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default PythonTool;
