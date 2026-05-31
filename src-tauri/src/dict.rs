#[cfg(feature = "mdict-rs-backend")]
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DictionarySource {
    file_path: String,
    file_name: String,
    display_name: String,
    has_mdd: bool,
    mdd_path: Option<String>,
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn get_dictionary_display_name(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("未知词典")
        .to_string()
}

fn collect_dictionary_files(directory: &Path, collected: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("无法读取词典目录 {}: {}", directory.display(), error))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("无法读取词典目录项: {error}"))?;
        let path = entry.path();

        if path.is_dir() {
            collect_dictionary_files(&path, collected)?;
            continue;
        }

        let is_mdx = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("mdx"))
            .unwrap_or(false);

        if is_mdx {
            collected.push(path);
        }
    }

    Ok(())
}

fn find_matching_mdd(path: &Path) -> Option<PathBuf> {
    let exact_lower = path.with_extension("mdd");
    if exact_lower.exists() {
        return Some(exact_lower);
    }

    let exact_upper = path.with_extension("MDD");
    if exact_upper.exists() {
        return Some(exact_upper);
    }

    let parent = path.parent()?;
    let stem = path.file_stem()?.to_str()?.to_lowercase();
    let dotted_stem = format!("{stem}.");
    let entries = fs::read_dir(parent).ok()?;

    for entry in entries.flatten() {
        let candidate = entry.path();
        let is_mdd = candidate
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("mdd"))
            .unwrap_or(false);

        if !is_mdd {
            continue;
        }

        let candidate_stem = candidate
            .file_stem()
            .and_then(|value| value.to_str())
            .map(|value| value.to_lowercase())?;

        if candidate_stem == stem || candidate_stem.starts_with(&dotted_stem) {
            return Some(candidate);
        }
    }

    None
}

fn render_dictionary_entry(
    dictionary_file: &str,
    headword: &str,
    raw_record: &str,
    is_prefix_match: bool,
) -> String {
    let dictionary_name = get_dictionary_display_name(Path::new(dictionary_file));
    let match_hint = if is_prefix_match {
        r#"<p>未找到完全匹配词条，已返回最接近的前缀匹配结果。</p>"#
    } else {
        ""
    };
    let trimmed_record = raw_record.trim();
    let body = if trimmed_record.starts_with('<') {
        render_dictionary_record_body(dictionary_file, trimmed_record)
    } else {
        format!("<pre>{}</pre>", escape_html(trimmed_record))
    };

    format!(
        r#"
<article class="dictionary-entry">
    <header class="dictionary-entry-header">
        <span class="entry-label">本地 MDX</span>
        <h1 class="dictionary-entry-title">{}</h1>
        <div class="dictionary-source-heading">
            <span>来自：{}</span>
            <hr />
        </div>
    </header>
    {}
    <div class="dictionary-entry-body">{}</div>
</article>
        "#,
        escape_html(headword),
        escape_html(&dictionary_name),
        match_hint,
        body,
    )
}

fn render_dictionary_not_found(dictionary_file: &str, word: &str) -> String {
    let dictionary_name = get_dictionary_display_name(Path::new(dictionary_file));

    format!(
        r#"
<article class="dictionary-entry dictionary-entry-empty">
    <header class="dictionary-entry-header">
        <span class="entry-label">本地 MDX</span>
        <h1 class="dictionary-entry-title">{}</h1>
        <div class="dictionary-source-heading">
            <span>来自：{}</span>
            <hr />
        </div>
    </header>
    <div class="dictionary-entry-body">
        <p>当前词典没有找到这个词条。</p>
        <p>可以尝试词形变化、大小写变体，或在设置中心切换另一部词典。</p>
    </div>
</article>
        "#,
        escape_html(word),
        escape_html(&dictionary_name),
    )
}

fn render_dictionary_collection_not_found(dictionary_count: usize, word: &str) -> String {
    format!(
        r#"
<article class="dictionary-entry dictionary-entry-empty">
    <header class="dictionary-entry-header">
        <span class="entry-label">本地 MDX</span>
        <h1 class="dictionary-entry-title">{}</h1>
        <div class="dictionary-source-heading">
            <span>来自：全部启用词典</span>
            <hr />
        </div>
    </header>
    <div class="dictionary-entry-body">
        <p>已在启用的 <strong>{}</strong> 本词典中查找，但没有找到这个词条。</p>
        <p>可以尝试词形变化、大小写变体，或在左侧栏选中单本词典缩小范围。</p>
    </div>
</article>
        "#,
        escape_html(word),
        dictionary_count,
    )
}

