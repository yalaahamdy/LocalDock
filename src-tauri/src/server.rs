//! LocalDock — bundled server lifecycle.
//!
//! The LocalDock Node server (Next.js standalone build) ships as a Tauri
//! *resource*. The shell picks a free loopback port, spawns the bundled
//! `node.exe` with `LOCALDOCK_HOME` pointed at `%APPDATA%/LocalDock`, and
//! polls the health endpoint until the product UI is ready.

use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows: never flash a console window for the background server.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct ServerHandle {
    pub port: u16,
    pub child: Child,
}

impl ServerHandle {
    /// Terminate the bundled server. Idempotent.
    pub fn kill(&mut self) {
        #[cfg(windows)]
        {
            let pid = self.child.id();
            let _ = Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Data home: `%APPDATA%/LocalDock` on Windows, XDG data dir elsewhere.
pub fn data_home() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("LocalDock")
}

fn read_settings() -> serde_json::Value {
    let file = data_home().join("data").join("settings.json");
    std::fs::read(file)
        .ok()
        .and_then(|raw| serde_json::from_slice(&raw).ok())
        .unwrap_or(serde_json::json!({}))
}

/// Server display name from the persisted settings (used for mDNS instance).
pub fn server_name() -> String {
    read_settings()
        .get("serverName")
        .and_then(|v| v.as_str())
        .unwrap_or("LocalDock")
        .to_string()
}

/// The user's "Start with Windows" preference, as saved by the UI.
pub fn start_with_windows_pref() -> Option<bool> {
    read_settings()
        .get("startWithWindows")
        .and_then(|v| v.as_bool())
}

/// First free TCP port on loopback, starting from the preferred port.
pub fn find_free_port(preferred: u16) -> u16 {
    for port in preferred..preferred + 200 {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return port;
        }
    }
    0
}

/// Locate the bundled server + node runtime inside Tauri resources.
pub fn resource_paths() -> Result<(PathBuf, PathBuf), String> {
    // Resource layout (Windows): <exe dir>/resources/server + resources/bin/node.exe
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let base = exe.parent().ok_or("no parent dir")?.to_path_buf();
    let server_dir = base.join("resources").join("server");
    let node_exe = base.join("resources").join("bin").join("node.exe");
    if !server_dir.join("server.js").exists() {
        return Err(format!("server bundle missing at {}", server_dir.display()));
    }
    if !node_exe.exists() {
        return Err(format!("node runtime missing at {}", node_exe.display()));
    }
    Ok((server_dir, node_exe))
}

/// Spawn the bundled LocalDock server in desktop mode.
#[cfg(windows)]
fn kill_stale_server_processes() {
    let script = r#"
        $proc = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
        if ($proc) {
            $p = Get-Process -Id $proc -ErrorAction SilentlyContinue
            if ($p -and $p.ProcessName -eq "node") {
                Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue
            }
        }
    "#;
    let _ = Command::new("powershell")
        .args(&["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    std::thread::sleep(Duration::from_millis(150));
}

/// Spawn the bundled LocalDock server in desktop mode.
pub fn spawn_server() -> Result<ServerHandle, String> {
    #[cfg(windows)]
    kill_stale_server_processes();

    let (server_dir, node_exe) = resource_paths()?;
    let port = find_free_port(3000);
    if port == 0 {
        return Err("no free port available".into());
    }
    let home = data_home();
    let mut cmd = Command::new(&node_exe);
    cmd.arg("server.js")
        .current_dir(&server_dir)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "0.0.0.0")
        .env("NODE_ENV", "production")
        .env("LOCALDOCK_HOME", &home)
        .env("LOCALDOCK_DESKTOP", "1")
        // The console UI must never guess: tell it where the shell lives.
        .env("LOCALDOCK_PORT", port.to_string());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    #[cfg(windows)]
    ensure_firewall_allowed(port, &node_exe);

    let child = cmd
        .spawn()
        .map_err(|e| format!("failed to start server: {e}"))?;
    Ok(ServerHandle { port, child })
}

#[cfg(windows)]
fn ensure_firewall_allowed(port: u16, node_exe: &PathBuf) {
    let _ = Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name=LocalDock Port {port}"),
            "dir=in",
            "action=allow",
            "protocol=TCP",
            &format!("localport={port}"),
            "profile=any",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    let _ = Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "add",
            "rule",
            "name=LocalDock Server Runtime",
            "dir=in",
            "action=allow",
            &format!("program={}", node_exe.display()),
            "enable=yes",
            "profile=any",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

/// Poll the public health endpoint (`/api/bootstrap`) on loopback until the
/// server answers 200. (`/api/system` is owner-gated, so it 401s pre-auth.)
pub fn wait_healthy(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    let req = format!(
        "GET /api/bootstrap HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    while Instant::now() < deadline {
        if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) {
            use std::io::{Read, Write};
            if stream.write_all(req.as_bytes()).is_ok() {
                let mut buf = [0u8; 256];
                let mut got = Vec::new();
                let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
                while let Ok(n) = stream.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    got.extend_from_slice(&buf[..n]);
                    if got.len() > 4096 {
                        break;
                    }
                }
                let head = String::from_utf8_lossy(&got);
                if head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200") {
                    return true;
                }
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

/// Best-effort primary LAN IPv4 (for "open from your phone" hints).
pub fn lan_ips() -> Vec<String> {
    use std::net::UdpSocket;
    let mut out = Vec::new();
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        for probe in ["192.168.255.255", "10.255.255.255", "172.16.255.255"] {
            if sock.connect((probe, 1)).is_ok() {
                if let Ok(addr) = sock.local_addr() {
                    if !addr.ip().is_loopback() {
                        let ip = addr.ip().to_string();
                        if !out.contains(&ip) {
                            out.push(ip);
                        }
                        break;
                    }
                }
            }
        }
    }
    out
}
