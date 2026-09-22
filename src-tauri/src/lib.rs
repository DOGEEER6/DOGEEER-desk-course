// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewWindow,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// 浮窗是否「固定」（置顶 + 不可拖动）
static MINI_LOCKED: Mutex<bool> = Mutex::new(false);
/// 固定后是否鼠标穿透
static MINI_CLICK_THROUGH: Mutex<bool> = Mutex::new(false);
/// 托盘图标是否可见
static TRAY_VISIBLE: Mutex<bool> = Mutex::new(true);

/* ------------------------------------------------------------------ */
/* 崩溃日志                                                            */
/* ------------------------------------------------------------------ */

/// 把 panic 写进日志，避免 release 版「闪一下就没了」却查不到原因
fn install_panic_logger() {
    let dir = std::env::temp_dir().join("DOGEEER课表");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("crash.log");
    std::panic::set_hook(Box::new(move |info| {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "[{}] {}", unix_now(), info);
        }
    }));
}

fn unix_now() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/* ------------------------------------------------------------------ */
/* 命令                                                                */
/* ------------------------------------------------------------------ */

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

/// 浮窗是否固定在桌面最前
#[tauri::command]
fn set_mini_always_on_top(app: tauri::AppHandle, on_top: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mini") {
        win.set_always_on_top(on_top).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 固定 / 解除固定：固定后浮窗停在原地、鼠标穿透，不能拖动也不能改大小
#[tauri::command]
fn set_mini_locked(app: tauri::AppHandle, locked: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mini") {
        win.set_always_on_top(locked).map_err(|e| e.to_string())?;
        win.set_resizable(!locked).map_err(|e| e.to_string())?;
    }
    if let Ok(mut guard) = MINI_LOCKED.lock() {
        *guard = locked;
    }
    Ok(())
}

/// 固定后让鼠标穿透到桌面（点浮窗等于点桌面）
#[tauri::command]
fn set_mini_click_through(app: tauri::AppHandle, through: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mini") {
        win.set_ignore_cursor_events(through).map_err(|e| e.to_string())?;
    }
    if let Ok(mut guard) = MINI_CLICK_THROUGH.lock() {
        *guard = through;
    }
    Ok(())
}

/// 把浮窗贴到（当前显示器）工作区右上角。
///
/// 位置必须在 Rust 侧算：前端 `set_position` 的单位混乱（实测传物理像素会被
/// 再缩放一次，导致窗口被夹回屏幕内），这里直接拿 monitor.work_area() 的物理像素，
/// 用 `PhysicalPosition` 定位，最可靠。
#[tauri::command]
fn snap_mini_top_right(app: tauri::AppHandle, width: f64, height: f64, gap: f64) -> Result<(), String> {
    let win = app
        .get_webview_window("mini")
        .ok_or_else(|| "mini window not found".to_string())?;

    // 尺寸用逻辑像素
    let _ = win.set_size(tauri::LogicalSize::new(width, height));

    let scale = win.scale_factor().unwrap_or(1.0);
    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| win.primary_monitor().ok().flatten());

    if let Some(m) = monitor {
        let wa = m.work_area();
        let w_px = width * scale;
        let gap_px = gap * scale;
        let x = wa.position.x as f64 + wa.size.width as f64 - w_px - gap_px;
        let y = wa.position.y as f64 + gap_px;
        win.set_position(tauri::PhysicalPosition::new(x.round() as i32, y.round() as i32))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 浮窗当前所在显示器的工作区尺寸（逻辑像素），用于限制内容高度
#[tauri::command]
fn mini_work_area_height(app: tauri::AppHandle) -> f64 {
    let Some(win) = app.get_webview_window("mini") else {
        return 900.0;
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten());
    match monitor {
        Some(m) => m.work_area().size.height as f64 / scale,
        None => 900.0,
    }
}

/// 应用启动后延迟把浮窗贴到右上角。
///
/// 为什么要在 Rust 侧延迟：Windows 在窗口尺寸/样式变化时会把窗口挪到
/// 默认位置（前端贴完又被挪走，实测过多次）。这里等 WebView 完全就绪后
/// 一次性贴到位，最可靠。`first_run` 为 false（用户拖过）时不动。
fn schedule_initial_snap(app: tauri::AppHandle, first_run: bool, height: f64) {
    if !first_run {
        return;
    }
    std::thread::spawn(move || {
        // 连着贴几次：前端的高度自适应会触发多次 resize，而 Windows 每次 resize
        // 都可能把窗口挪回默认位置，所以只有「最后一次」才能留住。
        for ms in [1200u64, 2500, 3800, 5200] {
            std::thread::sleep(std::time::Duration::from_millis(ms));
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(win) = handle.get_webview_window("mini") {
                    let _ = win.set_size(tauri::LogicalSize::new(400.0, height.max(200.0)));
                    let scale = win.scale_factor().unwrap_or(1.0);
                    let monitor = win
                        .current_monitor()
                        .ok()
                        .flatten()
                        .or_else(|| win.primary_monitor().ok().flatten());
                    if let Some(m) = monitor {
                        let wa = m.work_area();
                        let gap = 16.0 * scale;
                        let x = wa.position.x as f64 + wa.size.width as f64 - 400.0 * scale - gap;
                        let y = wa.position.y as f64 + gap;
                        let _ = win.set_position(tauri::PhysicalPosition::new(
                            x.round() as i32,
                            y.round() as i32,
                        ));
                    }
                }
            });
            std::thread::sleep(std::time::Duration::from_millis(ms));
        }
    });
}

