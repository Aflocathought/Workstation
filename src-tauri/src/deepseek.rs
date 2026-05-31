use futures_util::StreamExt;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    env,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

const DEFAULT_DEEPSEEK_ENDPOINT: &str = "https://api.deepseek.com/chat/completions";
const DEFAULT_DEEPSEEK_MODEL: &str = "deepseek-v4-pro";
const DEFAULT_DEEPSEEK_USER_ID: &str = "workstation-dict";
const DEEPSEEK_STREAM_EVENT: &str = "deepseek-chat-stream";
const DEFAULT_SYSTEM_PROMPT: &str =
    "你是一名桌面词典中的外语学习助教。用户可能抛出一段句子或者词语，请优先解释语义、典型搭配、语法作用，并给出自然例句。";

static ENV_LOADED: OnceLock<()> = OnceLock::new();
static ACTIVE_STREAMS: OnceLock<Mutex<HashMap<String, Arc<DeepSeekStreamControl>>>> =
    OnceLock::new();

struct DeepSeekStreamControl {
    cancelled: AtomicBool,
    notify: Notify,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeepSeekChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct DeepSeekApiMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct DeepSeekThinkingConfig {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Debug, Serialize)]
struct DeepSeekApiRequest {
    model: String,
    messages: Vec<DeepSeekApiMessage>,
    thinking: DeepSeekThinkingConfig,
    reasoning_effort: &'static str,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeepSeekApiResponse {
    choices: Option<Vec<DeepSeekChoice>>,
    error: Option<DeepSeekError>,
}

#[derive(Debug, Deserialize)]
struct DeepSeekChoice {
    message: Option<DeepSeekChoiceMessage>,
}

