use serde::{Deserialize, Serialize};
use serde_yaml::{Deserializer, Value};

use std::{
    collections::HashMap,
    fs::{self, DirEntry},
    str::FromStr,
};

use crate::{commands::watch::CmsPage, logging::{
    error::{DaikokuCliError, DaikokuResult},
    logger,
}};

pub(crate) const FOLDER_NAMES: [&str; 5] = ["pages", "styles", "scripts", "data", "blocks"];

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Folder {
    blocks: Vec<CmsFile>,
    pages: Vec<CmsFile>,
    metadata: Vec<CmsFile>,
    styles: Vec<CmsFile>,
    scripts: Vec<CmsFile>,
    data: Vec<CmsFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub(self) struct CmsFile {
    name: String,
    content: String,
    metadata: Option<CmsPage>,
}


impl CmsFile {
    fn new(file: &DirEntry) -> CmsFile {
        CmsFile {
            content: fs::read_to_string(file.path()).unwrap(),
            name: file.file_name().into_string().unwrap(),
            metadata: None,
        }
    }
}

pub fn read_contents(path: &String) -> Folder {
    let metadata_paths = read_directories_files(path);
    let blocks_paths = read_directories_files(format!("{}/{}", path.as_str(), "blocks").as_str());
    let data_paths = read_directories_files(format!("{}/{}", path.as_str(), "data").as_str());
    let scripts_paths = read_directories_files(format!("{}/{}", path.as_str(), "scripts").as_str());
    let styles_paths = read_directories_files(format!("{}/{}", path.as_str(), "styles").as_str());
    let pages_paths = read_directories_files(format!("{}/{}", path.as_str(), "pages").as_str());

    println!("read metadata");
    let metadata = read_files_contents(&metadata_paths);
    println!("read block");
    let blocks = read_files_contents(&blocks_paths);
    println!("read pages");
    let pages = read_files_contents(&pages_paths);
    println!("read data");
    let data = read_files_contents(&data_paths);
    println!("read scripts");
    let scripts = read_files_contents(&scripts_paths);
    println!("read styles");
    let styles = read_files_contents(&styles_paths);
    println!("end");

    // println!("{:#?}", &pages);

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

// fn deserializer_to_map(name: &String, dese: Deserializer) -> DaikokuResult<HashMap<String, Value>> {
//     let content = Value::deserialize(dese).map_err(|err| {
//         logger::error(format!(
//             "Failed parsing metadata {} : {}",
//             name,
//             err.to_string()
//         ));
//         DaikokuCliError::DaikokuYamlError(err)
//     })?;

//     let value: HashMap<String, Value> = serde_yaml::from_value(content).map_err(|err| {
//         logger::error(format!(
//             "Failed parsing yaml metadata of file {} : {}",
//             name,
//             err.to_string()
//         ));
//         DaikokuCliError::DaikokuYamlError(err)
//     })?;

//     Ok(value)
// }

// fn deserializer_to_str(name: &String, dese: Deserializer) -> DaikokuResult<String> {
//     let content = Value::deserialize(dese).map_err(|err| {
//         logger::error(format!(
//             "Failed parsing file {} : {}",
//             name,
//             err.to_string()
//         ));
//         DaikokuCliError::DaikokuYamlError(err)
//     })?;

//     let value: String = serde_yaml::from_value(content).map_err(|err| {
//         logger::error(format!(
//             "Failed parsing content of file {} : {}",
//             name,
//             err.to_string()
//         ));
//         DaikokuCliError::DaikokuYamlError(err)
//     })?;

//     Ok(value)
// }

fn read_files_contents(files: &Vec<DirEntry>) -> Vec<CmsFile> {
    let r = files
        .into_iter()
        .filter(|file| {
            !file.file_name().into_string().unwrap().eq(".DS_Store")
                && fs::read_to_string(file.path()).is_ok()
        })
        .map(|file| {
            let content = fs::read_to_string(file.path()).unwrap();
            let name = file.file_name().into_string().unwrap();

            if name.contains(".html") && content.contains("---") {
                println!("HER");

                // TODO - fail to deserialize documents of two parts

                let parts = content.split("---");

                let metadata: CmsPage = serde_yaml::from_str(&parts.clone().nth(0).unwrap()).unwrap();

                println!("TWO");

                // let mut metadata = HashMap::new();
                let content = parts.into_iter().nth(1).unwrap();

                CmsFile {
                    content: content.to_string(),
                    name: file.file_name().into_string().unwrap(),
                    metadata: Some(metadata),
                }

                // for (idx, item) in documents.into_iter().enumerate() {
                //     if idx == 0 {
                //         metadata = deserializer_to_map(&name, item).unwrap_or(HashMap::new());
                //         println!("4");
                //     } else {
                //         // let test: String = item. 
                //         content = deserializer_to_str(&name, item).unwrap_or(String::from(""));
                //         println!("5");

                //         return CmsFile {
                //             content,
                //             name: file.file_name().into_string().unwrap(),
                //             metadata: Some(metadata),
                //         }
                //     }
                // }
                // CmsFile::new(&file)
                
            } else {
                CmsFile::new(&file)
            }
        })
        .collect();

    r
}

fn read_directories_files(path: &str) -> Vec<DirEntry> {
    match fs::read_dir(path) {
        Ok(files) => files.map(|f| f.unwrap()).collect(),
        Err(e) => panic!(
            "Should be able to read contents at the specified path : {} \n {}",
            &path, e
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
            "text/html" => Ok(SourceExtension::HTML),
            "css" => Ok(SourceExtension::CSS),
            "text/css" => Ok(SourceExtension::CSS),
            "javascript" => Ok(SourceExtension::Javascript),
            "text/javascript" => Ok(SourceExtension::Javascript),
            "json" => Ok(SourceExtension::JSON),
            "application/json" => Ok(SourceExtension::JSON),
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
            SourceExtension::JSON => String::from("json"),
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
