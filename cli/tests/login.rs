mod cli;

use cli::{Cms, Environment, CLI};
use serial_test::serial;

fn test_check_info_of_environment() {
    let result = Environment::info("dev");
    let output = String::from_utf8(result.get_output().stdout.clone()).unwrap();

    assert!(output.contains("http://localhost:8080"));
    assert!(output.contains("dev"));
}

#[tokio::test]
#[serial]
async fn login() -> Result<(), Box<dyn std::error::Error + 'static>> {
    CLI::start().await?;

    let daikoku_ip = "localhost"; //daikoku_container.get_host().await?.to_string();

    Cms::reset_cms().await?;

    Environment::add("dev", &daikoku_ip);

    test_check_info_of_environment();

    Environment::switch("dev");

    Environment::login();

    Ok(())
}
