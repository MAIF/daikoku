use assert_cmd::assert::Assert;

use super::cli::CLI;

pub static CMS_APIKEY: &str = "amJ1UWtEYWpZZThWVTU0a2RjVW1oWjhWM0I1Q0NmV1I6eTJXNmtYV21yRzBxdm8xU2psSjdYU1M0ZEE5cGc5dDlZZ25wMTlIOXR5cUJaZE5NSkZDQmRJUXVKQ3haMXk4VQ==";

pub(crate) fn info(name: &str) -> Assert {
    CLI::run(["environments", "info", format!("--name={}", name).as_str()])
}

pub(crate) fn clear(force: bool) -> Assert {
    CLI::run([
        "environments",
        "clear",
        format!("--force={}", force.to_string()).as_str(),
    ])
}

pub(crate) fn add(name: &str, daikoku_ip: &str /* apikey: String*/) -> Assert {
    CLI::run([
        "environments",
        "add",
        format!("--name={}", name).as_str(),
        format!("--server=http://{}:8080", daikoku_ip).as_str(),
        format!("--apikey={}", CMS_APIKEY).as_str(),
    ])
}

pub(crate) fn config(apikey: &str, cookie: &str) -> Assert {
    CLI::run([
        "environments",
        "config",
        format!("--apikey={}", apikey).as_str(),
        format!("--cookie={}", cookie).as_str(),
    ])
}

pub(crate) fn remove(name: &str) -> Assert {
    CLI::run([
        "environments",
        "remove",
        format!("--name={}", name).as_str(),
    ])
}

pub(crate) fn switch(name: &str) -> Assert {
    CLI::run([
        "environments",
        "switch",
        format!("--name={}", name).as_str(),
    ])
}

pub(crate) fn login() -> Assert {
    CLI::run(["login"])
}
