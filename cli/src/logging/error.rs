use std::error::Error;
use std::fmt;

pub type DaikokuResult<T> = std::result::Result<T, DaikokuCliError>;

#[derive(Debug)]
pub enum DaikokuCliError {
    CmsCreationFile(String),
    FileSystem(String),
    Configuration(String),
    HyperError(hyper::Error),
    DaikokuError(std::io::Error),
    DaikokuStrError(String),
    DaikokuErrorWithMessage(String, std::io::Error),
    DaikokuYamlError(serde_yaml::Error),
    ParsingError(String)
}

impl Error for DaikokuCliError {}
trait StdErrorTrait: Error + Send + Sync + 'static {}

impl<T: Error + Send + Sync + 'static> StdErrorTrait for T {}

impl From<DaikokuCliError> for Box<dyn StdErrorTrait> {
    fn from(err: DaikokuCliError) -> Self {
        Box::new(err)
    }
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
            DaikokuCliError::HyperError(err) => {
                write!(f, "[CONFIGURATION] : {}\n", &err)
            }
            DaikokuCliError::DaikokuError(err) => {
                write!(f, "[DAIKOKU] : {}\n", &err)
            }
            DaikokuCliError::DaikokuStrError(err) => {
                write!(f, "[DAIKOKU] : {}\n", &err)
            }
            DaikokuCliError::DaikokuErrorWithMessage(message, err) => {
                write!(f, "[DAIKOKU] : {} - {}\n", &message, &err)
            }
            DaikokuCliError::DaikokuYamlError(err) => {
                write!(f, "[DAIKOKU] : {}\n", &err)
            }
            DaikokuCliError::ParsingError(err) => {
                write!(f, "[DAIKOKU] : {}\n", &err)
            }
        }
    }
}
