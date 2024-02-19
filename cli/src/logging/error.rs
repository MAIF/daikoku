use std::fmt;

pub type DaikokuResult<T> = std::result::Result<T, DaikokuCliError>;

#[derive(Debug, Clone)]
pub enum DaikokuCliError {
    CmsCreationFile(String),
    FileSystem(String),
    Configuration(String),
    FolderNotExists(String)
}

impl fmt::Display for DaikokuCliError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            DaikokuCliError::CmsCreationFile(err) => {
                write!(f, "cms failed to be create, {}\n", &err)
            }
            DaikokuCliError::FileSystem(err) => {
                write!(f, "something happened using file system, {}\n", &err)
            }
            DaikokuCliError::Configuration(err) => {
                write!(f, "something happened with the configuration, {}\n", &err)
            }
            DaikokuCliError::FolderNotExists(err) => {
                write!(f, "folder not found, {}\n", &err)
            }
        }
    }
}
