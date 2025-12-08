use std::sync::{Arc, atomic::{AtomicBool, AtomicUsize, Ordering}};
use tauri::{Emitter, Manager};
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;

pub struct SpectrumStop { pub stop: Arc<AtomicBool> }
pub struct SpectrumConfig { pub fft_size: AtomicUsize, pub columns: AtomicUsize }
pub struct SpectrumRuntime { pub running: Arc<AtomicBool> }

pub fn set_spectrum_fft_size(app: tauri::AppHandle, size: usize) -> Result<(), String> {
    let ok_pow2 = size.is_power_of_two();
    if !ok_pow2 || size < 512 || size > 8192 { return Err("fft_size must be power-of-two within 512..8192".into()); }
    let state: tauri::State<SpectrumConfig> = app.state();
    state.fft_size.store(size, Ordering::Relaxed);
    let _ = app.emit("spectrum:status", format!("fft_size set to {}", size));
    Ok(())
}

pub fn set_spectrum_columns(app: tauri::AppHandle, cols: usize) -> Result<(), String> {
    let cols = cols.clamp(32, 256);
    let state: tauri::State<SpectrumConfig> = app.state();
    state.columns.store(cols, Ordering::Relaxed);
    let _ = app.emit("spectrum:status", format!("columns set to {}", cols));
    Ok(())
}

pub fn stop_spectrum(app: tauri::AppHandle) -> Result<(), String> {
    let stop_state: tauri::State<SpectrumStop> = app.state();
    let runtime: tauri::State<SpectrumRuntime> = app.state();
    stop_state.stop.store(true, Ordering::Relaxed);
    runtime.running.store(false, Ordering::Relaxed);
    let _ = app.emit("spectrum:status", "spectrum stopped");
    Ok(())
}

pub fn start_spectrum(app: tauri::AppHandle) -> Result<(), String> {
    let stop_state: tauri::State<SpectrumStop> = app.state();
    let runtime: tauri::State<SpectrumRuntime> = app.state();
    if runtime.running.load(Ordering::Relaxed) { return Ok(()); }
    stop_state.stop.store(false, Ordering::Relaxed);
    runtime.running.store(true, Ordering::Relaxed);
    let app_handle2 = app.clone();
    let stop_flag = stop_state.stop.clone();
    std::thread::spawn(move || {
    if let Err(e) = run_wasapi_loopback(stop_flag.clone(), app_handle2.clone()) {
            eprintln!("WASAPI loopback failed: {}. Fallback to simulation.", e);
            use std::time::{Duration, Instant};
            let start = Instant::now();
            let mut t: f32 = 0.0;
            let dt = Duration::from_millis(33);
            loop {
                if stop_flag.load(Ordering::Relaxed) { break; }
                let cfg: tauri::State<SpectrumConfig> = app_handle2.state();
                let bins = cfg.columns.load(Ordering::Relaxed).clamp(32, 256);
                let mut data: Vec<f32> = Vec::with_capacity(bins);
                for i in 0..bins {
                    let x = i as f32 / bins as f32;
                    let base = (t * 2.0 + x * 10.0).sin().abs()
                        * (1.0 - x).powf(0.6)
                        + (t * 0.7 + x * 25.0).sin().abs() * 0.5
                        + (fastrand::f32() * 0.15);
                    let v = base.min(1.0).max(0.0);
                    data.push(v);
                }
                let _ = app_handle2.emit("spectrum:data", data);
                std::thread::sleep(dt);
                t = start.elapsed().as_secs_f32();
            }
        }
        let rt: tauri::State<SpectrumRuntime> = app_handle2.state();
        rt.running.store(false, Ordering::Relaxed);
    });
    Ok(())
}

