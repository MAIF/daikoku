use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    str::FromStr,
};

use bytes::Bytes;
use configparser::ini::Ini;
use http_body_util::Empty;
use hyper::{header, Method, Request};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;

use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger::{self, println},
    },
    models::folder::{Ext, SourceExtension},
    utils::{absolute_path, frame_to_bytes_body},
    ProjectCommands,
};

use super::enviroments::{get_default_environment, read_cookie_from_environment};

#[derive(Clone)]
pub(crate) struct Project {
    pub(crate) path: String,
    // name: String,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
struct CmsPage {
    _id: String,         //: "651443d43d00001b85d2dc7a",
    visible: bool,       //: true,
    authenticated: bool, //: false,
    name: String,        //: "parcours-affiliation-digitale",
    #[serde(alias = "contentType")]
    content_type: String, //: "text/html",
    path: Option<String>, //: "/parcours-affiliation-digitale",
    exact: bool,         //: false,
    #[serde(alias = "lastPublishedDate")]
    last_published_date: u64, //: 1706520418595
    #[serde(alias = "body")]
    content: String,
}

pub(crate) async fn run(command: ProjectCommands) -> DaikokuResult<()> {
    match command {
        ProjectCommands::Add {
            name,
            path,
            overwrite,
        } => add(name, absolute_path(path)?, overwrite.unwrap_or(false)),
        ProjectCommands::Default { name } => update_default(name),
        ProjectCommands::Delete { name } => delete(name),
        ProjectCommands::List {} => list(),
        ProjectCommands::Reset {} => clear(),
        ProjectCommands::Import { name, path } => import(name, path).await,
    }
}

pub(crate) fn get_default_project() -> DaikokuResult<Project> {
    let config = read(false)?;

    let default_project_name = config
        .get("default", "project")
        .ok_or(DaikokuCliError::Configuration(
        "missing default project or values in project. Specify a default project to use. See projects commands"
            .to_string(),
    ))?;

    let project = config
        .get_map()
        .map(|m| m[&default_project_name].clone())
        .ok_or(DaikokuCliError::Configuration(
        "missing default project or values in project. Specify a default project to use. See projects commands"
            .to_string(),
    ))?;

    match (&project["name"], &project["path"]) {
        (Some(_name), Some(path)) => Ok(Project {
            // name: name.to_string(),
            path: path.to_string() }),
        (_, _) => Err(DaikokuCliError::Configuration(
            "missing default project or values in project. Specify a default project to use. See projects commands"
                .to_string(),
        )),
    }
}

fn add(name: String, path: String, overwrite: bool) -> DaikokuResult<()> {
    logger::loading("<yellow>Initialize</> path to project ...".to_string());

    let mut config: Ini = read(false)?;

    if config.get(&name, "path").is_some() && !overwrite {
        return Err(DaikokuCliError::Configuration(
            "project already exists in your configuration file. use daikokucli projects list and remove it".to_string(),
        ));
    }

    if !Path::new(&path).exists() {
        return Err(DaikokuCliError::Configuration(
            "failed to find project at path".to_string(),
        ));
    }

    config.set(&name, "path", Some(path));
    config.set(&name, "name", Some(name.clone()));
    config.set("default", "project", Some(name.clone()));

    match config.write(&get_path()?) {
        Ok(()) => {
            logger::println("<green>New entry</> added".to_string());
            let _ = get_project(name);
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}

fn update_default(name: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Updating</> default project".to_string());
    let mut config: Ini = read(false)?;

    if config.get(&name, "path").is_none() {
        return Err(DaikokuCliError::Configuration(
            "a non-existing section cannot be set as default".to_string(),
        ));
    }

    config.set("default", "project", Some(name.clone()));

    match config.write(&get_path()?) {
        Ok(()) => {
            logger::println("<green>Defaut</> updated".to_string());
            let _ = get_project("default".to_string());
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}

pub(crate) fn get_project(name: String) -> DaikokuResult<Project> {
    let config = read(false)?;

    let projects = config.get_map().ok_or(DaikokuCliError::Configuration(
        "missing project or values in project.".to_string(),
    ))?;

    match projects.get(&name) {
        Some(project) => match (&project["name"], &project["path"]) {
            (Some(_name), Some(path)) => {
                logger::info(serde_json::to_string_pretty(&project).unwrap());
                Ok(Project {
                    // name: name.to_string(),
                    path: path.to_string(),
                })
            }
            (_, _) => Err(DaikokuCliError::Configuration(
                "missing project or values in project.".to_string(),
            )),
        },
        None => {
            return Err(DaikokuCliError::Configuration(
                "project is missing".to_string(),
            ))
        }
    }
}

fn list() -> DaikokuResult<()> {
    let config: Ini = read(false)?;

    let map = config.get_map().map(Ok).unwrap_or(Ok(HashMap::new()))?;

    logger::info(serde_json::to_string_pretty(&map).unwrap());

    Ok(())
}

fn delete(name: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Deleting</> project".to_string());
    let mut config: Ini = read(false)?;

    if name.to_lowercase() == "default" {
        return Err(DaikokuCliError::Configuration(
            "protected project cant be deleted".to_string(),
        ));
    }

    if config.remove_section(&name).is_none() {
        return Err(DaikokuCliError::Configuration(
            "a non-existing section cannot be delete".to_string(),
        ));
    };

    match config.write(&get_path()?) {
        Ok(()) => {
            logger::println(format!("<green>{}</> deleted", &name));
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}

fn get_path() -> DaikokuResult<String> {
    let home = get_home()?;

    Ok(home
        .join(".daikoku")
        .into_os_string()
        .into_string()
        .unwrap())
}

fn get_home() -> DaikokuResult<PathBuf> {
    match dirs::home_dir() {
        Some(p) => Ok(p),
        None => Err(DaikokuCliError::FileSystem(
            "Failed getting your home dir!".to_string(),
        )),
    }
}

fn read(last_attempt: bool) -> DaikokuResult<Ini> {
    let mut config = Ini::new();

    match config.load(&get_path()?) {
        Ok(_) => Ok(config),
        Err(_) if !last_attempt => match std::fs::File::create(&get_path()?) {
            Ok(_) => read(true),
            Err(e) => Err(DaikokuCliError::Configuration(e.to_string())),
        },
        Err(e) => Err(DaikokuCliError::Configuration(e.to_string())),
    }
}

fn clear() -> DaikokuResult<()> {
    let mut config = Ini::new();

    config.clear();

    match config.write(&get_path()?) {
        Ok(_) => {
            logger::println("<green>Environments erased</>".to_string());
            Ok(())
        }
        Err(e) => Err(DaikokuCliError::FileSystem(format!(
            "failed to reset the environments file : {}",
            e.to_string()
        ))),
    }
}

async fn import(name: String, path: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Converting</> legacy project from Daikoku environment".to_string());

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let url: String = format!("{}/api/cms", environment.server);

    let cookie = read_cookie_from_environment()?;

    let req = Request::builder()
        .method(Method::GET)
        .uri(&url)
        .header(header::HOST, &host)
        .header(header::COOKIE, format!("daikoku-session={}", cookie))
        .body(Empty::<Bytes>::new())
        .unwrap();

    let stream = TcpStream::connect(&host).await.map_err(|err| {
        DaikokuCliError::DaikokuErrorWithMessage("failed to join the server".to_string(), err)
    })?;
    let io = TokioIo::new(stream);

    let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
        .await
        .map_err(|err| DaikokuCliError::HyperError(err))?;

    tokio::task::spawn(async move {
        if let Err(err) = conn.await {
            logger::error(format!("Connection error {:?}", err));
        }
    });

    let upstream_resp = sender
        .send_request(req)
        .await
        .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?;

    let (
        hyper::http::response::Parts {
            headers: _, status, ..
        },
        body,
    ) = upstream_resp.into_parts();

    let status = status.as_u16();

    if status == 200 {
        let zip_bytes: Vec<u8> = frame_to_bytes_body(body).await;

        // let _ = extract_zip(zip_bytes, &name, &path);

        let items: Vec<CmsPage> = read_summary_file(zip_bytes)?;

        convert_cms_pages(
            items,
            PathBuf::from_str(&path)
                .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?
                .join(name),
        )?;

        create_project()?;

        Ok(())
    } else {
        Err(DaikokuCliError::DaikokuStrError(format!(
            "failed to reach the Daikoku server {}",
            status
        )))
    }
}

fn convert_cms_pages(items: Vec<CmsPage>, project_path: PathBuf) -> DaikokuResult<()> {
    items.iter().for_each(|item| {
        let _ = SourceExtension::from_str(&item.content_type).map(|extension| match extension {
            content_type @ SourceExtension::HTML => {
                create_html(item, content_type, project_path.clone())
            }
            SourceExtension::CSS => create_css_file(item, project_path.clone()),
            SourceExtension::Javascript => create_js_script(item, project_path.clone()),
            content_type @ SourceExtension::JSON => {
                create_date_file(item, content_type, project_path.clone())
            }
        });
    });

    Ok(())
}

fn create_date_file(
    item: &CmsPage,
    content_type: SourceExtension,
    project_path: PathBuf,
) -> DaikokuResult<()> {
    create_path_and_file(
        project_path
            .join("data")
            .join(format!("{}{}", item.name, content_type.ext())),
        item.content.clone(),
    )
}

fn create_js_script(item: &CmsPage, project_path: PathBuf) -> DaikokuResult<()> {
    create_path_and_file(
        project_path
            .join("scripts")
            .join(format!("{}{}", item.name, ".js")),
        item.content.clone(),
    )
}

fn create_css_file(item: &CmsPage, project_path: PathBuf) -> DaikokuResult<()> {
    create_path_and_file(
        project_path
            .join("styles")
            .join(format!("{}{}", item.name, ".css")),
        item.content.clone(),
    )
}

fn create_html(
    item: &CmsPage,
    content_type: SourceExtension,
    project_path: PathBuf,
) -> DaikokuResult<()> {
    let parent = item.path.clone().map(|_| "pages").unwrap_or("blocks");

    create_path_and_file(
        project_path
            .join(parent)
            .join(format!("{}{}", item.name, content_type.ext())),
        item.content.clone(),
    )
}

fn create_path_and_file(file_buf: PathBuf, content: String) -> DaikokuResult<()> {
    let parent =
        file_buf
            .parent()
            .map(|path| Ok(path))
            .unwrap_or(Err(DaikokuCliError::FileSystem(
                "failed to recursively create paths".to_string(),
            )))?;

    if !parent.exists() {
        fs::create_dir_all(parent).map_err(map_error_to_filesystem_error)?;
    }

    Ok(fs::write(file_buf, content).map_err(map_error_to_filesystem_error)?)
}

fn create_project() -> DaikokuResult<()> {
    Ok(())
}

fn read_summary_file(content: Vec<u8>) -> DaikokuResult<Vec<CmsPage>> {
    // let file_buf = PathBuf::from_str(&path)
    //     .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?
    //     .join(format!("{}-dev", name))
    //     .join("summary.json");

    // let content = fs::read_to_string(&file_buf).map_err(map_error_to_filesystem_error)?;

    let content = String::from_utf8(content).map_err(map_error_to_filesystem_error)?;

    let summary: Vec<CmsPage> =
        serde_json::from_str(&content).map_err(map_error_to_filesystem_error)?;

    Ok(summary)
}

// fn extract_zip(zip_bytes: Vec<u8>, name: &String, path: &String) -> DaikokuResult<()> {
//     let file_buf = PathBuf::from_str(&path)
//         .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?
//         .join(format!("{}.zip", name));

//     let file_path = file_buf
//         .clone()
//         .into_os_string()
//         .into_string()
//         .map_err(|_err| {
//             DaikokuCliError::FileSystem(String::from("failed to convert path buf to string"))
//         })?;

//     if file_path.split("/").count() > 2 {
//         let parent =
//             file_buf
//                 .parent()
//                 .map(|path| Ok(path))
//                 .unwrap_or(Err(DaikokuCliError::FileSystem(
//                     "failed to recursively create paths".to_string(),
//                 )))?;
//         fs::create_dir_all(parent).map_err(map_error_to_filesystem_error)?;
//     }

//     let mut file = fs::File::create(&file_path).map_err(map_error_to_filesystem_error)?;

//     file.write_all(&zip_bytes)
//         .map_err(map_error_to_filesystem_error)?;

//     zip_extensions::read::zip_extract(
//         &file_buf,
//         &PathBuf::from(&path).join(format!("{}-dev", &name)),
//     )
//     .map_err(map_error_to_filesystem_error)?;

//     Ok(())
// }

fn map_error_to_filesystem_error<T: std::error::Error>(err: T) -> DaikokuCliError {
    DaikokuCliError::FileSystem(err.to_string())
}
