mod commands;
mod setup;

use std::fs;

use commands::cli::{Cms, Environment};
use setup::start_containers;

async fn create_cms() -> Result<(), Box<dyn std::error::Error + 'static>> {
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

fn test_check_info_of_environment() {
    let result = Environment::info("dev");
    let output = String::from_utf8(result.get_output().stdout.clone()).unwrap();

    assert!(output.contains("http://localhost:8080"));
    assert!(output.contains("dev"));
}

#[tokio::test]
async fn login() -> Result<(), Box<dyn std::error::Error + 'static>> {
    let (_postgres_container, _daikoku_container) = start_containers().await?;

    let daikoku_ip = "localhost"; //daikoku_container.get_host().await?.to_string();

    create_cms().await?;

    Environment::add("dev", &daikoku_ip);

    test_check_info_of_environment();

    Environment::switch("dev");

    Environment::login();

    Ok(())
}
