mod cli;

use std::path::PathBuf;

use cli::commands::{
    cli::CLI,
    cms::{self, get_temporary_path},
};
use serial_test::serial;

#[tokio::test]
#[serial]
async fn generate() -> Result<(), Box<dyn std::error::Error + 'static>> {
    CLI::start().await?;

    cms::clear(true);

    let path = get_temporary_path();
    cms::init("cms", path.clone());

    CLI::run([
        "generate",
        "documentation",
        "--filename=test",
        "--title=title",
        "--desc=desc",
    ]);

    assert!(PathBuf::from(path)
        .join("cms")
        .join("src")
        .join("documentations")
        .join("test.html")
        .exists());

    Ok(())
}
