use std::path::PathBuf;
use std::{ffi, fs};

use assert_cmd::{assert::Assert, Command};
use testcontainers::{
    core::{IntoContainerPort, Mount, WaitFor},
    runners::AsyncRunner,
    ContainerAsync, GenericImage, ImageExt,
};

pub(crate) async fn run_test<T>(test: T) -> Result<(), Box<dyn std::error::Error + 'static>>
where
    T: FnOnce() -> (),
{
    let _cli = CLI::start().await?;

    test();

    Ok(())
}

pub(crate) struct CLI {
    postgres_container: ContainerAsync<GenericImage>,
    daikoku_container: ContainerAsync<GenericImage>,
}

impl CLI {
    pub(crate) fn run<I, S>(args: I) -> Assert
    where
        I: IntoIterator<Item = S>,
        S: AsRef<ffi::OsStr>,
    {
        Command::cargo_bin("daikoku").unwrap().args(args).run()
    }

    pub(crate) async fn start() -> Result<CLI, Box<dyn std::error::Error + 'static>> {
        let (postgres_container, daikoku_container) = Self::start_containers().await?;

        Ok(CLI {
            postgres_container,
            daikoku_container,
        })
    }

    pub(crate) async fn start_containers() -> Result<
        (ContainerAsync<GenericImage>, ContainerAsync<GenericImage>),
        Box<dyn std::error::Error + 'static>,
    > {
        let postgres = GenericImage::new("postgres", "13")
            .with_wait_for(WaitFor::message_on_stdout(
                "database system is ready to accept connections",
            ))
            .with_mapped_port(5432, 5432.tcp())
            .with_env_var("POSTGRES_USER", "postgres")
            .with_env_var("POSTGRES_PASSWORD", "postgres")
            .with_env_var("POSTGRES_DB", "daikoku");

        let postgres_container = postgres.start().await?;
        let host = postgres_container
            .get_bridge_ip_address()
            .await?
            .to_string();

        let mut state_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        state_path.push("tests/resources");

        let daikoku = GenericImage::new("maif/daikoku", "17.4.0-dev")
            .with_wait_for(WaitFor::message_on_stdout("Running missing evolutions"))
            .with_wait_for(WaitFor::seconds(5))
            .with_mapped_port(8080, 8080.tcp())
            .with_env_var("DAIKOKU_INIT_DATA_FROM", "/tmp/daikoku-state.ndjson")
            .with_env_var("DAIKOKU_POSTGRES_HOST", host)
            .with_env_var("DAIKOKU_MODE", "prod")
            .with_env_var("DAIKOKU_POSTGRES_DATABASE", "daikoku")
            .with_env_var("DAIKOKU_EXPOSED_ON", "8080")
            .with_mount(Mount::bind_mount(
                state_path.into_os_string().into_string().unwrap(),
                "/tmp",
            ));

        let daikoku_container = daikoku.start().await?;

        Ok((postgres_container, daikoku_container))
    }
}

pub(crate) trait AssertCommand {
    fn run(&mut self) -> Assert;
}

impl AssertCommand for Command {
    fn run(&mut self) -> Assert {
        self.assert().success()
    }
}

pub(crate) struct Environment {}

impl Environment {
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
            "--apikey=amJ1UWtEYWpZZThWVTU0a2RjVW1oWjhWM0I1Q0NmV1I6eTJXNmtYV21yRzBxdm8xU2psSjdYU1M0ZEE5cGc5dDlZZ25wMTlIOXR5cUJaZE5NSkZDQmRJUXVKQ3haMXk4VQ=="
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
}

pub struct Cms {}

impl Cms {
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

        Cms::clear(true);

        let _ = fs::create_dir(&temporary_path);

        Cms::init("cms", temporary_path);

        Ok(())
    }
}