fn render_dictionary_not_configured(word: &str) -> String {
    format!(
        r#"
<article class="dictionary-entry dictionary-entry-empty">
    <header class="dictionary-entry-header">
        <span class="entry-label">本地词典</span>
        <h1 class="dictionary-entry-title">{}</h1>
        <div class="dictionary-source-heading">
            <span>来自：未配置</span>
            <hr />
        </div>
    </header>
    <div class="dictionary-entry-body">
        <p>还没有可用的本地 MDX 词典。</p>
        <p>请先在设置中心选择词典目录，扫描后可以在左侧栏选择单本词典，或使用全部启用词典查找。</p>
    </div>
</article>
        "#,
        escape_html(word),
    )
}

fn unique_dictionary_files(dictionary_files: Option<Vec<String>>) -> Vec<String> {
    let mut unique_files: Vec<String> = Vec::new();

    for file in dictionary_files.unwrap_or_default() {
        let trimmed = file.trim();

        if trimmed.is_empty() || unique_files.iter().any(|value| value.as_str() == trimmed) {
            continue;
        }

        unique_files.push(trimmed.to_string());
    }

    unique_files
}

fn lookup_key_candidates(word: &str) -> Vec<String> {
    let trimmed = word.trim();
    let mut candidates = Vec::new();

    push_unique(&mut candidates, trimmed.to_string());
    push_unique(&mut candidates, trimmed.to_lowercase());
    push_unique(&mut candidates, trimmed.to_uppercase());

    let lowercase = trimmed.to_lowercase();
    let mut chars = lowercase.chars();

    if let Some(first_char) = chars.next() {
        let title_case = first_char.to_uppercase().collect::<String>() + chars.as_str();
        push_unique(&mut candidates, title_case);
    }

    candidates
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if value.is_empty() || values.iter().any(|existing| existing == &value) {
        return;
    }

    values.push(value);
}

#[cfg(feature = "mdict-rs-backend")]
struct DictionaryResourceResolver {
    mdd: Option<mdict_rs::MddFile>,
    dictionary_directory: Option<PathBuf>,
}

#[cfg(feature = "mdict-rs-backend")]
impl DictionaryResourceResolver {
    fn new(dictionary_file: &str) -> Self {
        let dictionary_path = Path::new(dictionary_file);
        let mdd =
            find_matching_mdd(dictionary_path).and_then(|path| mdict_rs::MddFile::open(path).ok());

        Self {
            mdd,
            dictionary_directory: dictionary_path.parent().map(Path::to_path_buf),
        }
    }

    fn resolve_data_uri(&self, raw_reference: &str) -> Option<String> {
        let resource_reference = clean_resource_reference(raw_reference)?;
        let mut data = self.load_resource(&resource_reference)?;
        let mime_type = mime_type_for_resource(&resource_reference);

        if mime_type == "text/css" {
            let css = String::from_utf8_lossy(&data);
            data = rewrite_css_resource_urls(&css, self).into_bytes();
        }

        Some(format!(
            "data:{};base64,{}",
            mime_type,
            BASE64_STANDARD.encode(data)
        ))
    }

    fn load_resource(&self, resource_reference: &str) -> Option<Vec<u8>> {
        if let Some(mdd) = &self.mdd {
            for candidate in resource_key_candidates(resource_reference) {
                match mdd.lookup(&candidate) {
                    Ok(Some(resource)) => return Some(resource.data),
                    Ok(None) | Err(_) => {}
                }
            }
        }

        self.load_disk_resource(resource_reference)
    }

    fn load_disk_resource(&self, resource_reference: &str) -> Option<Vec<u8>> {
        let directory = self.dictionary_directory.as_ref()?;
        let relative_path = resource_reference
            .trim_start_matches(['/', '\\'])
            .replace('\\', "/");

        let path = Path::new(&relative_path);

        if path.is_absolute()
            || path
                .components()
                .any(|component| matches!(component, std::path::Component::ParentDir))
        {
            return None;
        }

        fs::read(directory.join(path)).ok()
    }
}

#[cfg(feature = "mdict-rs-backend")]
fn render_dictionary_record_body(dictionary_file: &str, raw_record: &str) -> String {
    let resolver = DictionaryResourceResolver::new(dictionary_file);
    rewrite_html_resources(raw_record, &resolver)
}

