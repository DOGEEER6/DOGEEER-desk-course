// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindow};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// 把 panic 写进日志，避免 release 版「闪一下就没了」却查不到原因
fn install_panic_logger() {
    let dir = std::env::temp_dir().join("DOGEEER课表");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("crash.log");
    std::panic::set_hook(Box::new(move |info| {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "[{}] {}", chrono_like_now(), info);
        }
    }));
}

/// 极简时间戳，避免额外依赖
fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(d) => format!("unix={}", d.as_secs()),
        Err(_) => "unix=?".to_string(),
    }
}

/// 应用版本
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 是否由「开机自启」拉起（安装时写入 --minimized 参数）
#[tauri::command]
fn launched_at_startup() -> bool {
    std::env::args().any(|a| a == "--minimized" || a == "--autostart")
}

/// 显示主窗口（完整课表）
#[tauri::command]
fn show_main(app: tauri::AppHandle) -> Result<(), String> {
    let win: WebviewWindow = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    win.show().map_err(|e| e.to_string())?;
    win.unminimize().ok();
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

/// 隐藏主窗口，只留浮窗
#[tauri::command]
fn hide_main(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 显示 / 隐藏浮窗
#[tauri::command]
fn set_mini_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mini") {
        if visible {
            win.show().map_err(|e| e.to_string())?;
        } else {
            win.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn hide_mini(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mini") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 浮窗是否置顶
#[tauri::command]
fn set_mini_always_on_top(app: tauri::AppHandle, on_top: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mini") {
        win.set_always_on_top(on_top).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 开机自启开关
#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    let r = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    r.map_err(|e| e.to_string())?;
    manager.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_logger();
    tauri::Builder::default()
        // 单实例必须第一个注册：否则重复双击会开出第二个「看不见」的实例
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let minimized = argv.iter().any(|a| a == "--minimized" || a == "--autostart");
            if let Some(mini) = app.get_webview_window("mini") {
                let _ = mini.show();
            }
            if !minimized {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.unminimize();
                    let _ = main.set_focus();
                }
                if let Some(mini) = app.get_webview_window("mini") {
                    let _ = mini.set_always_on_top(false);
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            app_version,
            launched_at_startup,
            show_main,
            hide_main,
            set_mini_visible,
            hide_mini,
            set_mini_always_on_top,
            set_autostart,
            get_autostart
        ])
        .setup(|app| {
            // 浮窗：不置顶（在桌面上就行），并使用 Windows 11 的 Mica 材质做毛玻璃
            if let Some(mini) = app.get_webview_window("mini") {
                let _ = mini.set_always_on_top(false);
                #[cfg(target_os = "windows")]
                {
                    use tauri::window::{Effect, EffectState, EffectsBuilder};
                    let _ = mini.set_effects(
                        EffectsBuilder::new()
                            .effect(Effect::Mica)
                            .state(EffectState::Active)
                            .build(),
                    );
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    // 关闭主窗口 = 收起为浮窗（回到「只有浮窗」的状态）
                    "main" => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    // 浮窗的 × 只是隐藏，不要退出整个应用
                    "mini" => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
