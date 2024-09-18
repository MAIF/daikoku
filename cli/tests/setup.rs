use std::path::PathBuf;

use testcontainers::{
    core::{IntoContainerPort, Mount, WaitFor},
    runners::AsyncRunner,
    ContainerAsync, GenericImage, ImageExt,
};

pub(crate) async fn start_containers() -> Result<
    (ContainerAsync<GenericImage>, ContainerAsync<GenericImage>),
    Box<dyn std::error::Error + 'static>,
> {
    let postgres = GenericImage::new("postgres", "13")
        .with_wait_for(WaitFor::message_on_stdout(
            "database system is ready to accept connections",
        ))
        .with_mapped_port(5432, 5432.tcp())
        .with_env_var("POSTGRES_USER", "postgres")
        .with_env_var("POSTGRES_PASSWORD", "postgres")
        .with_env_var("POSTGRES_DB", "daikoku");

    let postgres_container = postgres.start().await?;
    let host = postgres_container
        .get_bridge_ip_address()
        .await?
        .to_string();

    let mut state_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    state_path.push("tests/resources");

    let daikoku = GenericImage::new("maif/daikoku", "17.4.0-dev")
        .with_wait_for(WaitFor::message_on_stdout("Running missing evolutions"))
        .with_wait_for(WaitFor::seconds(5))
        .with_mapped_port(8080, 8080.tcp())
        .with_env_var("DAIKOKU_INIT_DATA_FROM", "/tmp/daikoku-state.ndjson")
        .with_env_var("DAIKOKU_POSTGRES_HOST", host)
        .with_env_var("DAIKOKU_MODE", "prod")
        .with_env_var("DAIKOKU_POSTGRES_DATABASE", "daikoku")
        .with_env_var("DAIKOKU_EXPOSED_ON", "8080")
        .with_mount(Mount::bind_mount(
            state_path.into_os_string().into_string().unwrap(),
            "/tmp",
        ));

    let daikoku_container = daikoku.start().await?;

    Ok((postgres_container, daikoku_container))
}
