mod cli;

use std::{fs, path::PathBuf};

use cli::commands::{
    assets,
    cli::{run_test_with_s3, CustomRun},
    cms, environment,
};

use serial_test::serial;

// #[tokio::test]
// #[serial]
// async fn push() -> Result<(), Box<dyn std::error::Error + 'static>> {
//     run_test_with_s3(|_| {
//         cms::clear(true);

//         let project_path = cms::get_temporary_path();
//         cms::init("cms", project_path.clone());

//         environment::add("prod", "localhost");

//         let _ = fs::copy(
//             "tests/resources/daikoku.svg",
//             PathBuf::from(project_path)
//                 .join("cms")
//                 .join("assets")
//                 .join("daikoku.svg"),
//         );

//         assets::push(
//             "daikoku.svg",
//             "daikoku-logo",
//             "daikoku logo svg",
//             "daikoku-logo",
//         );
//     })
//     .await
// }

// #[tokio::test]
// #[serial]
// async fn remove() -> Result<(), Box<dyn std::error::Error + 'static>> {
//     run_test_with_s3(|_| {
//         cms::clear(true);

//         let project_path = cms::get_temporary_path();
//         cms::init("cms", project_path.clone());

//         environment::add("prod", "localhost");

//         let _ = fs::copy(
//             "tests/resources/daikoku.svg",
//             PathBuf::from(project_path)
//                 .join("cms")
//                 .join("assets")
//                 .join("daikoku.svg"),
//         );

//         let slug = "daikoku-logo";

//         assets::push("daikoku.svg", "daikoku-logo", "daikoku logo svg", slug);

//         assets::remove("daikoku.svg", slug);
//     })
//     .await
// }

// #[tokio::test]
// #[serial]
// async fn list() -> Result<(), Box<dyn std::error::Error + 'static>> {
//     run_test_with_s3(|_| {
//         cms::clear(true);

//         let project_path = cms::get_temporary_path();
//         cms::init("cms", project_path.clone());

//         environment::add("prod", "localhost");

//         let _ = fs::copy(
//             "tests/resources/daikoku.svg",
//             PathBuf::from(project_path)
//                 .join("cms")
//                 .join("assets")
//                 .join("daikoku.svg"),
//         );

//         let slug = "daikoku-logo";

//         assets::push("daikoku.svg", "daikoku-logo", "daikoku logo svg", slug);

//         assets::list().run_and_expect("daikoku-logo");
//     })
//     .await
// }

#[tokio::test]
#[serial]
async fn sync() -> Result<(), Box<dyn std::error::Error + 'static>> {
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

        let slug = "daikoku-logo";

        assets::push("daikoku.svg", "daikoku-logo", "daikoku logo svg", slug);

        assets::sync();

        assets::list().run_and_expect("daikoku-logo");

        assets::remove("daikoku.svg", slug);
    })
    .await
}
