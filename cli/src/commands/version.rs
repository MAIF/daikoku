use crate::logging::{error::DaikokuCliError, logger};

pub fn run() -> Result<(), DaikokuCliError> {
    logger::success(format!("daikokucli version: {}", env!("CARGO_PKG_VERSION")));
    Ok(())
}
