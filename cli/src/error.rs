use std::fmt;

pub type WasmoResult<T> = std::result::Result<T, DaikokuCliError>;

#[derive(Debug, Clone)]
pub enum DaikokuCliError {
    PluginNotExists(),
    PluginCreationFailed(String),
    BuildInterrupt(String),
    FileSystem(String),
    NoDockerRunning(String),
    DockerContainer(String),
    Configuration(String)
}

impl fmt::Display for DaikokuCliError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            DaikokuCliError::PluginCreationFailed(err) => {
                write!(f,"plugin failed to be create, {}", &err)
            }
            DaikokuCliError::PluginNotExists() => {
                write!(f,"plugin not found")
            }
            DaikokuCliError::NoDockerRunning(err) => {
                write!(f,"docker daemon can't be reach, {}", &err)
            }
            DaikokuCliError::DockerContainer(err) => write!(f,"docker command failed, {}", &err),
            DaikokuCliError::FileSystem(err) => {
                write!(f,"something happened using file system, {}", &err)
            },
            DaikokuCliError::BuildInterrupt(err) => {
                write!(f,"something happened when building, {}", &err)
            },
            DaikokuCliError::Configuration(err) => {
                write!(f,"something happened with the configuration, {}", &err)
            }
        }
    }
}
