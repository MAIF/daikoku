// // use assert_cmd::prelude::*;
// // use serial_test::serial;
// // use std::fs;
// use testcontainers::{clients, core::WaitFor, GenericImage};

// // const WASMO_TEST_FOLDER: &str = "/tmp/daikokucli";
// // struct Setup {
// //     temporary_path: String,
// // }

// // impl Setup {
// //     fn new() -> Self {
// //         let temporary_path = WASMO_TEST_FOLDER.to_string();

// //         let _ = fs::remove_dir_all(&temporary_path);

// //         match fs::create_dir(&temporary_path) {
// //             Err(err) => println!("{:?}", err),
// //             Ok(v) => println!("{:?}", v),
// //         }
// //         Setup {
// //             temporary_path: temporary_path,
// //         }
// //     }

// //     fn clean(&self) {
// //         fs::remove_dir_all(&self.temporary_path).expect("Failed to remove folder")
// //     }
// // }

// #[test]
// fn login() -> Result<(), Box<dyn std::error::Error>> {
//     let docker = clients::Cli::default();

//     let postgres = docker.run(
//         GenericImage::new("postgres", "12")
//             .with_env_var("POSTGRES_USER", "postgres")
//             .with_env_var("POSTGRES_PASSWORD", "postgres")
//             .with_env_var("POSTGRES_DB", "daikoku"),
//     );

//     let daikoku = docker.run(
//         GenericImage::new("daikoku", "17.1.2")
//             .with_env_var("daikoku.mode", "dev")
//             .with_env_var("Ddaikoku.postgres.database", "daikoku")
//             .with_env_var("daikoku.exposedOn", "9000"),
//     );

//     postgres.start();
//     daikoku.start();

//     WaitFor::seconds(60);

//     Ok(())
// }
