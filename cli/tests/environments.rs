mod cli;

use cli::commands::{
    cli::{run_test, CustomRun, CLI},
    environment,
};

use serial_test::serial;

#[tokio::test]
#[serial]
async fn add() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        environment::clear(true);
        environment::add("test", "localhost");
    })
    .await
}

#[tokio::test]
#[serial]
async fn switch() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        environment::clear(true);
        environment::add("test", "localhost");
        environment::info("test").run_and_check_output("test");
        environment::add("prod", "localhost");
        environment::switch("prod");
    })
    .await
}

#[tokio::test]
#[serial]
async fn remove() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        environment::clear(true);
        environment::add("test", "localhost");
        environment::remove("test");

        // environment::info("test").run_and_check_output("enviromnment not found");
    })
    .await
}
