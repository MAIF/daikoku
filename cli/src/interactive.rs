use crate::logging::error::{DaikokuCliError, DaikokuResult};

pub(crate) fn prompt() -> DaikokuResult<String> {
    let mut input = String::new();

    match std::io::stdin().read_line(&mut input) {
        Err(err) => Err(DaikokuCliError::ParsingError(err.to_string())),
        Ok(_) => Ok(input),
    }
}
