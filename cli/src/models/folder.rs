use serde::{Deserialize, Serialize};

use std::{fs::{self, DirEntry}, str::FromStr};

#[derive(Serialize, Deserialize, Clone)]
pub struct Folder {
    blocks: Vec<CmsFile>,
    pages: Vec<CmsFile>,
    metadata: Vec<CmsFile>,
    styles: Vec<CmsFile>,
    scripts: Vec<CmsFile>,
    data: Vec<CmsFile>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(self) struct CmsFile {
    name: String,
    content: String,
}

pub fn read_contents(path: &String) -> Folder {
    let metadata_paths = read_directories_files(path);
    let blocks_paths = read_directories_files(format!("{}/{}", path.as_str(), "blocks").as_str());
    let data_paths = read_directories_files(format!("{}/{}", path.as_str(), "data").as_str());
    let scripts_paths = read_directories_files(format!("{}/{}", path.as_str(), "scripts").as_str());
    let styles_paths = read_directories_files(format!("{}/{}", path.as_str(), "styles").as_str());
    let pages_paths = read_directories_files(format!("{}/{}", path.as_str(), "pages").as_str());

    let metadata = read_files_contents(&metadata_paths);
    let blocks = read_files_contents(&blocks_paths);
    let pages = read_files_contents(&pages_paths);
    let data = read_files_contents(&data_paths);
    let scripts = read_files_contents(&scripts_paths);
    let styles = read_files_contents(&styles_paths);

    let new_plugin = Folder {
        metadata,
        blocks,
        pages,
        data,
        scripts,
        styles,
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

#[derive(Debug, PartialEq)]
pub(crate) enum SourceExtension {
    HTML,
    CSS,
    Javascript,
    JSON,
}

pub(crate) trait FilePath {
    fn path(&self) -> String;
}

pub(crate) trait ToContentType {
    fn content_type(&self) -> String;
}

pub(crate) trait Ext {
    fn ext(&self) -> String;
}

impl ToString for SourceExtension {
    fn to_string(&self) -> String {
        match &self {
            SourceExtension::HTML => String::from("html"),
            SourceExtension::CSS => String::from("css"),
            SourceExtension::Javascript => String::from("javascript"),
            SourceExtension::JSON => String::from("json"),
        }
    }
}

impl FromStr for SourceExtension {
    type Err = ();

    fn from_str(input: &str) -> Result<SourceExtension, Self::Err> {
        match input.to_lowercase().as_str() {
            "html" => Ok(SourceExtension::HTML),
            "css" => Ok(SourceExtension::CSS),
            "javascript" => Ok(SourceExtension::Javascript),
            "json" => Ok(SourceExtension::JSON),
            _ => panic!("Bad page extension"),
        }
    }
}

impl FilePath for SourceExtension {
    fn path(&self) -> String {
        match &self {
            SourceExtension::HTML => String::from("pages"),
            SourceExtension::CSS => String::from("styles"),
            SourceExtension::Javascript => String::from("scripts"),
            SourceExtension::JSON => String::from("json")
        }
    }
}

impl ToContentType for SourceExtension {
    fn content_type(&self) -> String {
        match &self {
            SourceExtension::HTML => String::from("text/html"),
            SourceExtension::CSS => String::from("text/css"),
            SourceExtension::Javascript => String::from("text/javascript"),
            SourceExtension::JSON => String::from("application/json")
        }
    }
}

impl Ext for SourceExtension {
    fn ext(&self) -> String {
        match &self {
            SourceExtension::HTML => String::from(".html"),
            SourceExtension::CSS => String::from(".css"),
            SourceExtension::Javascript => String::from(".js"),
            SourceExtension::JSON => String::from(".json")
        }
    }
}