/// 前端告诉后端「是否需要初始贴边」
#[tauri::command]
fn request_initial_snap(app: tauri::AppHandle, first_run: bool, height: f64) {
    schedule_initial_snap(app, first_run, height);
}

/// 开机自启开关
#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    let r = if enabled { manager.enable() } else { manager.disable() };
    r.map_err(|e| e.to_string())?;
    manager.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// 托盘图标是否可见
#[tauri::command]
fn set_tray_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_visible(visible).map_err(|e| e.to_string())?;
    }
    if let Ok(mut guard) = TRAY_VISIBLE.lock() {
        *guard = visible;
    }
    Ok(())
}

#[tauri::command]
fn get_tray_visible() -> bool {
    TRAY_VISIBLE.lock().map(|g| *g).unwrap_or(true)
}

/* ------------------------------------------------------------------ */
/* 托盘                                                                */
/* ------------------------------------------------------------------ */

fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show_main = MenuItemBuilder::with_id("show-main", "打开完整课表").build(app)?;
    let toggle_mini = MenuItemBuilder::with_id("toggle-mini", "显示 / 隐藏浮窗").build(app)?;
    let pin_mini = MenuItemBuilder::with_id("pin-mini", "固定浮窗 / 解除固定").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出 DOGEEER 课表").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_main)
        .item(&toggle_mini)
        .item(&pin_mini)
        .separator()
        .item(&quit)
        .build()?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().ok_or_else(|| {
            tauri::Error::AssetNotFound("default window icon missing".into())
        })?)
        .tooltip("DOGEEER 课表")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show-main" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            "toggle-mini" => {
                if let Some(w) = app.get_webview_window("mini") {
                    let visible = w.is_visible().unwrap_or(false);
                    if visible {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                    }
                }
            }
            "pin-mini" => {
                if let Some(w) = app.get_webview_window("mini") {
                    let next = !MINI_LOCKED.lock().map(|g| *g).unwrap_or(false);
                    let _ = w.set_always_on_top(next);
                    let _ = w.set_resizable(!next);
                    // 固定时鼠标穿透到桌面；托盘菜单仍可解除
                    let _ = w.set_ignore_cursor_events(next);
                    if let Ok(mut guard) = MINI_LOCKED.lock() {
                        *guard = next;
                    }
                    if let Ok(mut guard) = MINI_CLICK_THROUGH.lock() {
                        *guard = next;
                    }
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // 左键单击：把主窗口唤到前台
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

/* ------------------------------------------------------------------ */

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
            set_mini_locked,
            set_mini_click_through,
            snap_mini_top_right,
            request_initial_snap,
            mini_work_area_height,
            set_autostart,
            get_autostart,
            set_tray_visible,
            get_tray_visible
        ])
        .setup(|app| {
            // 浮窗：真透明窗口（不要 Mica，否则桌面透不过来）+ 不占任务栏
            if let Some(mini) = app.get_webview_window("mini") {
                let _ = mini.set_always_on_top(false);
                let _ = mini.set_resizable(true);
                let _ = mini.set_skip_taskbar(true);
            }
            // 托盘常驻
            setup_tray(app.handle())?;
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
                    // 浮窗的 × 只是隐藏，不要退出整个应用（托盘里能再打开）
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
