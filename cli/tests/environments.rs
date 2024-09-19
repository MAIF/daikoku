mod cli;

use cli::{run_test, Environment};
// use cli::Environment;
use serial_test::serial;

#[tokio::test]
#[serial]
async fn add() -> Result<(), Box<dyn std::error::Error + 'static>> {
    run_test(|| {
        Environment::add("test", "localhost");
    })
    .await
}
