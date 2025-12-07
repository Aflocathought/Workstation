#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文件处理示例脚本
演示如何读取和处理文件
注意：出于安全考虑，实际使用时应限制文件访问权限
"""

import sys
import json
import os
from pathlib import Path

def analyze_file(filepath):
    """
    分析文件信息
    
    Args:
        filepath: 文件路径
        
    Returns:
        文件分析结果
    """
    try:
        path = Path(filepath)
        
        if not path.exists():
            return {
                'status': 'error',
                'error': f'File not found: {filepath}'
            }
        
        # 获取文件信息
        stats = path.stat()
        
        # 基本信息
        file_info = {
            'name': path.name,
            'extension': path.suffix,
            'size_bytes': stats.st_size,
            'size_mb': round(stats.st_size / (1024 * 1024), 2),
            'is_file': path.is_file(),
            'is_dir': path.is_dir(),
        }
        
        # 如果是文本文件，读取内容
        if path.suffix in ['.txt', '.md', '.json', '.csv', '.log']:
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    file_info['lines'] = len(content.splitlines())
                    file_info['characters'] = len(content)
                    file_info['words'] = len(content.split())
                    # 只返回前 1000 个字符的预览
                    file_info['preview'] = content[:1000]
            except Exception as e:
                file_info['read_error'] = str(e)
        
        return {
            'status': 'success',
            'file_info': file_info
        }
        
    except Exception as e:
        return {
            'status': 'error',
            'error': str(e)
        }

def main():
    """主函数"""
    try:
        if len(sys.argv) < 2:
            result = {
                'status': 'error',
                'error': 'Usage: file_handler.py <filepath>'
            }
        else:
            filepath = sys.argv[1]
            result = analyze_file(filepath)
        
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    except Exception as e:
        error_result = {
            'status': 'error',
            'error': str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
