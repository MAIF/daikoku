mod cli;

use std::{fs, path::PathBuf};

use cli::commands::{assets, cli::run_test_with_s3, cms, environment};

use serial_test::serial;

#[tokio::test]
#[serial]
async fn push() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test_with_s3(|_| {
        cms::clear(true);

        let project_path = cms::get_temporary_path();
        cms::init("cms", project_path.clone());

        environment::add("prod", "localhost");

        let _ = fs::copy(
            "tests/resources/daikoku.svg",
            PathBuf::from(project_path)
                .join("cms")
                .join("assets")
                .join("daikoku.svg"),
        );

        assets::push(
            "daikoku.svg",
            "daikoku-logo",
            "daikoku logo svg",
            "daikoku-logo",
        );
    })
    .await
}