#[derive(Debug, Deserialize)]
struct DeepSeekChoiceMessage {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeepSeekError {
    message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeepSeekStreamPayload {
    request_id: String,
    event: &'static str,
    content: Option<String>,
    error: Option<String>,
    elapsed_ms: u64,
}

#[tauri::command]
pub(crate) async fn deepseek_chat(
    messages: Vec<DeepSeekChatMessage>,
    endpoint: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
    user_id: Option<String>,
) -> Result<String, String> {
    let api_key = resolve_api_key(api_key)?;
    let endpoint = normalize_setting(endpoint, DEFAULT_DEEPSEEK_ENDPOINT);
    let model = normalize_setting(model, DEFAULT_DEEPSEEK_MODEL);
    let user_id = normalize_user_id(user_id)?;
    let messages = normalize_messages(messages)?;
    let request_body = DeepSeekApiRequest {
        model,
        messages,
        thinking: DeepSeekThinkingConfig { kind: "enabled" },
        reasoning_effort: "high",
        stream: false,
        user_id,
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("DeepSeek HTTP 客户端初始化失败: {error}"))?;

    let response = client
        .post(endpoint)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .bearer_auth(api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|error| format!("DeepSeek 请求失败: {error}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("DeepSeek 响应读取失败: {error}"))?;

    parse_deepseek_response(status, &body)
}

#[tauri::command]
pub(crate) async fn deepseek_chat_stream(
    app_handle: AppHandle,
    request_id: String,
    messages: Vec<DeepSeekChatMessage>,
    endpoint: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
    user_id: Option<String>,
) -> Result<(), String> {
    let request_id = normalize_request_id(request_id)?;
    let api_key = resolve_api_key(api_key)?;
    let endpoint = normalize_setting(endpoint, DEFAULT_DEEPSEEK_ENDPOINT);
    let model = normalize_setting(model, DEFAULT_DEEPSEEK_MODEL);
    let user_id = normalize_user_id(user_id)?;
    let messages = normalize_messages(messages)?;
    let request_body = DeepSeekApiRequest {
        model,
        messages,
        thinking: DeepSeekThinkingConfig { kind: "enabled" },
        reasoning_effort: "high",
        stream: true,
        user_id,
    };
    let started_at = Instant::now();
    let control = register_stream_control(&request_id)?;

    emit_stream_event(&app_handle, &request_id, "started", None, None, started_at);

    let result = stream_deepseek_response(
        &app_handle,
        &request_id,
        &endpoint,
        &api_key,
        request_body,
        control,
        started_at,
    )
    .await;

    unregister_stream_control(&request_id);

    if let Err(error) = &result {
        emit_stream_event(
            &app_handle,
            &request_id,
            "error",
            None,
            Some(error.clone()),
            started_at,
        );
    }

    result
}

#[tauri::command]
pub(crate) fn deepseek_cancel_chat(request_id: String) -> Result<(), String> {
    let request_id = normalize_request_id(request_id)?;
    let streams = active_streams()
        .lock()
        .map_err(|error| format!("DeepSeek 流状态锁定失败: {error}"))?;

    if let Some(control) = streams.get(&request_id) {
        control.cancelled.store(true, Ordering::SeqCst);
        control.notify.notify_waiters();
    }

    Ok(())
}

fn resolve_api_key(api_key: Option<String>) -> Result<String, String> {
    if let Some(api_key) = api_key.and_then(normalize_optional_string) {
        return Ok(api_key);
    }

    load_env_file();

    env::var("DEEPSEEK_API_KEY")
        .ok()
        .and_then(normalize_optional_string)
        .ok_or_else(|| {
            "未配置 DEEPSEEK_API_KEY，请在项目根目录 .env 中配置 DeepSeek API Key。".to_string()
        })
}

fn load_env_file() {
    ENV_LOADED.get_or_init(|| {
        for path in env_file_candidates() {
            if path.is_file() {
                let _ = dotenvy::from_path(path);
                break;
            }
        }
    });
}

fn env_file_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join(".env"));

        if let Some(parent) = current_dir.parent() {
            candidates.push(parent.join(".env"));
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest_dir.join(".env"));

    if let Some(parent) = manifest_dir.parent() {
        candidates.push(parent.join(".env"));
    }

    candidates
}

fn normalize_setting(value: Option<String>, fallback: &str) -> String {
    value
        .and_then(normalize_optional_string)
        .unwrap_or_else(|| fallback.to_string())
}

fn normalize_optional_string(value: String) -> Option<String> {
    let value = value.trim().to_string();

    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn normalize_user_id(value: Option<String>) -> Result<Option<String>, String> {
    let user_id = value
        .and_then(normalize_optional_string)
        .unwrap_or_else(|| DEFAULT_DEEPSEEK_USER_ID.to_string());

    if user_id.len() > 512
        || !user_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err(
            "DeepSeek user_id 只能包含字母、数字、连字符或下划线，且最长 512 个字符。".to_string(),
        );
    }

    Ok(Some(user_id))
}

fn normalize_request_id(request_id: String) -> Result<String, String> {
    normalize_optional_string(request_id)
        .ok_or_else(|| "DeepSeek 流式请求缺少 requestId。".to_string())
}

fn normalize_messages(
    messages: Vec<DeepSeekChatMessage>,
) -> Result<Vec<DeepSeekApiMessage>, String> {
    let mut normalized_messages = vec![DeepSeekApiMessage {
        role: "system".to_string(),
        content: DEFAULT_SYSTEM_PROMPT.to_string(),
    }];

    normalized_messages.extend(messages.into_iter().filter_map(|message| {
        let content = message.content.trim();

        if content.is_empty() {
            return None;
        }

        let role = match message.role.as_str() {
            "assistant" => "assistant",
            "system" => "system",
            _ => "user",
        };

        Some(DeepSeekApiMessage {
            role: role.to_string(),
            content: content.to_string(),
        })
    }));

    if normalized_messages.len() <= 1 {
        return Err("DeepSeek 请求缺少有效消息内容。".to_string());
    }

    Ok(normalized_messages)
}

fn parse_deepseek_response(status: StatusCode, body: &str) -> Result<String, String> {
    let payload = serde_json::from_str::<DeepSeekApiResponse>(body)
        .map_err(|error| format_deepseek_error(status, body, Some(error.to_string())))?;

    if !status.is_success() {
        return Err(format_deepseek_error(status, body, None));
    }

    if let Some(error) = payload.error.and_then(|error| error.message) {
        return Err(format!("DeepSeek 返回错误: {error}"));
    }

    payload
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| choice.message)
        .and_then(|message| message.content)
        .and_then(normalize_optional_string)
        .ok_or_else(|| "DeepSeek 返回了空内容。".to_string())
}

fn format_deepseek_error(status: StatusCode, body: &str, parse_error: Option<String>) -> String {
    if status == StatusCode::TOO_MANY_REQUESTS {
        return "DeepSeek 并发限速 (429)：当前账号或 user_id 已超过并发限制，请稍后重试。"
            .to_string();
    }

    if let Ok(payload) = serde_json::from_str::<DeepSeekApiResponse>(body) {
        if let Some(message) = payload.error.and_then(|error| error.message) {
            return format!("DeepSeek 请求失败 ({status}): {message}");
        }
    }

    match parse_error {
        Some(parse_error) => format!("DeepSeek 响应解析失败 ({status}): {parse_error}"),
        None => format!("DeepSeek 请求失败 ({status}): {body}"),
    }
}

fn active_streams() -> &'static Mutex<HashMap<String, Arc<DeepSeekStreamControl>>> {
    ACTIVE_STREAMS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_stream_control(request_id: &str) -> Result<Arc<DeepSeekStreamControl>, String> {
    let control = Arc::new(DeepSeekStreamControl {
        cancelled: AtomicBool::new(false),
        notify: Notify::new(),
    });
    let mut streams = active_streams()
        .lock()
        .map_err(|error| format!("DeepSeek 流状态锁定失败: {error}"))?;

    if let Some(previous_control) = streams.insert(request_id.to_string(), control.clone()) {
        previous_control.cancelled.store(true, Ordering::SeqCst);
        previous_control.notify.notify_waiters();
    }

    Ok(control)
}

fn unregister_stream_control(request_id: &str) {
    if let Ok(mut streams) = active_streams().lock() {
        streams.remove(request_id);
    }
}

async fn stream_deepseek_response(
    app_handle: &AppHandle,
    request_id: &str,
    endpoint: &str,
    api_key: &str,
    request_body: DeepSeekApiRequest,
    control: Arc<DeepSeekStreamControl>,
    started_at: Instant,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|error| format!("DeepSeek HTTP 客户端初始化失败: {error}"))?;
    let response = client
        .post(endpoint)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .bearer_auth(api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|error| format!("DeepSeek 请求失败: {error}"))?;
    let status = response.status();

