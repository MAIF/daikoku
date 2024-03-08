use std::{fs, path::{Path, PathBuf}};

use http_body_util::BodyExt;
use std::io::Read;

use crate::logging::error::{DaikokuCliError, DaikokuResult};


pub fn absolute_path(path: String) -> DaikokuResult<String> {
    match expand_tilde(&path) {
        None => fs::canonicalize(path)
            .unwrap()
            .into_os_string()
            .into_string()
            .map_err(|_p| DaikokuCliError::FileSystem("failed to canonicalize path".to_string())),
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

pub(crate) async fn frame_to_bytes_body(mut req: hyper::body::Incoming) -> Vec<u8> {
    let mut result: Vec<u8> = Vec::new();

    while let Some(next) = req.frame().await {
        let frame = next.unwrap();
        if let Ok(chunk) = frame.into_data() {
            for b in chunk.bytes() {
                (result).push(b.unwrap().clone());
            }
        }
    }

    result
}