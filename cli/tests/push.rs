mod cli;

use cli::commands::{
    cli::{run_test, CustomRun, CLI},
    cms::{self, get_temporary_path},
    environment,
};

use serial_test::serial;

// #[tokio::test]
// #[serial]
// async fn failed_push_missing_environment() -> Result<(), Box<dyn std::error::Error + 'static>> {
//     run_test(|_| {
//         cms::clear(true);
//         cms::init("cms", get_temporary_path());

//         CLI::build(["push"]).run_and_expect("default environment not found");
//     })
//     .await
// }

// #[tokio::test]
// #[serial]
// async fn push() -> Result<(), Box<dyn std::error::Error + 'static>> {
//     run_test(|_| {
//         cms::clear(true);
//         cms::init("cms", get_temporary_path());

//         environment::add("prod", "localhost");
//         CLI::run(["push"]);
//     })
//     .await
// }

// #[tokio::test]
// #[serial]
// async fn dry_run() -> Result<(), Box<dyn std::error::Error + 'static>> {
//     run_test(|_| {
//         cms::clear(true);
//         cms::init("cms", get_temporary_path());

//         environment::add("prod", "localhost");
//         CLI::build(["push", "--dry-run=true"]).run_and_expect("dry_run");
//     })
//     .await
// }

#[tokio::test]
#[serial]
async fn failed_push_invalid_path() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::migrate("cms", &get_temporary_path());

        environment::add("prod", "localhost");
        CLI::build(["push", "--file_path=oto/un-test-pour-el-cli"]).failure();
    })
    .await
}

#[tokio::test]
#[serial]
async fn push_specific_path() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::migrate("cms", &get_temporary_path());

        environment::add("prod", "localhost");
        CLI::run(["push", "--file_path=apis/un-test-pour-el-cli"]);
    })
    .await
}
