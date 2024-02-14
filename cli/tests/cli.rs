use assert_cmd::prelude::*;
use lazy_static::lazy_static;
use predicates::prelude::predicate;
use serial_test::serial;
use std::{
    fs,
    process::Command,
    sync::{Arc, Mutex},
};

lazy_static! {
    static ref SEED: Arc<Mutex<usize>> = Arc::new(Mutex::new(0));
}

const WASMO_TEST_FOLDER: &str = "/tmp/wasmo";
struct Setup {
    temporary_path: String,
}

impl Setup {
    fn new() -> Self {
        let temporary_path = WASMO_TEST_FOLDER.to_string();

        match fs::create_dir(&temporary_path) {
            Err(err) => println!("{:?}", err),
            Ok(v) => println!("{:?}", v),
        }
        Setup {
            temporary_path: temporary_path,
        }
    }

    fn clean(&self) {
        fs::remove_dir_all(&self.temporary_path).expect("Failed to remove folder")
    }
}

#[test]
#[serial]
fn _1_initialize_plugin() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new();

    let mut cmd = Command::cargo_bin("wasmo")?;
    cmd.args([
        "init",
        "--template=js",
        "--name=foo-plugin",
        format!("--path={}", &setup.temporary_path).as_str(),
    ]);
    cmd.assert().success();

    setup.clean();
    Ok(())
}

#[test]
#[serial]
fn _2_should_failed_initialize_plugin_in_non_empty_directory(
) -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new();

    let mut cmd = Command::cargo_bin("wasmo")?;
    cmd.args([
        "init",
        "--template=js",
        "--name=foo-plugin",
        format!("--path={}", &setup.temporary_path).as_str(),
    ]);
    cmd.assert().success();

    cmd.assert()
        .stderr(predicate::str::contains("plugin failed to be create"));

    setup.clean();
    Ok(())
}

#[test]
#[serial]
fn _3_can_reset_configuration() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new();

    let mut cmd = Command::cargo_bin("wasmo")?;
    cmd.args(["config", "reset"]);
    cmd.assert().success();

    setup.clean();
    Ok(())
}

#[test]
#[serial]
fn _4_can_get_configuration() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new();

    let mut cmd = Command::cargo_bin("wasmo")?;
    cmd.args(["config", "get"]);
    cmd.assert()
        .stdout(predicate::str::contains("{}"))
        .success();

    setup.clean();
    Ok(())
}

#[test]
#[serial]
fn _5_can_set_configuration() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new();

    let mut cmd = Command::cargo_bin("wasmo")?;
    cmd.args([
        "config",
        "set",
        "--path=/tmp/wasmo"
    ]);
    cmd.assert()
        .stdout(predicate::str::contains("wasmo configuration patched"))
        .success();

    let mut cmd = Command::cargo_bin("wasmo")?;
    cmd.args(["config", "get"]);
    cmd.assert()
        .stdout(predicate::str::contains("/tmp/wasmo"))
        .success();

    setup.clean();
    Ok(())
}