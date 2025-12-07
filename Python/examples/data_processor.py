#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据处理示例脚本
演示如何接收 JSON 数据、处理后返回结果
"""

import sys
import json

def process_data(data):
    """
    处理输入数据
    
    Args:
        data: 输入数据字典
        
    Returns:
        处理后的结果字典
    """
    items = data.get('items', [])
    
    # 数据处理示例
    processed_items = []
    for item in items:
        if isinstance(item, str):
            processed_items.append({
                'original': item,
                'upper': item.upper(),
                'lower': item.lower(),
                'length': len(item),
                'reversed': item[::-1]
            })
        elif isinstance(item, (int, float)):
            processed_items.append({
                'original': item,
                'squared': item ** 2,
                'doubled': item * 2,
                'type': type(item).__name__
            })
    
    # 统计信息
    stats = {
        'total_items': len(items),
        'processed_items': len(processed_items),
        'string_count': sum(1 for i in items if isinstance(i, str)),
        'number_count': sum(1 for i in items if isinstance(i, (int, float)))
    }
    
    return {
        'status': 'success',
        'processed': processed_items,
        'statistics': stats
    }

def main():
    """主函数"""
    try:
        # 从命令行参数读取 JSON 数据
        if len(sys.argv) > 1:
            input_str = sys.argv[1]
        else:
            # 如果没有参数，使用默认测试数据
            input_str = json.dumps({
                'items': ['Hello', 'World', 123, 'Python', 3.14]
            })
        
        # 解析输入
        input_data = json.loads(input_str)
        
        # 处理数据
        result = process_data(input_data)
        
        # 输出结果
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    except json.JSONDecodeError as e:
        error_result = {
            'status': 'error',
            'error': f'Invalid JSON input: {str(e)}'
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)
    except Exception as e:
        error_result = {
            'status': 'error',
            'error': str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
