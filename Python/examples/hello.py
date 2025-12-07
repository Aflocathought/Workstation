#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hello World 示例脚本
演示基本的 Python 脚本执行和输出，输出环境信息
"""

import sys
import json
from datetime import datetime

def main():
    """主函数"""
    # 获取命令行参数
    if len(sys.argv) > 1:
        name = sys.argv[1]
    else:
        name = "World"
    
    # 构建结果
    result = {
        "message": f"Hello, {name}!",
        "timestamp": datetime.now().isoformat(),
        "python_version": sys.version,
        "args": sys.argv[1:]
    }
    
    # 输出 JSON 格式的结果
    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
