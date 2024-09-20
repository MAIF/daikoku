mod cli;

use std::path::PathBuf;

use cli::commands::{
    cli::{run_test, CustomRun, CLI},
    cms,
};

use serial_test::serial;

#[tokio::test]
#[serial]
async fn init() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::init("cms", cms::get_temporary_path());
    })
    .await
}

#[tokio::test]
#[serial]
async fn list() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::init("cms", cms::get_temporary_path());
        CLI::build(["cms", "list"]).run_and_multiple_expect(vec!["cms"]);
    })
    .await
}

#[tokio::test]
#[serial]
async fn add() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::add("cms", cms::get_temporary_path(), true);
        CLI::build(["cms", "list"]).run_and_multiple_expect(vec!["cms"]);
    })
    .await
}

#[tokio::test]
#[serial]
async fn switch() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        let cms = cms::get_temporary_path();
        let cms2 = cms::get_temporary_path();

        cms::add("cms", cms, true);
        cms::add("cms2", cms2, true);
        cms::switch("cms");
    })
    .await
}

#[tokio::test]
#[serial]
async fn remove() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        cms::add("cms", cms::get_temporary_path(), true);
        cms::remove("cms");
    })
    .await
}

#[tokio::test]
#[serial]
async fn migrate() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);

        let path = cms::get_temporary_path();
        cms::migrate("cms", &path);

        assert!(PathBuf::from(&path).exists());

        let src = PathBuf::from(&path).join("cms").join("src");

        assert!(src.join("blocks").exists());
        assert!(src.join("apis").exists());
        assert!(src.join("apis").join("un-test-pour-el-cli").exists());
        assert!(src.join("mails").exists());
        assert!(src.join("pages").exists());
        assert!(src.join("scripts").exists());
        assert!(src.join("styles").exists());
    })
    .await
}
