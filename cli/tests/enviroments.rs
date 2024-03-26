use assert_cmd::prelude::*;
use serial_test::serial;
use std::{
    fs,
    process::{Command, Output},
};

const WASMO_TEST_FOLDER: &str = "/tmp/daikokucli";
struct Setup {
    temporary_path: String,
}

impl Setup {
    fn new() -> Self {
        let temporary_path = WASMO_TEST_FOLDER.to_string();

        let _ = fs::remove_dir_all(&temporary_path);

        match fs::create_dir(&temporary_path) {
            Err(err) => println!("{:?}", err),
            Ok(v) => println!("{:?}", v),
        }
        Setup {
            temporary_path: temporary_path,
        }
    }

    fn new_with_project() -> Self {
        let temporary_path = WASMO_TEST_FOLDER.to_string();

        let _ = fs::remove_dir_all(&temporary_path);

        match fs::create_dir(&temporary_path) {
            Err(err) => println!("{:?}", err),
            Ok(v) => println!("{:?}", v),
        }

        let mut cmd = Command::cargo_bin("daikokucli").unwrap();

        cmd.args([
            "create",
            "--name=cms",
            "--template=empty",
            format!("--path={}", &temporary_path).as_str(),
        ]);
        cmd.assert();

        Setup {
            temporary_path: temporary_path,
        }
    }

    fn new_with_project_and_environment() -> Self {
        let temporary_path = WASMO_TEST_FOLDER.to_string();

        let _ = fs::remove_dir_all(&temporary_path);

        match fs::create_dir(&temporary_path) {
            Err(err) => println!("{:?}", err),
            Ok(v) => println!("{:?}", v),
        }

        let mut cmd = Command::cargo_bin("daikokucli").unwrap();

        cmd.args([
            "create",
            "--name=cms",
            "--template=empty",
            format!("--path={}", &temporary_path).as_str(),
        ]);
        cmd.assert();

        cmd = Command::cargo_bin("daikokucli").unwrap();

        cmd.args([
            "environments",
            "add",
            "--name=dev",
            "--server=http://localhost:9999",
            "--force=true",
        ])
        .assert()
        .success();

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
fn add_environment_on_missing_project() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new();

    let mut cmd = Command::cargo_bin("daikokucli")?;

    cmd.args([
        "environments",
        "add",
        "--name=dev",
        "--server=http://localhost:9999",
        "--force=true",
    ])
    .assert()
    .failure();

    setup.clean();
    Ok(())
}

#[test]
#[serial]
fn add_environment_after_creating_project() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new_with_project();

    let mut cmd = Command::cargo_bin("daikokucli")?;

    cmd.args([
        "environments",
        "add",
        "--name=dev",
        "--server=http://localhost:9999",
        "--force=true",
    ])
    .assert()
    .success();

    setup.clean();
    Ok(())
}

#[test]
#[serial]
fn clear_environments() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new_with_project();

    let mut cmd = Command::cargo_bin("daikokucli")?;

    cmd.args(["environments", "clear"]).assert().success();
    cmd.assert().success();

    setup.clean();
    Ok(())
}

#[test]
#[serial]
fn remove_environment() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new_with_project_and_environment();

    let mut cmd = Command::cargo_bin("daikokucli")?;

    cmd.args(["environments", "remove", "--name=dev"])
        .assert()
        .success();

    setup.clean();
    Ok(())
}

#[test]
#[serial]
fn default_environment() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new_with_project_and_environment();

    let mut cmd = Command::cargo_bin("daikokucli")?;

    let content: Output = cmd.args(["environments", "list"]).output()?;

    assert_eq!(
        String::from_utf8(content.stdout)
            .unwrap()
            .contains("default"),
        true
    );

    setup.clean();
    Ok(())
}

#[test]
#[serial]
fn get_environment() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new_with_project_and_environment();

    let mut cmd = Command::cargo_bin("daikokucli")?;

    let content: Output = cmd.args(["environments", "env", "--name=dev"]).output()?;

    assert_eq!(
        String::from_utf8(content.stdout)
            .unwrap()
            .contains("server"),
        true
    );

    setup.clean();
    Ok(())
}
