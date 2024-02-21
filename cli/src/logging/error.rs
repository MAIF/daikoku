use std::fmt;

pub type DaikokuResult<T> = std::result::Result<T, DaikokuCliError>;

#[derive(Debug, Clone)]
pub enum DaikokuCliError {
    CmsCreationFile(String),
    FileSystem(String),
    Configuration(String)
}

impl fmt::Display for DaikokuCliError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            DaikokuCliError::CmsCreationFile(err) => {
                write!(f, "[CMS CREATION] : {}\n", &err)
            }
            DaikokuCliError::FileSystem(err) => {
                write!(f, "[FILE SYSTEM] : {}\n", &err)
            }
            DaikokuCliError::Configuration(err) => {
                write!(f, "[CONFIGURATION] : {}\n", &err)
            }
        }
    }
}