#[cfg(not(feature = "mdict-rs-backend"))]
fn render_dictionary_record_body(_dictionary_file: &str, raw_record: &str) -> String {
    raw_record.to_string()
}

#[cfg(feature = "mdict-rs-backend")]
fn rewrite_html_resources(html: &str, resolver: &DictionaryResourceResolver) -> String {
    let html = ["src", "href", "data", "poster"]
        .into_iter()
        .fold(html.to_string(), |current_html, attr| {
            rewrite_html_attribute(&current_html, attr, resolver)
        });

    rewrite_css_resource_urls(&html, resolver)
}

#[cfg(feature = "mdict-rs-backend")]
fn rewrite_html_attribute(
    html: &str,
    attr_name: &str,
    resolver: &DictionaryResourceResolver,
) -> String {
    let mut output = String::with_capacity(html.len());
    let mut cursor = 0;

    while let Some(relative_attr_start) = find_ascii_case_insensitive(&html[cursor..], attr_name) {
        let attr_start = cursor + relative_attr_start;
        let attr_end = attr_start + attr_name.len();

        if !is_html_attribute_name_boundary(html, attr_start, attr_end) {
            output.push_str(&html[cursor..attr_end]);
            cursor = attr_end;
            continue;
        }

        let mut value_prefix_end = skip_ascii_whitespace(html, attr_end);

        if html.as_bytes().get(value_prefix_end) != Some(&b'=') {
            output.push_str(&html[cursor..attr_end]);
            cursor = attr_end;
            continue;
        }

        value_prefix_end += 1;
        value_prefix_end = skip_ascii_whitespace(html, value_prefix_end);

        let Some((&first_value_byte, _)) = html.as_bytes()[value_prefix_end..].split_first() else {
            output.push_str(&html[cursor..]);
            return output;
        };

        let (value_start, value_end) = if first_value_byte == b'\'' || first_value_byte == b'"' {
            let value_start = value_prefix_end + 1;
            let Some(relative_value_end) = html.as_bytes()[value_start..]
                .iter()
                .position(|byte| *byte == first_value_byte)
            else {
                output.push_str(&html[cursor..]);
                return output;
            };

            (value_start, value_start + relative_value_end)
        } else {
            let value_start = value_prefix_end;
            let relative_value_end = html.as_bytes()[value_start..]
                .iter()
                .position(|byte| byte.is_ascii_whitespace() || *byte == b'>')
                .unwrap_or(html.len() - value_start);

            (value_start, value_start + relative_value_end)
        };

        let original_value = &html[value_start..value_end];

        output.push_str(&html[cursor..value_start]);

        if let Some(data_uri) = resolver.resolve_data_uri(original_value) {
            output.push_str(&data_uri);
        } else {
            output.push_str(original_value);
        }

        cursor = value_end;
    }

    output.push_str(&html[cursor..]);
    output
}

#[cfg(feature = "mdict-rs-backend")]
fn rewrite_css_resource_urls(css: &str, resolver: &DictionaryResourceResolver) -> String {
    let mut output = String::with_capacity(css.len());
    let mut cursor = 0;

    while let Some(relative_url_start) = find_ascii_case_insensitive(&css[cursor..], "url(") {
        let url_start = cursor + relative_url_start;
        let value_start = url_start + 4;
        let Some(relative_value_end) = css.as_bytes()[value_start..]
            .iter()
            .position(|byte| *byte == b')')
        else {
            break;
        };
        let value_end = value_start + relative_value_end;
        let original_value = css[value_start..value_end].trim();
        let unquoted_value = strip_matching_quotes(original_value);

        output.push_str(&css[cursor..url_start]);

        if let Some(data_uri) = resolver.resolve_data_uri(unquoted_value) {
            output.push_str("url(\"");
            output.push_str(&data_uri);
            output.push_str("\")");
        } else {
            output.push_str(&css[url_start..=value_end]);
        }

        cursor = value_end + 1;
    }

    output.push_str(&css[cursor..]);
    output
}

#[cfg(feature = "mdict-rs-backend")]
fn clean_resource_reference(raw_reference: &str) -> Option<String> {
    let mut value = decode_html_attribute_value(strip_matching_quotes(raw_reference.trim()))
        .trim()
        .to_string();

    if value.is_empty() || is_external_resource_reference(&value) {
        return None;
    }

    let lower_value = value.to_lowercase();

    if lower_value.starts_with("entry://") {
        value = value[8..].to_string();
    } else if lower_value.starts_with("sound://") {
        value = value[8..].to_string();
    } else if lower_value.starts_with("file://") {
        return None;
    } else if has_non_local_scheme(&value) {
        return None;
    }

    if let Some(fragment_start) = value.find('#') {
        value.truncate(fragment_start);
    }

    if let Some(query_start) = value.find('?') {
        value.truncate(query_start);
    }

    while value.starts_with("./") || value.starts_with(".\\") {
        value = value[2..].to_string();
    }

    value = percent_decode(&value);

    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(feature = "mdict-rs-backend")]
