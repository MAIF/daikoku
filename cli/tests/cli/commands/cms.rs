use std::fs;

use assert_cmd::assert::Assert;

use super::cli::CLI;

pub(crate) fn clear(force: bool) -> Assert {
    CLI::run([
        "cms",
        "clear",
        format!("--force={}", force.to_string()).as_str(),
    ])
}

pub(crate) fn init(name: &str, path: String) -> Assert {
    CLI::run([
        "cms",
        "init",
        format!("--name={}", name).as_str(),
        format!("--path={}", path).as_str(),
    ])
}

pub(crate) async fn reset_cms() -> Result<(), Box<dyn std::error::Error + 'static>> {
    let temporary_path = std::env::temp_dir()
        .join("daikoku")
        .into_os_string()
        .into_string()
        .unwrap();

    let _ = fs::remove_dir_all(&temporary_path);

    clear(true);

    let _ = fs::create_dir(&temporary_path);

    init("cms", temporary_path);

    Ok(())
}
