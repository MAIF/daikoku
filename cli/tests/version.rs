mod cli;

use cli::commands::cli::{CustomRun, CLI};

use serial_test::serial;
#[tokio::test]
#[serial]
async fn version() -> Result<(), Box<dyn std::error::Error + 'static>> {
    CLI::build(["version"]).run_and_expect("daikoku version:");

    Ok(())
}
