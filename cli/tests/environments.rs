mod cli;

use cli::commands::{
    cli::{run_test, CustomRun, CLI},
    cms,
    environment::{self, CMS_APIKEY},
};

use serial_test::serial;

#[tokio::test]
#[serial]
async fn add() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::init("cms", cms::get_temporary_path());
        environment::clear(true);
        environment::add("test", "localhost");
    })
    .await
}

#[tokio::test]
#[serial]
async fn switch() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::init("cms", cms::get_temporary_path());
        environment::clear(true);
        environment::add("test", "localhost");
        environment::info("test").run_and_expect("test");
        environment::add("prod", "localhost");
        environment::switch("prod");
    })
    .await
}

#[tokio::test]
#[serial]
async fn remove() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::init("cms", cms::get_temporary_path());
        environment::clear(true);
        environment::add("test", "localhost");
        environment::remove("test");

        CLI::build(["environments", "info", "--name=test"])
            .run_and_expect("enviromnment not found");
    })
    .await
}

#[tokio::test]
#[serial]
async fn list() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::init("cms", cms::get_temporary_path());
        environment::clear(true);
        environment::add("test", "localhost");
        environment::add("prod", "localhost");

        CLI::build(["environments", "list"]).run_and_multiple_expect(vec![
            "test",
            "prod",
            "localhost",
        ]);
    })
    .await
}

#[tokio::test]
#[serial]
async fn config() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::init("cms", cms::get_temporary_path());
        environment::clear(true);
        environment::add("test", "localhost");

        CLI::build([
            "environments",
            "config",
            format!("--apikey={}", "wrong-apikey").as_str(),
            format!("--cookie={}", "cookie").as_str(),
        ])
        .run_and_expect(
            "failed to save configuration. The specified Daikoku server can not be reached",
        );

        environment::config(CMS_APIKEY, "COOKIE");
    })
    .await
}
