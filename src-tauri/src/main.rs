use std::{
    env,
    error::Error,
    net::TcpStream,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

mod storage;

const DEFAULT_PORT: u16 = 5173;

type DynError = Box<dyn Error>;

struct LocalServer {
    child: Mutex<Option<Child>>,
}

fn boxed_error(message: impl Into<String>) -> DynError {
    std::io::Error::new(std::io::ErrorKind::Other, message.into()).into()
}

fn read_arg(name: &str) -> Option<String> {
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == name {
            return args.next();
        }
    }
    None
}

fn normalize_port(value: Option<String>) -> u16 {
    value
        .and_then(|raw| raw.parse::<u16>().ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_PORT)
}

fn startup_port() -> u16 {
    normalize_port(read_arg("--port").or_else(|| env::var("PORT").ok()))
}

fn executable_dir() -> PathBuf {
    env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn development_app_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(executable_dir)
}

fn app_root_from_resource_dir(resource_dir: Option<PathBuf>) -> PathBuf {
    if let Ok(root) = env::var("RHODES_APP_ROOT") {
        return PathBuf::from(root);
    }
    if cfg!(debug_assertions) {
        return development_app_root();
    }
    resource_dir
        .map(|dir| dir.join("rhodes-app"))
        .unwrap_or_else(executable_dir)
}

fn app_root(app: &tauri::App) -> PathBuf {
    app_root_from_resource_dir(app.path().resource_dir().ok())
}

fn app_handle_root(app: &tauri::AppHandle) -> PathBuf {
    app_root_from_resource_dir(app.path().resource_dir().ok())
}

fn runtime_storage_target(app_root: &Path) -> storage::StorageTarget {
    let context =
        storage::StorageContext::from_runtime(app_root.to_path_buf(), !cfg!(debug_assertions));
    storage::storage_target(&context)
}

fn bundled_node_path(app: &tauri::App) -> Option<PathBuf> {
    let triple = option_env!("TAURI_ENV_TARGET_TRIPLE").unwrap_or("x86_64-pc-windows-msvc");
    let name = if cfg!(windows) {
        format!("node-{triple}.exe")
    } else {
        format!("node-{triple}")
    };
    let path = app.path().resource_dir().ok()?.join("bin").join(name);
    path.exists().then_some(path)
}

fn node_bin(app: &tauri::App) -> PathBuf {
    if let Ok(path) = env::var("RHODES_NODE_BIN") {
        return PathBuf::from(path);
    }
    if !cfg!(debug_assertions) {
        if let Some(path) = bundled_node_path(app) {
            return path;
        }
    }
    PathBuf::from("node")
}

fn start_node_server(
    app_root: &Path,
    node_bin: &Path,
    port: u16,
    state_dir: &Path,
) -> Result<Child, DynError> {
    let server_script = app_root.join("app").join("server.mjs");
    if !server_script.exists() {
        return Err(boxed_error(format!(
            "server script not found: {}",
            server_script.display()
        )));
    }
    let child = Command::new(node_bin)
        .arg(server_script)
        .arg("--port")
        .arg(port.to_string())
        .current_dir(app_root)
        .env("PORT", port.to_string())
        .env("ARKNIGHTS_STATE_DIR", state_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()?;
    Ok(child)
}

fn wait_for_server(port: u16, timeout: Duration) -> Result<(), DynError> {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(150));
    }
    Err(boxed_error(format!(
        "timed out waiting for local server on 127.0.0.1:{port}"
    )))
}

fn stop_server(app_handle: &tauri::AppHandle) {
    let Some(state) = app_handle.try_state::<LocalServer>() else {
        return;
    };
    let Ok(mut child) = state.child.lock() else {
        return;
    };
    if let Some(mut process) = child.take() {
        let _ = process.kill();
        let _ = process.wait();
    }
}

fn open_main_window(app: &tauri::App, port: u16) -> Result<(), DynError> {
    let url: url::Url = format!("http://127.0.0.1:{port}/control-v2")
        .parse()
        .map_err(|error| boxed_error(format!("invalid app URL: {error}")))?;
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("RHODES OBS COMMANDER3373")
        .inner_size(1360.0, 920.0)
        .min_inner_size(980.0, 680.0)
        .build()?;
    Ok(())
}

#[tauri::command]
fn rhodes_storage_target(app: tauri::AppHandle) -> storage::StorageTargetInfo {
    let app_root = app_handle_root(&app);
    let context = storage::StorageContext::from_runtime(app_root, !cfg!(debug_assertions));
    storage::storage_target_info(&context)
}

fn main() {
    tauri::Builder::default()
        .manage(LocalServer {
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![rhodes_storage_target])
        .setup(|app| {
            let port = startup_port();
            let app_root = app_root(app);
            let storage_target = runtime_storage_target(&app_root);
            let node_bin = node_bin(app);
            let child = start_node_server(&app_root, &node_bin, port, &storage_target.state_dir)?;
            *app.state::<LocalServer>()
                .child
                .lock()
                .map_err(|_| boxed_error("failed to lock local server state"))? = Some(child);
            wait_for_server(port, Duration::from_secs(12))?;
            open_main_window(app, port)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. })
                && window.label() == "main"
            {
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Tauri application")
        .run(|app_handle, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
                stop_server(app_handle);
            }
        });
}
