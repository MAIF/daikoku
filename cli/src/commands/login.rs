use async_recursion::async_recursion;

use crate::{logging::error::DaikokuResult, process, Commands};

#[async_recursion]
pub(crate) async fn run(token: String) -> DaikokuResult<()> {
    process(Commands::Environments {
        command: crate::EnvironmentsCommands::PathDefault { token },
    })
    .await?;

    Ok(())
}