use std::{fs, path::{Path, PathBuf}};

use crate::logging::error::{DaikokuCliError, DaikokuResult};

pub(crate) fn get_option_home() -> String {
    match dirs::home_dir() {
        Some(p) => p.into_os_string().into_string().unwrap(),
        None => "".to_owned(),
    }
}

pub(crate) fn get_home() -> DaikokuResult<PathBuf> {
    match dirs::home_dir() {
        Some(p) => Ok(p),
        None => Err(DaikokuCliError::FileSystem(format!(
            "Impossible to get your home dir!"
        ))),
    }
}

pub fn absolute_path(path: String) -> DaikokuResult<String> {
    match expand_tilde(&path) {
        None => fs::canonicalize(path)
            .unwrap()
            .into_os_string()
            .into_string()
            .map_err(|p| DaikokuCliError::FileSystem("failed to canonicalize path".to_string())),
        Some(path) => fs::canonicalize(path)
            .map(|res| res.into_os_string().into_string().unwrap())
            .map_err(|p| DaikokuCliError::FileSystem(p.to_string()))
    }
}

fn expand_tilde<P: AsRef<Path>>(path_user_input: P) -> Option<PathBuf> {
    let p = path_user_input.as_ref();
    if !p.starts_with("~") {
        return Some(p.to_path_buf());
    }
    if p == Path::new("~") {
        return dirs::home_dir();
    }
    dirs::home_dir().map(|mut h| {
        if h == Path::new("/") {
            // Corner case: `h` root directory;
            // don't prepend extra `/`, just drop the tilde.
            p.strip_prefix("~").unwrap().to_path_buf()
        } else {
            h.push(p.strip_prefix("~/").unwrap());
            h
        }
    })
}

pub(crate) fn get_current_working_dir() -> DaikokuResult<String> {
    match std::env::current_dir() {
        Ok(x) => Ok(x.into_os_string().into_string().unwrap()),
        Err(e) => Err(DaikokuCliError::FileSystem(format!(
            "Should be able to read the current directory, {}",
            e
        ))),
    }
}