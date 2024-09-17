use assert_cmd::prelude::*;
use std::{fs, process::Command};

const WASMO_TEST_FOLDER: &str = "/tmp/daikoku";
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
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup::new();

    let mut cmd = Command::cargo_bin("daikoku")?;

    cmd.args(["projects", "clear"]).assert().success();

    cmd = Command::cargo_bin("daikoku")?;

    cmd.args([
        "create",
        "--name=cms",
        "--template=empty",
        format!("--path={}", &setup.temporary_path).as_str(),
    ]);
    cmd.assert().success();

    setup.clean();
    Ok(())
}
