use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};

use std::{
    collections::HashMap,
    ffi::OsString,
    fs::{self, DirEntry},
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize, Clone)]
pub struct Plugin {
    kind: String,
    pub metadata: PluginMetadata,
    files: Vec<PluginFile>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PluginMetadata {
    pub name: String,
    pub version: String,
    pub local: bool
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileMetadata {
    pub name: String,
    pub version: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct TomlMetadata {
    package: FileMetadata,
}

#[derive(Serialize, Deserialize, Clone)]
struct PluginFile {
    name: String,
    content: String,
}

#[derive(Debug)]
struct PluginKind {
    kind: String,
    metadata_filename: String,
}

lazy_static! {
    static ref PLUGINS_KIND: HashMap<&'static str, PluginKind> = {
        let mut m = HashMap::new();
        m.insert(
            "go",
            PluginKind {
                kind: "go".to_string(),
                metadata_filename: "go.mod".to_string(),
            },
        );
        m.insert(
            "rs",
            PluginKind {
                kind: "rs".to_string(),
                metadata_filename: "Cargo.toml".to_string(),
            },
        );
        m.insert(
            "js",
            PluginKind {
                kind: "js".to_string(),
                metadata_filename: "package.json".to_string(),
            },
        );
        m.insert(
            "ts",
            PluginKind {
                kind: "ts".to_string(),
                metadata_filename: "package.json".to_string(),
            },
        );
        m.insert(
            "rego",
            PluginKind {
                kind: "opa".to_string(),
                metadata_filename: "package.json".to_string(),
            },
        );
        m
    };
}

pub fn read_plugin(path: &String) -> Plugin {
    let files = read_directories_files(path.as_str());

    let plugin_kind = detect_plugin_kind(&files);

    let metadata: PluginMetadata = read_metadata(
        &path.as_str(),
        &plugin_kind.metadata_filename,
        &plugin_kind.kind.as_str(),
    );

    let contents_files = read_files_contents(&files);

    let new_plugin = Plugin {
        kind: String::from(plugin_kind.kind.as_str()),
        metadata: metadata,
        files: contents_files,
    };

    new_plugin
}

fn read_files_contents(files: &Vec<DirEntry>) -> Vec<PluginFile> {
    let r = files
        .into_iter()
        .filter(|file| !file.file_name().into_string().unwrap().eq(".DS_Store") && fs::read_to_string(file.path()).is_ok())
        .map(|file| PluginFile {
            content: fs::read_to_string(file.path()).unwrap(),
            name: file.file_name().into_string().unwrap(),
        })
        .collect();

    r
}

fn read_metadata(path: &str, filename: &str, kind: &str) -> PluginMetadata {
    match fs::read_to_string(format!("{}/{}", path, filename)) {
        Err(err) => panic!("Should be able to read metadata file, {}", err),
        Ok(content) => {
            let out: FileMetadata = match kind {
                "go" => {
                    // extract data from formatted string like go-plugin/<version>
                    let mut first_line = content
                        .split("\n")
                        .next() // get first line
                        .unwrap()
                        .split(" ")
                        .last() // keep only name and version
                        .unwrap()
                        .splitn(2, "/");

                    FileMetadata {
                        name: first_line.next().unwrap().to_string(),
                        version: first_line.next().unwrap_or("1.0.0").to_string()
                    }
                }
                "rs" => (toml::from_str::<TomlMetadata>(&content).unwrap()).package,
                _ => serde_json::from_str(&content).unwrap()
            };

            PluginMetadata {
                name: out.name,
                version: out.version,
                local: true
            }
        },
    }
}

fn detect_plugin_kind(files: &Vec<DirEntry>) -> &'static PluginKind {
    let extensions: Vec<OsString> = files
        .into_iter()
        .map(|file| get_extension_from_filename(&file.path()))
        .filter_map(|x| x)
        .collect();

    let plugin_kind = extensions
        .into_iter()
        .find(|x| PLUGINS_KIND.contains_key(x.to_str().unwrap()));

    match plugin_kind {
        Some(kind) => match kind.into_string() {
            Ok(str) => PLUGINS_KIND.get(str.as_str()).unwrap(),
            Err(err) => panic!("Should be able to detect the plugin language, {:#?}", err),
        },
        None => panic!("Should be able to detect the plugin language"),
    }
}

fn get_extension_from_filename(filename: &PathBuf) -> Option<OsString> {
    Path::new(filename).extension().map(|x| x.to_os_string())
}

fn read_directories_files(path: &str) -> Vec<DirEntry> {
    match fs::read_dir(path) {
        Ok(files) => files
            .map(|f| f.unwrap())
            .filter(|file| !file.file_name().into_string().unwrap().contains(".wasm"))
            .collect(),
        Err(e) => panic!(
            "Should be able to read contents at the specified path, {}",
            e
        ),
    }
}
