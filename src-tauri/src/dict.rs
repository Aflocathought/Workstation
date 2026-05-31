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
        trimmed_record.to_string()
    } else {
        format!("<pre>{}</pre>", escape_html(trimmed_record))
    };

    format!(
        r#"
<article>
    <span class="entry-label">REAL MDX</span>
    <h1>{}</h1>
    <p><strong>{}</strong></p>
    {}
    <div class="entry-card">{}</div>
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
<article>
    <span class="entry-label">REAL MDX</span>
    <h1>{}</h1>
    <p>当前在词典 <strong>{}</strong> 中没有找到这个词条。</p>
    <p>可以尝试词形变化、大小写变体，或在设置中切换另一部词典。</p>
</article>
        "#,
        escape_html(word),
        escape_html(&dictionary_name),
    )
}

#[cfg(feature = "mdict-rs-backend")]
fn lookup_word_in_dictionary(dictionary_file: &str, word: &str) -> Result<String, String> {
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

    let trimmed_word = word.trim();

    if let Some(record) = mdx.lookup(trimmed_word).map_err(|error| {
        format!(
            "mdict-rs 在查询词典 {} 时失败: {}",
            Path::new(dictionary_file)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(dictionary_file),
            error,
        )
    })? {
        return Ok(render_dictionary_entry(
            dictionary_file,
            &record.key,
            &record.text,
            false,
        ));
    }

    let normalized_word = trimmed_word.to_lowercase();
    let mut prefix_match = None;

    for key in mdx.keys() {
        let key = key.map_err(|error| {
            format!(
                "mdict-rs 在读取词典 {} 的词头索引时失败: {}",
                Path::new(dictionary_file)
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or(dictionary_file),
                error,
            )
        })?;

        if key.to_lowercase().starts_with(&normalized_word) {
            prefix_match = Some(key);
            break;
        }
    }

    if let Some(headword) = prefix_match {
        if let Some(record) = mdx.lookup(&headword).map_err(|error| {
            format!(
                "mdict-rs 在读取词典 {} 的前缀匹配词条时失败: {}",
                Path::new(dictionary_file)
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or(dictionary_file),
                error,
            )
        })? {
            return Ok(render_dictionary_entry(
                dictionary_file,
                &record.key,
                &record.text,
                true,
            ));
        }
    }

    Ok(render_dictionary_not_found(dictionary_file, word))
}

#[cfg(not(feature = "mdict-rs-backend"))]
fn lookup_word_in_dictionary(dictionary_file: &str, word: &str) -> Result<String, String> {
    let mdx = readmdict::Mdx::new(dictionary_file, None, true, None).map_err(|error| {
        format!(
            "Rust 原型暂时无法打开所选词典 {}: {}",
            Path::new(dictionary_file)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(dictionary_file),
            error,
        )
    })?;

    let normalized_word = word.trim().to_lowercase();
    let items = mdx.items().map_err(|error| {
        format!(
            "Rust 原型在解码词典 {} 的词条内容时失败: {}",
            Path::new(dictionary_file)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(dictionary_file),
            error,
        )
    })?;
    let mut prefix_match: Option<(String, String)> = None;

    for (key, record) in items {
        let key_text = String::from_utf8_lossy(&key).trim().to_string();
        let record_text = String::from_utf8_lossy(&record).trim().to_string();
        let normalized_key = key_text.to_lowercase();

        if normalized_key == normalized_word {
            return Ok(render_dictionary_entry(
                dictionary_file,
                &key_text,
                &record_text,
                false,
            ));
        }

        if prefix_match.is_none() && normalized_key.starts_with(&normalized_word) {
            prefix_match = Some((key_text, record_text));
        }
    }

    if let Some((headword, record_text)) = prefix_match {
        return Ok(render_dictionary_entry(
            dictionary_file,
            &headword,
            &record_text,
            true,
        ));
    }

    Ok(render_dictionary_not_found(dictionary_file, word))
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
pub(crate) fn lookup_word(word: String, dictionary_file: Option<String>) -> Result<String, String> {
    let trimmed = word.trim();

    if trimmed.is_empty() {
        return Err("请输入要查询的单词".to_string());
    }

    if let Some(selected_dictionary) = dictionary_file
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return lookup_word_in_dictionary(selected_dictionary, trimmed);
    }

    let html = match trimmed.to_lowercase().as_str() {
        "abandon" => r#"
<article>
    <span class="entry-label">ENGLISH</span>
    <h1>abandon</h1>
    <p><strong>/əˈbændən/</strong> 动词，表示“放弃、遗弃、沉浸于”。</p>
    <div class="entry-grid">
        <section class="entry-card">
            <h2>核心释义</h2>
            <ul>
                <li>to leave someone or something behind forever</li>
                <li>to stop doing or supporting something</li>
                <li>to give yourself over to a strong emotion or habit</li>
            </ul>
        </section>
        <section class="entry-card">
            <h2>常见搭配</h2>
            <ul>
                <li>abandon a plan / project</li>
                <li>abandon hope</li>
                <li>abandon oneself to grief</li>
            </ul>
        </section>
    </div>
    <h2>例句</h2>
    <p>They had to <em>abandon</em> the original design after the first prototype failed.</p>
    <p>He finally abandoned the idea of moving abroad.</p>
    <blockquote>学习提示：先区分“主动放弃”与“被迫遗弃”这两层语义，再记常见宾语。</blockquote>
</article>
                "#
        .to_string(),
        "einstellung" => r#"
<article>
    <span class="entry-label">DEUTSCH</span>
    <h1>Einstellung</h1>
    <p><strong>[ˈaɪ̯nʃtɛlʊŋ]</strong> 名词，常见含义有“设置、态度、录用”。</p>
    <div class="entry-grid">
        <section class="entry-card">
            <h2>常见义项</h2>
            <ul>
                <li>die Einstellung einer Maschine: 设备设置</li>
                <li>eine positive Einstellung: 积极态度</li>
                <li>die Einstellung eines Mitarbeiters: 录用员工</li>
            </ul>
        </section>
        <section class="entry-card">
            <h2>语法提醒</h2>
            <ul>
                <li>阴性名词：die Einstellung</li>
                <li>复数：die Einstellungen</li>
                <li>常与 <em>zu</em> 或第二格搭配表示“对……的态度”</li>
            </ul>
        </section>
    </div>
    <h2>例句</h2>
    <p>Seine Einstellung zur Sprache hat sich im letzten Jahr stark verändert.</p>
    <p>Bitte überprüfen Sie die Einstellungen vor dem Export.</p>
    <blockquote>学习提示：遇到德语名词时，连冠词和复数形式一起记，效率更高。</blockquote>
</article>
                "#
        .to_string(),
        _ => format!(
            r#"
<article>
    <span class="entry-label">NOT FOUND</span>
    <h1>{}</h1>
    <p>当前演示词典未收录该词条。</p>
    <p>你可以先试试 <strong>abandon</strong> 或 <strong>Einstellung</strong>，后续再接入真实 MDX 数据源。</p>
</article>
                        "#,
            escape_html(trimmed)
        ),
    };

    Ok(html)
}
