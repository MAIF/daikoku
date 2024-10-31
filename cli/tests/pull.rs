mod cli;

use std::path::PathBuf;

use cli::commands::{
    cli::{run_test, CLI},
    cms::{self, get_temporary_path},
    environment,
};

use serial_test::serial;

#[tokio::test]
#[serial]
async fn pull_apis() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        let path = get_temporary_path();
        cms::init("cms", path.clone());
        environment::add("prod", "localhost");

        assert!(PathBuf::from(&path)
            .join("cms")
            .join("src")
            .join("apis")
            .exists());

        let dir = PathBuf::from(&path)
            .join("cms")
            .join("src")
            .join("apis")
            .read_dir()
            .unwrap();

        assert!(dir.count() == 1);

        CLI::run(["pull", "apis"]);

        assert!(PathBuf::from(&path)
            .join("cms")
            .join("src")
            .join("apis")
            .join("un-test-pour-el-cli")
            .exists());
    })
    .await
}

#[tokio::test]
#[serial]
async fn pull_mails() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|_| {
        cms::clear(true);
        let path = get_temporary_path();
        cms::init("cms", path.clone());
        environment::add("prod", "localhost");

        let dir = PathBuf::from(&path)
            .join("cms")
            .join("src")
            .join("mails")
            .read_dir()
            .unwrap();

        assert!(dir.count() == 1);

        CLI::run(["pull", "mails"]);

        assert!(
            PathBuf::from(&path)
                .join("cms")
                .join("src")
                .join("mails")
                .read_dir()
                .unwrap()
                .count()
                > 1
        );
    })
    .await
}
