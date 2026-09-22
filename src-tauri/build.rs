fn main() {
    // 把 WebView2Loader.dll 放到产物目录，交给打包器一起装进安装包。
    //
    // 背景：Tauri/wry 在 Windows 上是**动态**加载 WebView2Loader.dll 的，
    // 而 webview2-com-sys 只会把它复制到 OUT_DIR（cargo 的构建目录），
    // 不会进入 bundle。结果就是：免安装版能跑（DLL 在 target/release 里），
    // 但装完之后启动报「找不到 webview2loader.dll」。
    copy_webview2_loader();

    tauri_build::build()
}

fn copy_webview2_loader() {
    let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("x86_64") => "x64",
        Ok("x86") => "x86",
        Ok("aarch64") => "arm64",
        _ => return,
    };

    let out_dir = match std::env::var("OUT_DIR") {
        Ok(v) => std::path::PathBuf::from(v),
        Err(_) => return,
    };

    // OUT_DIR = target/<profile>/build/desk-course-<hash>/out
    // webview2-com-sys 把 DLL 放在 target/<profile>/build/webview2-com-sys-*/out/<arch>/
    let profile_dir = match out_dir.ancestors().nth(3) {
        Some(p) => p.to_path_buf(),
        None => return,
    };
    let build_dir = profile_dir.join("build");

    let mut found: Option<std::path::PathBuf> = None;
    if let Ok(entries) = std::fs::read_dir(&build_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("webview2-com-sys-") {
                continue;
            }
            let candidate = entry.path().join("out").join(arch).join("WebView2Loader.dll");
            if candidate.is_file() {
                found = Some(candidate);
                break;
            }
        }
    }

    let Some(src) = found else {
        println!("cargo:warning=未找到 WebView2Loader.dll，安装包可能缺少该依赖");
        return;
    };

    // 复制到 target/<profile>/（exe 旁边），bundle.resources 会把它收进安装包
    let dest = profile_dir.join("WebView2Loader.dll");
    if let Err(e) = std::fs::copy(&src, &dest) {
        println!("cargo:warning=复制 WebView2Loader.dll 失败: {e}");
    } else {
        println!("cargo:warning=已把 WebView2Loader.dll 复制到 {}", dest.display());
    }
}
