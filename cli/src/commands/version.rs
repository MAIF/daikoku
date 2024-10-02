use crate::logging::{error::DaikokuCliError, logger};

pub fn run() -> Result<(), DaikokuCliError> {
    logger::success(format!("daikoku version: {}", env!("CARGO_PKG_VERSION")));
    Ok(())
}
