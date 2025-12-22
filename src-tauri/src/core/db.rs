use rusqlite::{Connection, Result as SqlResult};
use std::sync::Mutex;
use chrono::{DateTime, Local, NaiveDate, TimeZone, Utc, Duration as ChronoDuration};

pub struct DbState {
    pub db: Mutex<Connection>,
}

#[derive(serde::Serialize, Clone)]
pub struct ActivityLog {
    pub id: i64,
    pub app_name: String,
    pub window_title: String,
    pub start_time: String,
    pub duration_seconds: i64,
}

#[derive(serde::Serialize, Clone)]
pub struct TimelineActivity {
    pub app_name: String,
    pub start_time: String,
    pub duration_seconds: i64,
}

pub fn init_db(conn: &Connection) -> SqlResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS activity_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            app_name        TEXT NOT NULL,
            window_title    TEXT,
            start_time      TEXT NOT NULL,
            duration_seconds INTEGER NOT NULL
        )",
        [],
    )?;
    Ok(())
}

pub fn get_latest_activities(state: tauri::State<DbState>) -> Result<Vec<ActivityLog>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, app_name, window_title, start_time, duration_seconds FROM activity_log ORDER BY start_time DESC LIMIT 10")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            Ok(ActivityLog { id: row.get(0)?, app_name: row.get(1)?, window_title: row.get(2)?, start_time: row.get(3)?, duration_seconds: row.get(4)?, })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in iter { out.push(r.map_err(|e| e.to_string())?); }
    Ok(out)
}

pub fn get_activities_for_day(state: tauri::State<DbState>, date: String) -> Result<Vec<TimelineActivity>, String> {
    let conn = state.db.lock().unwrap();
    let naive = NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|e| format!("解析日期失败: {}", e))?;
    let local_start = Local
        .from_local_datetime(&naive.and_hms_opt(0, 0, 0).ok_or("无效时间")?)
        .single()
        .ok_or("无法唯一确定本地时间")?;
    let local_end = local_start + ChronoDuration::days(1);
    let start_utc: DateTime<Utc> = DateTime::<Utc>::from(local_start);
    let end_utc: DateTime<Utc> = DateTime::<Utc>::from(local_end);
    let start_s = start_utc.to_rfc3339();
    let end_s = end_utc.to_rfc3339();

    let mut stmt = conn
        .prepare("SELECT app_name, start_time, duration_seconds FROM activity_log WHERE start_time >= ?1 AND start_time < ?2 ORDER BY start_time ASC")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(rusqlite::params![start_s, end_s], |row| {
            Ok(TimelineActivity { app_name: row.get(0)?, start_time: row.get(1)?, duration_seconds: row.get(2)?, })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in iter { out.push(r.map_err(|e| e.to_string())?); }
    Ok(out)
}
