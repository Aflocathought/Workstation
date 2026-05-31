use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::{env, path::PathBuf, sync::OnceLock, time::Duration};

const DEFAULT_DEEPSEEK_ENDPOINT: &str = "https://api.deepseek.com/chat/completions";
const DEFAULT_DEEPSEEK_MODEL: &str = "deepseek-v4-pro";
const DEFAULT_SYSTEM_PROMPT: &str =
    "你是一名桌面词典中的外语学习助教。请优先解释语义、典型搭配、语法作用，并给出自然例句。";

static ENV_LOADED: OnceLock<()> = OnceLock::new();

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

#[tauri::command]
pub(crate) async fn deepseek_chat(
    messages: Vec<DeepSeekChatMessage>,
    endpoint: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
) -> Result<String, String> {
    let api_key = resolve_api_key(api_key)?;
    let endpoint = normalize_setting(endpoint, DEFAULT_DEEPSEEK_ENDPOINT);
    let model = normalize_setting(model, DEFAULT_DEEPSEEK_MODEL);
    let messages = normalize_messages(messages)?;
    let request_body = DeepSeekApiRequest {
        model,
        messages,
        thinking: DeepSeekThinkingConfig { kind: "enabled" },
        reasoning_effort: "high",
        stream: false,
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
