use assert_cmd::prelude::*;
use std::{env, fs, process::Command};

pub(crate) struct CreationSetup {
    temporary_path: String,
}

impl CreationSetup {
    fn clean(&self) {
        fs::remove_dir_all(&self.temporary_path).expect("Failed to remove folder")
    }

    fn new() -> Self {
        let temporary_path = env::temp_dir()
            .join("daikoku")
            .into_os_string()
            .into_string()
            .unwrap();

        let _ = fs::remove_dir_all(&temporary_path);

        let mut cmd = Command::cargo_bin("daikoku").unwrap();
        cmd.args(["cms", "clear", "--force=true"])
            .assert()
            .success();

        match fs::create_dir(&temporary_path) {
            Err(err) => println!("{:?}", err),
            Ok(v) => println!("{:?}", v),
        }

        CreationSetup {
            temporary_path: temporary_path,
        }
    }
}

#[test]
fn test_create_empty_cms() -> Result<(), Box<dyn std::error::Error>> {
    let setup = CreationSetup::new();

    let mut cmd = Command::cargo_bin("daikoku")?;

    cmd.args([
        "cms",
        "init",
        "--name=cms",
        format!("--path={}", &setup.temporary_path).as_str(),
    ]);
    cmd.assert().success();

    setup.clean();
    Ok(())
}
