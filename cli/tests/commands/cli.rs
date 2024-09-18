use std::ffi;

use assert_cmd::{assert::Assert, Command};

pub(crate) fn run<I, S>(args: I) -> Assert
where
    I: IntoIterator<Item = S>,
    S: AsRef<ffi::OsStr>,
{
    Command::cargo_bin("daikoku").unwrap().args(args).run()
}

pub(crate) trait AssertCommand {
    fn run(&mut self) -> Assert;
}

impl AssertCommand for Command {
    fn run(&mut self) -> Assert {
        self.assert().success()
    }
}

pub struct Environment {}

impl Environment {
    pub(crate) fn info(name: &str) -> Assert {
        run(["environments", "info", format!("--name={}", name).as_str()])
    }

    pub(crate) fn clear(force: bool) -> Assert {
        run([
            "environments",
            "clear",
            format!("--force={}", force.to_string()).as_str(),
        ])
    }

    pub(crate) fn add(name: &str, daikoku_ip: &str /* apikey: String*/) -> Assert {
        run([
            "environments",
            "add",
            format!("--name={}", name).as_str(),
            format!("--server=http://{}:8080", daikoku_ip).as_str(),
            "--apikey=amJ1UWtEYWpZZThWVTU0a2RjVW1oWjhWM0I1Q0NmV1I6eTJXNmtYV21yRzBxdm8xU2psSjdYU1M0ZEE5cGc5dDlZZ25wMTlIOXR5cUJaZE5NSkZDQmRJUXVKQ3haMXk4VQ=="
        ])
    }

    pub(crate) fn switch(name: &str) -> Assert {
        run([
            "environments",
            "switch",
            format!("--name={}", name).as_str(),
        ])
    }

    pub(crate) fn login() -> Assert {
        run(["login"])
    }
}

pub struct Cms {}

impl Cms {
    pub(crate) fn clear(force: bool) -> Assert {
        run([
            "cms",
            "clear",
            format!("--force={}", force.to_string()).as_str(),
        ])
    }

    pub(crate) fn init(name: &str, path: String) -> Assert {
        run([
            "cms",
            "init",
            format!("--name={}", name).as_str(),
            format!("--path={}", path).as_str(),
        ])
    }
}
