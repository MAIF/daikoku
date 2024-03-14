use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use std::{
    collections::HashMap,
    fs::{self},
    path::PathBuf,
    str::FromStr,
};

use crate::logging::error::DaikokuResult;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub(crate) struct CmsFile {
    pub(crate) name: String,
    pub(crate) content: String,
    pub(crate) metadata: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub(crate) struct UiCmsFile {
    pub(crate) name: String,
    pub(crate) path: String,
}

impl CmsFile {
    fn new(file_path: PathBuf, file_name: String, metadata: HashMap<String, String>) -> CmsFile {
        CmsFile {
            content: fs::read_to_string(file_path).unwrap(),
            name: file_name,
            metadata,
        }
    }

    pub(crate) fn to_ui_component(&self) -> UiCmsFile {
        UiCmsFile {
            name: self.name.clone(),
            path: self.path(),
        }
    }

    pub(crate) fn path(&self) -> String {
        self.metadata
            .get("_path")
            .cloned()
            .unwrap_or("".to_string())
    }

    fn bool(&self, key: String) -> bool {
        self.metadata
            .get(&key)
            .map(|str| str.parse().unwrap_or(false))
            .unwrap_or(false)
    }

    pub(crate) fn exact(&self) -> bool {
        self.bool("_exact".to_string())
    }

    // pub(crate) fn authenticated(&self) -> bool {
    //     self.bool("_authenticated".to_string())
    // }

    pub(crate) fn content_type(&self) -> String {
        self.metadata
            .get("_content_type")
            .cloned()
            .unwrap_or("".to_string())
    }
}

pub fn read_contents(path: &PathBuf) -> DaikokuResult<Vec<CmsFile>> {
    read_sources(path.join("src"))
}

pub(crate) fn read_sources(path: PathBuf) -> DaikokuResult<Vec<CmsFile>> {
    let mut pages: Vec<CmsFile> = Vec::new();

    for entry in WalkDir::new(path).into_iter().filter_map(Result::ok) {
        let f_name = String::from(entry.file_name().to_string_lossy());

        if entry.metadata().unwrap().is_file() {
            if let Some(extension) = entry.clone().path().extension() {
                let new_file = read_file(
                    entry.clone().into_path(),
                    f_name,
                    extension.to_string_lossy().into_owned(),
                );
                pages.push(new_file);
            }
        }
    }

    Ok(pages)
}

fn read_file(file_path: PathBuf, file_name: String, extension: String) -> CmsFile {
    let content = fs::read_to_string(&file_path).unwrap();

    let parts = &file_path
        .as_os_str()
        .to_str()
        .unwrap()
        .split("src/")
        .last()
        .unwrap()
        .split("/")
        .collect::<Vec<&str>>();

    let mut formatted_path = parts[0..parts.len()]
        .join("/")
        .replace("/pages", "/")
        .replace("pages/", "/")
        .replace("/page.html", "")
        .replace("/page.css", "");

    if formatted_path == "" && file_name == "page.html" {
        formatted_path = "/".to_string();
    }

    if content.contains("---") {
        let parts = content.split("---");

        let mut metadata: HashMap<String, String> =
            serde_yaml::from_str(&parts.clone().nth(0).unwrap()).unwrap();
        let content = parts.into_iter().nth(1).unwrap();

        metadata.insert("_path".to_string(), formatted_path.to_string());

        metadata.insert(
            "_content_type".to_string(),
            SourceExtension::from_str(&extension)
                .unwrap()
                .content_type(),
        );

        metadata.insert("_name".to_string(), file_name.clone());

        CmsFile {
            content: content.to_string(),
            name: file_name,
            metadata,
        }
    } else {
        let mut metadata: HashMap<String, String> = HashMap::new();
        metadata.insert("_path".to_string(), formatted_path.to_string());

        metadata.insert(
            "_content_type".to_string(),
            SourceExtension::from_str(&extension)
                .unwrap()
                .content_type(),
        );
        metadata.insert("_name".to_string(), file_name.clone());

        CmsFile::new(file_path, file_name, metadata)
    }
}

#[derive(Debug, PartialEq)]
pub(crate) enum SourceExtension {
    HTML,
    CSS,
    Javascript,
    JSON,
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
            "text/html" => Ok(SourceExtension::HTML),
            "css" => Ok(SourceExtension::CSS),
            "text/css" => Ok(SourceExtension::CSS),
            "javascript" => Ok(SourceExtension::Javascript),
            "js" => Ok(SourceExtension::Javascript),
            "text/javascript" => Ok(SourceExtension::Javascript),
            "json" => Ok(SourceExtension::JSON),
            "application/json" => Ok(SourceExtension::JSON),
            _ => Ok(SourceExtension::HTML),
        }
    }
}

impl ToContentType for SourceExtension {
    fn content_type(&self) -> String {
        match &self {
            SourceExtension::HTML => String::from("text/html"),
            SourceExtension::CSS => String::from("text/css"),
            SourceExtension::Javascript => String::from("text/javascript"),
            SourceExtension::JSON => String::from("application/json"),
        }
    }
}

impl Ext for SourceExtension {
    fn ext(&self) -> String {
        match &self {
            SourceExtension::HTML => String::from(".html"),
            SourceExtension::CSS => String::from(".css"),
            SourceExtension::Javascript => String::from(".js"),
            SourceExtension::JSON => String::from(".json"),
        }
    }
}