fn run_wasapi_loopback(stop: Arc<AtomicBool>, app: tauri::AppHandle) -> Result<(), String> {
    unsafe {
        // 初始化 COM
        CoInitializeEx(None, COINIT_MULTITHREADED).ok().map_err(|e| format!("CoInitializeEx failed: {e:?}"))?;

        // 创建设备枚举器
        let mmdev_enum: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .map_err(|e| format!("CoCreateInstance(IMMDeviceEnumerator) failed: {e:?}"))?;

        // 默认渲染设备（输出）：优先使用 eMultimedia，失败再回退 eConsole
        let (device, role_used) = match mmdev_enum.GetDefaultAudioEndpoint(eRender, eMultimedia) {
            Ok(d) => (d, eMultimedia),
            Err(_) => match mmdev_enum.GetDefaultAudioEndpoint(eRender, eConsole) {
                Ok(d) => (d, eConsole),
                Err(_) => (
                    mmdev_enum
                        .GetDefaultAudioEndpoint(eRender, eCommunications)
                        .map_err(|e| format!("GetDefaultAudioEndpoint failed: {e:?}"))?,
                    eCommunications,
                ),
            },
        };

        // 激活 IAudioClient
        let audio_client: IAudioClient = device.Activate::<IAudioClient>(CLSCTX_ALL, None)
            .map_err(|e| format!("Activate(IAudioClient) failed: {e:?}"))?;

        // 获取混音格式
        let mix_format = audio_client.GetMixFormat().map_err(|e| format!("GetMixFormat failed: {e:?}"))?;
        let format = &*mix_format;
        // 处理常见格式：IEEE float (3)、PCM (1)、以及可扩展格式 (0xFFFE) 的 PCM/float 子类型
        const WAVE_FORMAT_PCM_TAG: u16 = 1;
        const WAVE_FORMAT_IEEE_FLOAT_TAG: u16 = 3;
        const WAVE_FORMAT_EXTENSIBLE_TAG: u16 = 0xFFFE;
        let wtag = format.wFormatTag;
        // 为 WAVEFORMATEXTENSIBLE 做子类型判断
        let mut is_float = wtag == WAVE_FORMAT_IEEE_FLOAT_TAG;
        let mut is_pcm = wtag == WAVE_FORMAT_PCM_TAG || wtag == WAVE_FORMAT_EXTENSIBLE_TAG;
        let mut valid_bits: u16 = format.wBitsPerSample; // 对 EXTENSIBLE 会被覆盖
        if wtag == WAVE_FORMAT_EXTENSIBLE_TAG {
            use windows::Win32::Media::Audio::WAVEFORMATEXTENSIBLE;
            let wfex: &WAVEFORMATEXTENSIBLE = &*(mix_format as *const _ as *const WAVEFORMATEXTENSIBLE);
            // KSDATAFORMAT_SUBTYPE_IEEE_FLOAT 与 KSDATAFORMAT_SUBTYPE_PCM 的 GUID 常量
            use windows::core::GUID;
            const SUBTYPE_IEEE_FLOAT: GUID = GUID::from_values(
                0x00000003, 0x0000, 0x0010, [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
            );
            const SUBTYPE_PCM: GUID = GUID::from_values(
                0x00000001, 0x0000, 0x0010, [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
            );
            // 从 packed 字段中安全读取值
            let sub: windows::core::GUID = std::ptr::read_unaligned(std::ptr::addr_of!(wfex.SubFormat));
            if sub == SUBTYPE_IEEE_FLOAT { is_float = true; }
            if sub == SUBTYPE_PCM { is_pcm = true; }
            // 对于可扩展格式，优先使用有效位数
            let vbps: u16 = std::ptr::read_unaligned(std::ptr::addr_of!(wfex.Samples.wValidBitsPerSample));
            if vbps != 0 { valid_bits = vbps; }
        }
        if !is_float && !is_pcm {
            return Err("Unsupported audio format (neither float nor PCM)".into());
        }
        // 采样率（Hz）
        let sample_rate = format.nSamplesPerSec as usize;
        let channels = format.nChannels as usize;
        let block_align = format.nBlockAlign as usize; // 每帧（所有声道）字节数
        let bytes_per_sample = (block_align / channels.max(1)) as usize;

        // 配置环回捕获
        let hns_buffer_duration = 10000000; // 1s
        audio_client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            hns_buffer_duration,
            0,
            format,
            None,
        ).map_err(|e| format!("IAudioClient::Initialize failed: {e:?}"))?;

        // 创建捕获客户端
        let capture: IAudioCaptureClient = audio_client.GetService::<IAudioCaptureClient>().
            map_err(|e| format!("GetService(IAudioCaptureClient) failed: {e:?}"))?;

        // 开始捕获
        audio_client.Start().map_err(|e| format!("Start failed: {e:?}"))?;
        let _ = app.emit("spectrum:status", "capture started");

        // FFT 配置（动态大小）
    use rustfft::FftPlanner;
        let cfg_state: tauri::State<SpectrumConfig> = app.state();
        let mut fft_size = cfg_state.fft_size.load(Ordering::Relaxed).max(512).min(8192);
        let mut planner = FftPlanner::<f32>::new();
        let mut fft = planner.plan_fft_forward(fft_size);
        let mut window: Vec<f32> = (0..fft_size).map(|i| {
            // Hann 窗
            0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (fft_size as f32)).cos())
        }).collect();
        // 输入/输出缓冲（采集到的跨声道交错样本）
        let mut acc: Vec<f32> = Vec::with_capacity(fft_size * channels);

        // 状态：长时间未收到数据时向前端报告
        let mut last_emit = std::time::Instant::now();
        let min_emit_interval = std::time::Duration::from_millis(30);
        let mut last_status = String::new();
        let bits_copy = format.wBitsPerSample; // 避免对 packed 字段的直接引用
        let role_name = if role_used == eMultimedia { "multimedia" } else if role_used == eConsole { "console" } else { "communications" };
        let start_msg = format!(
            "loopback started (role={}): tag={}, bits={}, validBits={}, ch={}, bytesPerSample={}",
            role_name, wtag, bits_copy, valid_bits, channels, bytes_per_sample
        );
        let _ = app.emit("spectrum:status", start_msg);

        // 主循环
        loop {
            if stop.load(Ordering::Relaxed) { break; }

            let mut packet_len: u32 = match capture.GetNextPacketSize() { Ok(n) => n, Err(_) => 0 };
            if packet_len == 0 { std::thread::sleep(std::time::Duration::from_millis(5)); continue; }

            let mut _total_samples = 0usize;
            while packet_len > 0 {
                let mut data_ptr: *mut u8 = std::ptr::null_mut();
                let mut num_frames: u32 = 0;
                let mut flags: u32 = 0;
                let mut device_pos: u64 = 0;
                let mut qpc_pos: u64 = 0;
                capture.GetBuffer(&mut data_ptr, &mut num_frames, &mut flags, Some(&mut device_pos), Some(&mut qpc_pos)).ok();

                if !data_ptr.is_null() && num_frames > 0 {
                    // 处理静音包：若 AUDCLNT_BUFFERFLAGS_SILENT 置位，填充 0
                    let silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0;
                    let frames = num_frames as usize;
                    let samples = frames * channels; // 以“样本”为单位（每声道一个样本），实际字节数需乘 bytes_per_sample
                    if silent {
                        acc.extend(std::iter::repeat(0f32).take(samples));
                        _total_samples += samples;
                    } else if is_float {
                        // 处理 32/64 位浮点
                        if bytes_per_sample == 4 {
                            let slice = std::slice::from_raw_parts(data_ptr as *const f32, samples);
                            acc.extend_from_slice(slice);
                            _total_samples += samples;
                        } else if bytes_per_sample == 8 {
                            let slice = std::slice::from_raw_parts(data_ptr as *const f64, samples);
                            acc.extend(slice.iter().map(|&v| v as f32));
                            _total_samples += samples;
                        }
                    } else if is_pcm {
                        // 处理 PCM：8/16/24/32（validBits 可为 24，封装在 32 位容器中）
                        match bytes_per_sample {
                            1 => { // 8-bit unsigned
                                let raw = std::slice::from_raw_parts(data_ptr as *const u8, samples);
                                acc.extend(raw.iter().map(|&v| (v as f32 - 128.0) / 128.0));
                                _total_samples += samples;
                            }
                            2 => { // 16-bit
                                let raw = std::slice::from_raw_parts(data_ptr as *const i16, samples);
                                acc.extend(raw.iter().map(|&v| v as f32 / 32768.0));
                                _total_samples += samples;
                            }
                            3 => { // 24-bit packed (little endian)
                                let raw = std::slice::from_raw_parts(data_ptr as *const u8, samples * 3);
                                for i in 0..samples {
                                    let b0 = raw[i*3 + 0] as u32;
                                    let b1 = raw[i*3 + 1] as u32;
                                    let b2 = raw[i*3 + 2] as u32;
                                    let v24: u32 = b0 | (b1 << 8) | (b2 << 16);
                                    // 符号扩展 24-bit -> 32-bit
                                    let v32: i32 = if (v24 & 0x0080_0000) != 0 { (v24 | 0xFF00_0000) as i32 } else { v24 as i32 };
                                    acc.push(v32 as f32 / 8_388_608.0); // 2^23
                                }
                                _total_samples += samples;
                            }
                            4 => { // 32-bit container（validBits 可能为 24 或 32）
                                let raw = std::slice::from_raw_parts(data_ptr as *const i32, samples);
                                let vb = if valid_bits == 0 { 32 } else { valid_bits } as i32;
                                let shift = (32 - vb).max(0);
                                let denom = (1i64 << (vb - 1).max(1)) as f32;
                                for &v in raw.iter() {
                                    let vv = (v >> shift) as f32 / denom;
                                    acc.push(vv);
                                }
                                _total_samples += samples;
                            }
                            _ => {
                                // 未知位宽，跳过本次包
                            }
                        }
                    }
                }
                capture.ReleaseBuffer(num_frames).ok();
                packet_len = capture.GetNextPacketSize().unwrap_or(0);
            }

            // 当累积到至少 fft_size 帧（按每通道）时做一次 FFT
            // 动态读取配置（允许运行时调整）
            let want_fft = cfg_state.fft_size.load(Ordering::Relaxed).max(512).min(8192);
            if want_fft != fft_size && want_fft.is_power_of_two() {
                fft_size = want_fft;
                planner = FftPlanner::<f32>::new();
                fft = planner.plan_fft_forward(fft_size);
                window = (0..fft_size).map(|i| 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (fft_size as f32)).cos())).collect();
                acc.clear(); // 重新积累避免跨尺寸拼接
            }
            let cols = cfg_state.columns.load(Ordering::Relaxed).clamp(32, 256);

            let per_ch_needed = fft_size;
            // 使用重叠窗口：hop = N/4（75% 重叠），在保证细粒度更新的同时提升频率分辨率
            let hop = (per_ch_needed / 4).max(1);
            if acc.len() >= per_ch_needed * channels {
                // 取“最新”的 N 帧做 FFT，避免等待整段都消费后再积累，提高响应
                let start_idx = acc.len() - per_ch_needed * channels;
                // 多声道混合为单声道
                let mut mono: Vec<f32> = vec![0.0; per_ch_needed];
                for i in 0..per_ch_needed {
                    let mut s = 0.0f32;
                    let base = start_idx + i * channels;
                    for ch in 0..channels { s += acc[base + ch]; }
                    mono[i] = s / channels as f32;
                }
                // 仅移除 hop 大小的数据，形成重叠
                let drain_len = (hop * channels).min(acc.len());
                acc.drain(0..drain_len);

                // 窗函数
                for i in 0..per_ch_needed { mono[i] *= window[i]; }

                // 复数输入
                let mut buf: Vec<rustfft::num_complex::Complex<f32>> = mono.into_iter().map(|x| rustfft::num_complex::Complex{ re:x, im:0.0 }).collect();
                fft.process(&mut buf);

                // 取前半谱幅值
                let half = fft_size/2;
                let mags: Vec<f32> = buf[..half].iter().map(|c| (c.re*c.re + c.im*c.im).sqrt()).collect();

                // 重采样到固定列（对数频率刻度，取区间最大），并裁剪 <20Hz
                let mut cols_out = vec![0.0f32; cols];
                // 计算 20Hz 对应的最小频率 bin，确保裁剪掉 20Hz 以下频率
                // bin 频率: k * sample_rate / fft_size => k >= ceil(20 * fft_size / sample_rate)
                let mut min_bin = ((20.0_f32 * fft_size as f32) / (sample_rate as f32)).ceil() as usize;
                if min_bin < 1 { min_bin = 1; }
                let max_bin = (half - 1).max(min_bin + 1);
                let ln_min = (min_bin as f32).ln();
                let ln_max = (max_bin as f32).ln();
                let span = (ln_max - ln_min).max(1e-6);
                for i in 0..cols {
                    let p0 = i as f32 / cols as f32;
                    let p1 = (i + 1) as f32 / cols as f32;
                    let start = ((ln_min + p0 * span).exp() as usize).clamp(min_bin, max_bin);
                    let mut end = ((ln_min + p1 * span).exp() as usize).clamp(start + 1, max_bin + 1);
                    if end <= start { end = start + 1; }
                    let mut mx = 0.0f32;
                    for j in start..end.min(half) { mx = mx.max(mags[j]); }
                    cols_out[i] = mx;
                }
                // 节流发送
                let now = std::time::Instant::now();
                if now.duration_since(last_emit) >= min_emit_interval {
                    let _ = app.emit("spectrum:data", cols_out);
                    last_emit = now;
                } else {
                    // 间隔未到，稍作等待，避免忙等
                    std::thread::sleep(min_emit_interval - now.duration_since(last_emit));
                }
            } else {
                // 看门狗：超过 2 秒没有任何输出，提示前端
                if last_emit.elapsed() > std::time::Duration::from_secs(2) {
                    let msg = "no audio data yet (waiting for playback)".to_string();
                    if last_status != msg { let _ = app.emit("spectrum:status", msg.clone()); last_status = msg; }
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        }

        let _ = app.emit("spectrum:status", "capture stopping");
        audio_client.Stop().ok();
        CoUninitialize();
    }
    Ok(())
}
