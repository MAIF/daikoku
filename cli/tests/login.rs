// use assert_cmd::prelude::*;
// use serial_test::serial;
// use std::fs;
use testcontainers::{
    core::{IntoContainerPort, WaitFor},
    runners::AsyncRunner,
    GenericImage, ImageExt,
};

// const WASMO_TEST_FOLDER: &str = "/tmp/daikoku";
// struct Setup {
//     temporary_path: String,
// }

// impl Setup {
//     fn new() -> Self {
//         let temporary_path = WASMO_TEST_FOLDER.to_string();

//         let _ = fs::remove_dir_all(&temporary_path);

//         match fs::create_dir(&temporary_path) {
//             Err(err) => println!("{:?}", err),
//             Ok(v) => println!("{:?}", v),
//         }
//         Setup {
//             temporary_path: temporary_path,
//         }
//     }

//     fn clean(&self) {
//         fs::remove_dir_all(&self.temporary_path).expect("Failed to remove folder")
//     }
// }

#[tokio::test]
async fn login() -> Result<(), Box<dyn std::error::Error + 'static>> {
    let postgres = GenericImage::new("postgres", "13")
        .with_exposed_port(5432.tcp())
        .with_wait_for(WaitFor::seconds(1))
        .with_env_var("POSTGRES_USER", "postgres")
        .with_env_var("POSTGRES_PASSWORD", "postgres")
        .with_env_var("POSTGRES_DB", "daikoku");

    let daikoku = GenericImage::new("maif/daikoku", "17.5.0")
        .with_wait_for(WaitFor::seconds(1))
        .with_env_var("daikoku.mode", "dev")
        .with_env_var("Ddaikoku.postgres.database", "daikoku")
        .with_env_var("daikoku.exposedOn", "9000");

    let postgres_container = postgres.start().await?;
    let daikoku_container = daikoku.start().await?;

    println!("{:#?}", postgres_container);

    

    Ok(())
}