    if !status.is_success() {
        let body = response
            .text()
            .await
            .map_err(|error| format!("DeepSeek 响应读取失败: {error}"))?;
        return Err(format_deepseek_error(status, &body, None));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    loop {
        tokio::select! {
            _ = control.notify.notified() => {
                emit_stream_event(app_handle, request_id, "cancelled", None, None, started_at);
                return Ok(());
            }
            chunk = stream.next() => {
                if control.cancelled.load(Ordering::SeqCst) {
                    emit_stream_event(app_handle, request_id, "cancelled", None, None, started_at);
                    return Ok(());
                }

                let Some(chunk) = chunk else {
                    emit_stream_event(app_handle, request_id, "done", None, None, started_at);
                    return Ok(());
                };
                let chunk = chunk.map_err(|error| format!("DeepSeek 流式响应读取失败: {error}"))?;

                buffer.push_str(&String::from_utf8_lossy(&chunk));

                if drain_sse_buffer(app_handle, request_id, &mut buffer, started_at)? {
                    return Ok(());
                }
            }
        }
    }
}

fn drain_sse_buffer(
    app_handle: &AppHandle,
    request_id: &str,
    buffer: &mut String,
    started_at: Instant,
) -> Result<bool, String> {
    while let Some((event_end, delimiter_len)) = find_sse_event_boundary(buffer) {
        let raw_event = buffer[..event_end].to_string();
        buffer.drain(..event_end + delimiter_len);

        if process_sse_event(app_handle, request_id, &raw_event, started_at)? {
            return Ok(true);
        }
    }

    Ok(false)
}

fn find_sse_event_boundary(buffer: &str) -> Option<(usize, usize)> {
    match (buffer.find("\r\n\r\n"), buffer.find("\n\n")) {
        (Some(crlf), Some(lf)) if crlf < lf => Some((crlf, 4)),
        (Some(_), Some(lf)) => Some((lf, 2)),
        (Some(crlf), None) => Some((crlf, 4)),
        (None, Some(lf)) => Some((lf, 2)),
        (None, None) => None,
    }
}

fn process_sse_event(
    app_handle: &AppHandle,
    request_id: &str,
    raw_event: &str,
    started_at: Instant,
) -> Result<bool, String> {
    let mut data_lines = Vec::new();
    let mut saw_keep_alive = false;

    for raw_line in raw_event.lines() {
        let line = raw_line.trim_end_matches('\r');

        if line.starts_with(':') {
            saw_keep_alive = true;
            continue;
        }

        if let Some(data) = line.strip_prefix("data:") {
            data_lines.push(data.trim_start().to_string());
        }
    }

    if data_lines.is_empty() {
        if saw_keep_alive {
            emit_stream_event(app_handle, request_id, "keepAlive", None, None, started_at);
        }

        return Ok(false);
    }

    let data = data_lines.join("\n");

    if data.trim() == "[DONE]" {
        emit_stream_event(app_handle, request_id, "done", None, None, started_at);
        return Ok(true);
    }

    let payload = serde_json::from_str::<Value>(&data)
        .map_err(|error| format!("DeepSeek SSE 事件解析失败: {error}"))?;

    if let Some(message) = payload
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
    {
        return Err(format!("DeepSeek 返回错误: {message}"));
    }

    if let Some(choices) = payload.get("choices").and_then(Value::as_array) {
        for choice in choices {
            let delta = choice.get("delta").or_else(|| choice.get("message"));

            if let Some(delta) = delta {
                if let Some(reasoning) = extract_stream_text(
                    delta,
                    &[
                        "reasoning_content",
                        "reasoningContent",
                        "reasoning",
                        "thinking",
                    ],
                ) {
                    emit_stream_event(
                        app_handle,
                        request_id,
                        "reasoning",
                        Some(reasoning),
                        None,
                        started_at,
                    );
                }

                if let Some(content) = extract_stream_text(delta, &["content"]) {
                    emit_stream_event(
                        app_handle,
                        request_id,
                        "content",
                        Some(content),
                        None,
                        started_at,
                    );
                }
            }
        }
    }

    Ok(false)
}

fn extract_stream_text(value: &Value, field_names: &[&str]) -> Option<String> {
    field_names.iter().find_map(|field_name| {
        value
            .get(*field_name)
            .and_then(Value::as_str)
            .map(str::to_string)
            .and_then(normalize_optional_string)
    })
}

fn emit_stream_event(
    app_handle: &AppHandle,
    request_id: &str,
    event: &'static str,
    content: Option<String>,
    error: Option<String>,
    started_at: Instant,
) {
    let _ = app_handle.emit(
        DEEPSEEK_STREAM_EVENT,
        DeepSeekStreamPayload {
            request_id: request_id.to_string(),
            event,
            content,
            error,
            elapsed_ms: elapsed_ms(started_at),
        },
    );
}

fn elapsed_ms(started_at: Instant) -> u64 {
    started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64
}
