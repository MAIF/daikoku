use assert_cmd::assert::Assert;

use super::cli::CLI;

pub(crate) fn push(
    filename: &str,
    title: &str,
    desc: &str,
    // path: O&str,
    slug: &str,
) -> Assert {
    CLI::run([
        "assets",
        "push",
        format!("--filename={}", filename).as_str(),
        format!("--title={}", title).as_str(),
        format!("--desc={}", desc).as_str(),
        // format!("--path={}", path).as_str(),
        format!("--slug={}", slug).as_str(),
    ])
}

pub(crate) fn remove(filename: &str, slug: &str) -> Assert {
    CLI::run([
        "assets",
        "remove",
        format!("--slug={}", slug.to_string()).as_str(),
        format!("--filename={}", filename.to_string()).as_str(),
    ])
}

pub(crate) fn list() -> Assert {
    CLI::run(["assets", "list"])
}

pub(crate) fn sync() -> Assert {
    CLI::run(["assets", "sync"])
}
