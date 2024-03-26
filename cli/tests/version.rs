use assert_cmd::prelude::*;
use std::process::Command;

#[test]
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut cmd = Command::cargo_bin("daikokucli")?;

    cmd.args(["version"]);
    cmd.assert().success();
    Ok(())
}
