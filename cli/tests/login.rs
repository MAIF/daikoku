mod cli;

use cli::commands::{
    cli::CLI,
    cms::{self, get_temporary_path},
    environment,
};
use serial_test::serial;

fn test_check_info_of_environment() {
    let result = environment::info("dev");
    let output = String::from_utf8(result.get_output().stdout.clone()).unwrap();

    assert!(output.contains("http://localhost:8080"));
    assert!(output.contains("dev"));
}

#[tokio::test]
#[serial]
async fn login() -> Result<(), Box<dyn std::error::Error + 'static>> {
    CLI::start().await?;

    cms::init("cms", get_temporary_path());

    environment::add("dev", "localhost");

    test_check_info_of_environment();

    environment::switch("dev");

    environment::login();

    Ok(())
}