fn resource_key_candidates(resource_reference: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    let backslash_path = resource_reference.replace('/', "\\");
    let slash_path = resource_reference.replace('\\', "/");
    let trimmed_backslash = backslash_path.trim_start_matches('\\');
    let trimmed_slash = slash_path.trim_start_matches('/');

    push_unique(&mut candidates, resource_reference.to_string());
    push_unique(&mut candidates, backslash_path.clone());
    push_unique(&mut candidates, slash_path.clone());
    push_unique(&mut candidates, trimmed_backslash.to_string());
    push_unique(&mut candidates, trimmed_slash.to_string());
    push_unique(&mut candidates, format!("\\{trimmed_backslash}"));
    push_unique(&mut candidates, format!("/{trimmed_slash}"));

    if let Some(file_name) = trimmed_slash
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
    {
        push_unique(&mut candidates, file_name.to_string());
        push_unique(&mut candidates, format!("\\{file_name}"));
        push_unique(&mut candidates, format!("\\sound\\{file_name}"));
        push_unique(&mut candidates, format!("\\audio\\{file_name}"));
    }

    candidates
}

#[cfg(feature = "mdict-rs-backend")]
fn decode_html_attribute_value(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

#[cfg(feature = "mdict-rs-backend")]
fn strip_matching_quotes(value: &str) -> &str {
    let bytes = value.as_bytes();

    if bytes.len() >= 2
        && ((bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\'')
            || (bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"'))
    {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

#[cfg(feature = "mdict-rs-backend")]
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%'
            && index + 2 < bytes.len()
            && bytes[index + 1].is_ascii_hexdigit()
            && bytes[index + 2].is_ascii_hexdigit()
        {
            let high = (bytes[index + 1] as char).to_digit(16).unwrap_or(0);
            let low = (bytes[index + 2] as char).to_digit(16).unwrap_or(0);
            decoded.push((high * 16 + low) as u8);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).unwrap_or_else(|_| value.to_string())
}

#[cfg(feature = "mdict-rs-backend")]
fn is_external_resource_reference(value: &str) -> bool {
    let lower_value = value.to_lowercase();

    lower_value.starts_with('#')
        || lower_value.starts_with("http://")
        || lower_value.starts_with("https://")
        || lower_value.starts_with("data:")
        || lower_value.starts_with("blob:")
        || lower_value.starts_with("mailto:")
        || lower_value.starts_with("javascript:")
        || lower_value.starts_with("about:")
}

#[cfg(feature = "mdict-rs-backend")]
fn has_non_local_scheme(value: &str) -> bool {
    let Some(colon_index) = value.find(':') else {
        return false;
    };

    let separator_index = value.find('/').into_iter().chain(value.find('\\')).min();

    if separator_index.is_some_and(|index| index < colon_index) {
        return false;
    }

    !(colon_index == 1 && value.as_bytes()[0].is_ascii_alphabetic())
}

#[cfg(feature = "mdict-rs-backend")]
fn mime_type_for_resource(resource_reference: &str) -> &'static str {
    let file_name = resource_reference
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(resource_reference);
    let extension = file_name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_lowercase())
        .unwrap_or_default();

    match extension.as_str() {
        "css" => "text/css",
        "js" => "text/javascript",
        "html" | "htm" => "text/html",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

#[cfg(feature = "mdict-rs-backend")]
fn find_ascii_case_insensitive(haystack: &str, needle: &str) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }

    haystack
        .as_bytes()
        .windows(needle.len())
        .position(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
}

#[cfg(feature = "mdict-rs-backend")]
fn is_html_attribute_name_boundary(html: &str, start: usize, end: usize) -> bool {
    let bytes = html.as_bytes();
    let before_is_name = start
        .checked_sub(1)
        .and_then(|index| bytes.get(index))
        .is_some_and(|byte| is_html_name_byte(*byte));
    let after_is_name = bytes.get(end).is_some_and(|byte| is_html_name_byte(*byte));

    !before_is_name && !after_is_name
}

#[cfg(feature = "mdict-rs-backend")]
fn is_html_name_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b':')
}

#[cfg(feature = "mdict-rs-backend")]
fn skip_ascii_whitespace(value: &str, mut index: usize) -> usize {
    while value
        .as_bytes()
        .get(index)
        .is_some_and(|byte| byte.is_ascii_whitespace())
    {
        index += 1;
    }

    index
}

#[cfg(feature = "mdict-rs-backend")]
fn lookup_word_in_dictionary(dictionary_file: &str, word: &str) -> Result<Option<String>, String> {
    let mdx = mdict_rs::MdxFile::open(dictionary_file).map_err(|error| {
        format!(
            "mdict-rs 暂时无法打开所选词典 {}: {}",
            Path::new(dictionary_file)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(dictionary_file),
            error,
        )
    })?;

    for candidate in lookup_key_candidates(word) {
        if let Some(record) = mdx.lookup(&candidate).map_err(|error| {
            format!(
                "mdict-rs 在查询词典 {} 时失败: {}",
                Path::new(dictionary_file)
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or(dictionary_file),
                error,
            )
        })? {
            return Ok(Some(render_dictionary_entry(
                dictionary_file,
                &record.key,
                &record.text,
                false,
            )));
        }
    }

    Ok(None)
}

#[cfg(not(feature = "mdict-rs-backend"))]
fn lookup_word_in_dictionary(
    _dictionary_file: &str,
    _word: &str,
) -> Result<Option<String>, String> {
    Err(
        "当前构建未启用 mdict-rs-backend；已禁用 readmdict 慢速回退以避免加密词典暴力解析。"
            .to_string(),
    )
}

#[tauri::command]
pub(crate) fn scan_dictionary_directory(
    directory: String,
) -> Result<Vec<DictionarySource>, String> {
    let trimmed = directory.trim();

    if trimmed.is_empty() {
        return Err("请先选择词典目录".to_string());
    }

    let root = Path::new(trimmed);

    if !root.exists() {
        return Err(format!("词典目录不存在: {}", root.display()));
    }

    if !root.is_dir() {
        return Err(format!("所选路径不是文件夹: {}", root.display()));
    }

    let mut dictionary_files = Vec::new();
    collect_dictionary_files(root, &mut dictionary_files)?;
    dictionary_files.sort_by(|left, right| {
        left.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_lowercase()
            .cmp(
                &right
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
                    .to_lowercase(),
            )
    });

    Ok(dictionary_files
        .into_iter()
        .map(|path| {
            let mdd_path = find_matching_mdd(&path);

            DictionarySource {
                file_path: path.display().to_string(),
                file_name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
                    .to_string(),
                display_name: get_dictionary_display_name(&path),
                has_mdd: mdd_path.is_some(),
                mdd_path: mdd_path.map(|value| value.display().to_string()),
            }
        })
        .collect())
}

#[tauri::command]
pub(crate) async fn lookup_word(
    word: String,
    dictionary_file: Option<String>,
    dictionary_files: Option<Vec<String>>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        lookup_word_sync(word, dictionary_file, dictionary_files)
    })
    .await
    .map_err(|error| format!("词典查询任务失败: {error}"))?
}

fn lookup_word_sync(
    word: String,
    dictionary_file: Option<String>,
    dictionary_files: Option<Vec<String>>,
) -> Result<String, String> {
    let trimmed = word.trim();

    if trimmed.is_empty() {
        return Err("请输入要查询的单词".to_string());
    }

    if let Some(selected_dictionary) = dictionary_file
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return lookup_word_in_dictionary(selected_dictionary, trimmed).map(|entry| {
            entry.unwrap_or_else(|| render_dictionary_not_found(selected_dictionary, trimmed))
        });
    }

    let imported_dictionaries = unique_dictionary_files(dictionary_files);

    if imported_dictionaries.is_empty() {
        return Ok(render_dictionary_not_configured(trimmed));
    }

    let mut lookup_errors = Vec::new();

    for dictionary in &imported_dictionaries {
        match lookup_word_in_dictionary(dictionary, trimmed) {
            Ok(Some(entry)) => return Ok(entry),
            Ok(None) => {}
            Err(error) => lookup_errors.push(error),
        }
    }

    if lookup_errors.len() == imported_dictionaries.len() {
        return Err(lookup_errors.join("\n"));
    }

    Ok(render_dictionary_collection_not_found(
        imported_dictionaries.len(),
        trimmed,
    ))
}
