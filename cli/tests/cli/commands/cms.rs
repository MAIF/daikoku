use std::fs;

use assert_cmd::assert::Assert;
use uuid::Uuid;

use super::{cli::CLI, environment::CMS_APIKEY};

pub(crate) fn clear(force: bool) -> Assert {
    CLI::run([
        "cms",
        "clear",
        format!("--force={}", force.to_string()).as_str(),
    ])
}

pub(crate) fn switch(name: &str) -> Assert {
    CLI::run([
        "cms",
        "switch",
        format!("--name={}", name.to_string()).as_str(),
    ])
}

pub(crate) fn remove(name: &str) -> Assert {
    CLI::run(["cms", "remove", format!("--name={}", name).as_str()])
}

pub(crate) fn init(name: &str, path: String) -> Assert {
    CLI::run([
        "cms",
        "init",
        format!("--name={}", name).as_str(),
        format!("--path={}", path).as_str(),
    ])
}

pub(crate) fn migrate(name: &str, path: &String) -> Assert {
    CLI::run([
        "cms",
        "migrate",
        format!("--name={}", name).as_str(),
        format!("--path={}", path).as_str(),
        format!("--server=http://{}:8080", "localhost").as_str(),
        format!("--apikey={}", CMS_APIKEY).as_str(),
    ])
}

pub(crate) fn add(name: &str, path: String, overwrite: bool) -> Assert {
    CLI::run([
        "cms",
        "add",
        format!("--name={}", name).as_str(),
        format!("--path={}", path).as_str(),
        format!("--overwrite={}", overwrite).as_str(),
    ])
}

pub(crate) fn get_temporary_path() -> String {
    let temporary_path = std::env::temp_dir()
        .join(Uuid::new_v4().to_string())
        .into_os_string()
        .into_string()
        .unwrap();

    let _ = fs::remove_dir_all(&temporary_path);

    let _ = fs::create_dir(&temporary_path);

    temporary_path
}
