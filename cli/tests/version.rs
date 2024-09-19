use assert_cmd::prelude::*;
use std::process::Command;

#[cfg(test)]
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut cmd = Command::cargo_bin("daikoku")?;

    cmd.args(["version"]);
    cmd.assert().success();
    Ok(())
}
