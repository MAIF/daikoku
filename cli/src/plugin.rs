use serde::{Deserialize, Serialize};

use std::fs::{self, DirEntry};

#[derive(Serialize, Deserialize, Clone)]
pub struct Folder {
    pub blocks: Vec<CmsFile>,
    pub pages: Vec<CmsFile>,
    pub metadata: Vec<CmsFile>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PluginMetadata {
    pub name: String,
    pub version: String,
    pub local: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct CmsFile {
    name: String,
    content: String,
}

pub fn read_contents(path: &String) -> Folder {
    let metadata_paths = read_directories_files(path);
    let blocks_paths = read_directories_files(format!("{}/{}", path.as_str(), "blocks").as_str());
    let pages_paths = read_directories_files(format!("{}/{}", path.as_str(), "pages").as_str());

    let metadata = read_files_contents(&metadata_paths);
    let blocks = read_files_contents(&blocks_paths);
    let pages = read_files_contents(&pages_paths);

    let new_plugin = Folder {
        metadata,
        blocks,
        pages,
    };

    new_plugin
}

fn read_files_contents(files: &Vec<DirEntry>) -> Vec<CmsFile> {
    let r = files
        .into_iter()
        .filter(|file| {
            !file.file_name().into_string().unwrap().eq(".DS_Store")
                && fs::read_to_string(file.path()).is_ok()
        })
        .map(|file| CmsFile {
            content: fs::read_to_string(file.path()).unwrap(),
            name: file.file_name().into_string().unwrap(),
        })
        .collect();

    r
}

fn read_directories_files(path: &str) -> Vec<DirEntry> {
    match fs::read_dir(path) {
        Ok(files) => files.map(|f| f.unwrap()).collect(),
        Err(e) => panic!(
            "Should be able to read contents at the specified path, {}",
            e
        ),
    }
}
