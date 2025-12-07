#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
日历管理工具
支持创建 .ics 文件、与 Gmail Calendar 同步
"""

import json
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path

try:
    from icalendar import Calendar, Event, vText
    import pytz
except ImportError:
    print(json.dumps({
        "error": "缺少依赖",
        "message": "请安装依赖: pip install icalendar pytz google-auth-oauthlib google-auth-httplib2 google-api-python-client"
    }, ensure_ascii=False))
    sys.exit(1)


class CalendarManager:
    """日历管理器"""
    
    def __init__(self, calendar_dir=None):
        """
        初始化日历管理器
        
        Args:
            calendar_dir: 日历文件存储目录，默认为用户数据目录
        """
        if calendar_dir is None:
            # 使用用户数据目录
            app_data = os.getenv('APPDATA') or os.path.expanduser('~/.local/share')
            calendar_dir = Path(app_data) / 'Workstation' / 'Calendar'
        
        self.calendar_dir = Path(calendar_dir)
        self.calendar_dir.mkdir(parents=True, exist_ok=True)
        
        self.calendar_file = self.calendar_dir / 'events.ics'
        self.credentials_file = self.calendar_dir / 'gmail_credentials.json'
        self.token_file = self.calendar_dir / 'gmail_token.json'
        
        # 初始化日历
        self.calendar = self._load_calendar()
    
    def _load_calendar(self):
        """加载现有日历或创建新日历"""
        if self.calendar_file.exists():
            with open(self.calendar_file, 'rb') as f:
                return Calendar.from_ical(f.read())
        else:
            cal = Calendar()
            cal.add('prodid', '-//Workstation Calendar//EN')
            cal.add('version', '2.0')
            cal.add('calscale', 'GREGORIAN')
            cal.add('method', 'PUBLISH')
            cal.add('x-wr-calname', 'Workstation 日历')
            cal.add('x-wr-timezone', 'Asia/Shanghai')
            return cal
    
    def _save_calendar(self):
        """保存日历到文件"""
        with open(self.calendar_file, 'wb') as f:
            f.write(self.calendar.to_ical())
    
    def create_event(self, title, start, end=None, description='', location='', all_day=False):
        """
        创建日历事件
        
        Args:
            title: 事件标题
            start: 开始时间 (ISO 8601 格式字符串或 datetime)
            end: 结束时间 (ISO 8601 格式字符串或 datetime)，可选
            description: 事件描述
            location: 事件地点
            all_day: 是否全天事件
        
        Returns:
            dict: 创建的事件信息
        """
        event = Event()
        
        # 解析时间
        if isinstance(start, str):
            start = datetime.fromisoformat(start.replace('Z', '+00:00'))
        
        if end is None:
            end = start + timedelta(hours=1)
        elif isinstance(end, str):
            end = datetime.fromisoformat(end.replace('Z', '+00:00'))
        
        # 添加事件属性
        event.add('summary', vText(title))
        event.add('dtstart', start)
        event.add('dtend', end)
        event.add('dtstamp', datetime.now(pytz.UTC))
        event.add('uid', f'{datetime.now().timestamp()}@workstation')
        
        if description:
            event.add('description', vText(description))
        
        if location:
            event.add('location', vText(location))
        
        # 添加到日历
        self.calendar.add_component(event)
        self._save_calendar()
        
        return {
            'uid': str(event.get('uid')),
            'title': title,
            'start': start.isoformat(),
            'end': end.isoformat(),
            'description': description,
            'location': location,
            'all_day': all_day
        }
    
    def list_events(self, start_date=None, end_date=None):
        """
        列出事件
        
        Args:
            start_date: 开始日期过滤
            end_date: 结束日期过滤
        
        Returns:
            list: 事件列表
        """
        events = []
        
        for component in self.calendar.walk():
            if component.name == 'VEVENT':
                event_data = {
                    'uid': str(component.get('uid', '')),
                    'title': str(component.get('summary', '')),
                    'start': component.get('dtstart').dt.isoformat() if component.get('dtstart') else '',
                    'end': component.get('dtend').dt.isoformat() if component.get('dtend') else '',
                    'description': str(component.get('description', '')),
                    'location': str(component.get('location', ''))
                }
                
                # 日期过滤
                if start_date or end_date:
                    event_start = component.get('dtstart').dt
                    if isinstance(event_start, datetime):
                        if start_date and event_start < start_date:
                            continue
                        if end_date and event_start > end_date:
                            continue
                
                events.append(event_data)
        
        return sorted(events, key=lambda x: x['start'])
    
    def delete_event(self, uid):
        """
        删除事件
        
        Args:
            uid: 事件 UID
        
        Returns:
            bool: 是否成功删除
        """
        for component in self.calendar.walk():
            if component.name == 'VEVENT' and str(component.get('uid')) == uid:
                self.calendar.subcomponents.remove(component)
                self._save_calendar()
                return True
        return False
    
    def export_ics(self, output_file=None):
        """
        导出 .ics 文件
        
        Args:
            output_file: 输出文件路径
        
        Returns:
            str: 文件路径
        """
        if output_file is None:
            output_file = self.calendar_file
        
        with open(output_file, 'wb') as f:
            f.write(self.calendar.to_ical())
        
        return str(output_file)
    
    def sync_to_gmail(self):
        """
        同步到 Gmail Calendar
        
        需要先通过 authenticate_gmail() 进行授权
        
        Returns:
            dict: 同步结果
        """
        try:
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from google.auth.transport.requests import Request
            from googleapiclient.discovery import build
        except ImportError:
            return {
                'success': False,
                'error': '缺少 Google API 依赖',
                'message': 'pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client'
            }
        
        SCOPES = ['https://www.googleapis.com/auth/calendar']
        
        creds = None
        
        # 加载已保存的凭证
        if self.token_file.exists():
            creds = Credentials.from_authorized_user_file(str(self.token_file), SCOPES)
        
        # 如果没有有效凭证，需要授权
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not self.credentials_file.exists():
                    return {
                        'success': False,
                        'error': '未找到凭证文件',
                        'message': f'请将 Gmail OAuth2 凭证保存到: {self.credentials_file}'
                    }
                
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(self.credentials_file), SCOPES)
                creds = flow.run_local_server(port=0)
            
            # 保存凭证
            with open(self.token_file, 'w') as token:
                token.write(creds.to_json())
        
        # 构建 API 客户端
        service = build('calendar', 'v3', credentials=creds)
        
        # 同步事件
        synced = 0
        errors = []
        
        for component in self.calendar.walk():
            if component.name == 'VEVENT':
                try:
                    event = {
                        'summary': str(component.get('summary', '')),
                        'description': str(component.get('description', '')),
                        'location': str(component.get('location', '')),
                        'start': {
                            'dateTime': component.get('dtstart').dt.isoformat(),
                            'timeZone': 'Asia/Shanghai',
                        },
                        'end': {
                            'dateTime': component.get('dtend').dt.isoformat(),
                            'timeZone': 'Asia/Shanghai',
                        },
                    }
                    
                    service.events().insert(calendarId='primary', body=event).execute()
                    synced += 1
                except Exception as e:
                    errors.append(str(e))
        
        return {
            'success': True,
            'synced': synced,
            'errors': errors
        }
    
    def authenticate_gmail(self, credentials_json):
        """
        保存 Gmail OAuth2 凭证
        
        Args:
            credentials_json: 从 Google Cloud Console 下载的凭证 JSON 字符串
        
        Returns:
            dict: 保存结果
        """
        try:
            credentials = json.loads(credentials_json)
            with open(self.credentials_file, 'w', encoding='utf-8') as f:
                json.dump(credentials, f, indent=2)
            
            return {
                'success': True,
                'message': '凭证已保存',
                'file': str(self.credentials_file)
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }


def main():
    """主函数 - 处理命令行参数"""
    if len(sys.argv) < 2:
        print(json.dumps({
            'error': '缺少命令',
            'usage': 'python calendar_manager.py <command> [args...]',
            'commands': {
                'create': '创建事件 <title> <start> [end] [description] [location]',
                'list': '列出事件 [start_date] [end_date]',
                'delete': '删除事件 <uid>',
                'export': '导出 .ics [output_file]',
                'sync': '同步到 Gmail Calendar',
                'auth': '保存 Gmail 凭证 <credentials_json>'
            }
        }, ensure_ascii=False, indent=2))
        sys.exit(1)
    
    command = sys.argv[1]
    manager = CalendarManager()
    
    try:
        if command == 'create':
            if len(sys.argv) < 4:
                raise ValueError('缺少参数: title, start')
            
            title = sys.argv[2]
            start = sys.argv[3]
            end = sys.argv[4] if len(sys.argv) > 4 else None
            description = sys.argv[5] if len(sys.argv) > 5 else ''
            location = sys.argv[6] if len(sys.argv) > 6 else ''
            
            result = manager.create_event(title, start, end, description, location)
            print(json.dumps({
                'success': True,
                'event': result
            }, ensure_ascii=False, indent=2))
        
        elif command == 'list':
            start_date = datetime.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else None
            end_date = datetime.fromisoformat(sys.argv[3]) if len(sys.argv) > 3 else None
            
            events = manager.list_events(start_date, end_date)
            print(json.dumps({
                'success': True,
                'count': len(events),
                'events': events
            }, ensure_ascii=False, indent=2))
        
        elif command == 'delete':
            if len(sys.argv) < 3:
                raise ValueError('缺少参数: uid')
            
            uid = sys.argv[2]
            success = manager.delete_event(uid)
            print(json.dumps({
                'success': success,
                'message': '事件已删除' if success else '事件未找到'
            }, ensure_ascii=False, indent=2))
        
        elif command == 'export':
            output_file = sys.argv[2] if len(sys.argv) > 2 else None
            file_path = manager.export_ics(output_file)
            print(json.dumps({
                'success': True,
                'file': file_path
            }, ensure_ascii=False, indent=2))
        
        elif command == 'sync':
            result = manager.sync_to_gmail()
            print(json.dumps(result, ensure_ascii=False, indent=2))
        
        elif command == 'auth':
            if len(sys.argv) < 3:
                raise ValueError('缺少参数: credentials_json')
            
            credentials_json = sys.argv[2]
            result = manager.authenticate_gmail(credentials_json)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        
        else:
            raise ValueError(f'未知命令: {command}')
    
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }, ensure_ascii=False, indent=2))
        sys.exit(1)


if __name__ == '__main__':
    main()
