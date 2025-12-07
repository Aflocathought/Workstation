use std::path::PathBuf;

/// 获取应用数据根目录
/// Windows: %APPDATA%/com.tauri-app.Workstation
/// 其他: ./.Workstation-data
pub fn app_data_dir() -> PathBuf {
    if let Some(app_data) = std::env::var_os("APPDATA") {
        let mut path = PathBuf::from(app_data);
        path.push("com.tauri-app.Workstation");
        path
    } else {
        std::env::current_dir()
            .expect("无法获取当前目录")
            .join(".Workstation-data")
    }
}

/// 获取数据库文件路径
pub fn db_path() -> PathBuf {
    let mut dir = app_data_dir();
    dir.push("time_tracker.db");
    dir
}

/// 获取 Python 脚本根目录
pub fn python_dir() -> PathBuf {
    let mut dir = app_data_dir();
    dir.push("Python");
    dir
}

/// 获取 Python 示例脚本目录
pub fn python_examples_dir() -> PathBuf {
    let mut dir = python_dir();
    dir.push("examples");
    dir
}

/// 获取 Python 用户脚本目录
pub fn python_user_dir() -> PathBuf {
    let mut dir = python_dir();
    dir.push("user");
    dir
}

/// 初始化所有必要的目录
/// 在应用启动时调用,确保所有数据目录存在
pub fn init_directories() -> Result<(), std::io::Error> {
    // 创建根目录
    let app_dir = app_data_dir();
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir)?;
        println!("✅ 创建应用数据目录: {:?}", app_dir);
    }

    // 创建 Python 相关目录
    let python_examples = python_examples_dir();
    if !python_examples.exists() {
        std::fs::create_dir_all(&python_examples)?;
        println!("✅ 创建 Python 示例目录: {:?}", python_examples);
    }

    let python_user = python_user_dir();
    if !python_user.exists() {
        std::fs::create_dir_all(&python_user)?;
        println!("✅ 创建 Python 用户目录: {:?}", python_user);
    }

    // 创建示例脚本
    create_example_scripts()?;

    Ok(())
}

/// 创建示例 Python 脚本
fn create_example_scripts() -> Result<(), std::io::Error> {
    let examples_dir = python_examples_dir();

    // 示例 1: Hello World
    let hello_script = examples_dir.join("hello.py");
    if !hello_script.exists() {
        std::fs::write(
            &hello_script,
            r#"#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
示例脚本 1: Hello World
最简单的 Python 脚本示例
"""

print("Hello from Python!")
print("这是一个示例脚本")
print("=" * 50)

import sys
print(f"Python 版本: {sys.version}")
print(f"平台: {sys.platform}")
"#,
        )?;
        println!("✅ 创建示例脚本: hello.py");
    }

    // 示例 2: 文件处理
    let file_script = examples_dir.join("file_handler.py");
    if !file_script.exists() {
        std::fs::write(
            &file_script,
            r#"#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
示例脚本 2: 文件处理
演示如何读取和处理文件
"""

import sys
import os
from pathlib import Path

def main():
    print("=" * 60)
    print("文件处理示例")
    print("=" * 60)
    
    # 获取当前工作目录
    cwd = Path.cwd()
    print(f"\n当前工作目录: {cwd}")
    
    # 列出当前目录下的文件
    print(f"\n目录内容:")
    for item in cwd.iterdir():
        file_type = "目录" if item.is_dir() else "文件"
        size = item.stat().st_size if item.is_file() else "-"
        print(f"  [{file_type}] {item.name} ({size} bytes)")
    
    # 如果提供了参数,读取文件
    if len(sys.argv) > 1:
        file_path = Path(sys.argv[1])
        if file_path.exists():
            print(f"\n读取文件: {file_path}")
            try:
                content = file_path.read_text(encoding='utf-8')
                print(f"文件内容 ({len(content)} 字符):")
                print("-" * 60)
                print(content[:500])  # 只显示前 500 字符
                if len(content) > 500:
                    print(f"... (还有 {len(content) - 500} 个字符)")
            except Exception as e:
                print(f"❌ 读取失败: {e}")
        else:
            print(f"❌ 文件不存在: {file_path}")

if __name__ == "__main__":
    main()
"#,
        )?;
        println!("✅ 创建示例脚本: file_handler.py");
    }

    // 示例 3: 数据处理
    let data_script = examples_dir.join("data_processor.py");
    if !data_script.exists() {
        std::fs::write(
            &data_script,
            r#"#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
示例脚本 3: 数据处理
演示简单的数据统计和处理
"""

import sys
import json
from datetime import datetime

def process_numbers(numbers):
    """处理数字列表,返回统计信息"""
    if not numbers:
        return {"error": "没有提供数字"}
    
    return {
        "count": len(numbers),
        "sum": sum(numbers),
        "average": sum(numbers) / len(numbers),
        "min": min(numbers),
        "max": max(numbers),
        "sorted": sorted(numbers),
    }

def main():
    print("=" * 60)
    print("数据处理示例")
    print("=" * 60)
    
    # 从命令行参数获取数字
    if len(sys.argv) > 1:
        try:
            numbers = [float(x) for x in sys.argv[1:]]
            print(f"\n输入的数字: {numbers}")
            
            result = process_numbers(numbers)
            
            print(f"\n统计结果:")
            print(f"  数量: {result['count']}")
            print(f"  总和: {result['sum']:.2f}")
            print(f"  平均值: {result['average']:.2f}")
            print(f"  最小值: {result['min']:.2f}")
            print(f"  最大值: {result['max']:.2f}")
            print(f"  排序后: {result['sorted']}")
            
            # 也可以输出 JSON 格式
            print(f"\nJSON 输出:")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            
        except ValueError as e:
            print(f"❌ 错误: 请提供有效的数字")
            print(f"用法: python data_processor.py 1 2 3 4 5")
    else:
        # 使用默认数据
        numbers = [10, 25, 30, 15, 20, 35, 40]
        print(f"\n使用默认数据: {numbers}")
        result = process_numbers(numbers)
        print(f"\n统计结果:")
        print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
"#,
        )?;
        println!("✅ 创建示例脚本: data_processor.py");
    }



    Ok(())
}
