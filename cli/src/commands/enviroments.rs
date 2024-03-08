use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    EnvironmentsCommands,
};
use bytes::Bytes;
use configparser::ini::Ini;
use http_body_util::Empty;
use hyper::{header, Method, Request};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
use tokio::net::TcpStream;

use super::projects;

#[derive(Deserialize, Serialize, Clone, Debug)]
pub(crate) struct Environment {
    pub(crate) server: String,
    pub(crate) token: Option<String>,
}

pub(crate) async fn run(command: EnvironmentsCommands) -> DaikokuResult<()> {
    match command {
        EnvironmentsCommands::Clear {} => clear(),
        EnvironmentsCommands::Add {
            name,
            server,
            token,
            overwrite,
        } => add(name, server, token, overwrite.unwrap_or(false)).await,
        EnvironmentsCommands::Default { name } => update_default(name),
        EnvironmentsCommands::Delete { name } => delete(name),
        EnvironmentsCommands::Env { name } => {
            let environment = get(name)?;
            logger::info(serde_json::to_string_pretty(&environment).unwrap());
            Ok(())
        }
        EnvironmentsCommands::List {} => list(),
        EnvironmentsCommands::PathDefault { token } => patch_default(token),
    }
}

fn get_path() -> DaikokuResult<String> {
    let project = projects::get_default_project()?;

    let environment_path = Path::new(&PathBuf::from(project.path))
        .join(".daikoku")
        .join(".environments")
        .into_os_string()
        .into_string();

    environment_path
        .map(Ok)
        .unwrap_or(Err(DaikokuCliError::Configuration(
            "failed to read environments file".to_string(),
        )))
}

fn read() -> DaikokuResult<Ini> {
    let mut config = Ini::new();

    match config.load(&get_path()?) {
        Ok(_) => Ok(config),
        Err(e) => Err(DaikokuCliError::Configuration(e.to_string())),
    }
}

fn set_content_file(content: &String) -> DaikokuResult<()> {
    std::fs::write(get_path()?, content).map_err(|err| DaikokuCliError::FileSystem(err.to_string()))
}

fn clear() -> DaikokuResult<()> {
    match set_content_file(&"".to_string()) {
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

pub(crate) async fn can_join_daikoku(server: &String) -> DaikokuResult<bool> {
    let host = server.replace("http://", "").replace("https://", "");

    let url: String = format!("{}/api/versions/_daikoku", server);

    let req = Request::builder()
        .method(Method::GET)
        .uri(&url)
        .header(header::HOST, &host)
        .body(Empty::<Bytes>::new())
        .unwrap();

    let stream = TcpStream::connect(&host)
        .await
        .map_err(|err| DaikokuCliError::DaikokuErrorWithMessage("failed to join the server".to_string(), err))?;
    let io = TokioIo::new(stream);

    let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
        .await
        .map_err(|err| DaikokuCliError::HyperError(err))?;

    tokio::task::spawn(async move {
        if let Err(err) = conn.await {
            println!("Connection error: {:?}", err);
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
        _body,
    ) = upstream_resp.into_parts();

    let status = status.as_u16();

    Ok(status == 200)
}

async fn add(name: String, server: String, token: Option<String>, overwrite: bool) -> DaikokuResult<()> {
    logger::loading("<yellow>Patching</> configuration".to_string());
    let mut config: Ini = read()?;

    let exists = config.get(&name, "server").is_some();

    if name.to_lowercase() == "default" {
        return Err(DaikokuCliError::Configuration(
            "forbidden keyword usage".to_string(),
        ));
    }

    if exists && !overwrite {
        return Err(DaikokuCliError::Configuration("configuration already exists. you maybe want to use --overwrite=true parameter to overwrite contents".to_string()));
    }

    if !can_join_daikoku(&server).await? {
        return Err(DaikokuCliError::Configuration(
            "failed to save configuration. The specified Daikoku server can not be reached"
                .to_string(),
        ));
    }

    config.set(&name, "server", Some(server));
    config.set(&name, "token", token);

    config.set("default", "environment", Some(name.clone()));

    match config.write(&get_path()?) {
        Ok(()) => {
            logger::println(if exists {
                "<green>Entry</> updated".to_string()
            } else {
                "<green>New entry</> added".to_string()
            });
            logger::info(serde_json::to_string_pretty(&get(name)?).unwrap());
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}

fn update_default(name: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Updating</> default environment".to_string());
    let mut config: Ini = read()?;

    if config.get(&name, "server").is_none() {
        return Err(DaikokuCliError::Configuration(
            "a non-existing section cannot be set as default".to_string(),
        ));
    }

    config.set("default", "environment", Some(name.clone()));

    match config.write(&get_path()?) {
        Ok(()) => {
            logger::println("<green>Defaut</> updated".to_string());
            let _ = get("default".to_string());
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}

fn patch_default(token: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Patching</> default environment".to_string());
    let mut config: Ini = read()?;

    match config.get("default", "environment") {
        None => {
            return Err(DaikokuCliError::Configuration(
                "no default environment is configured".to_string(),
            ))
        }
        Some(environment) => {
            config.set(&environment, "token", Some(token));

            match config.write(&get_path()?) {
                Ok(()) => {
                    logger::println("<green>Defaut</> updated".to_string());
                    let _ = get(environment);
                    Ok(())
                }
                Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
            }
        }
    }
}

pub(crate) fn read_cookie_from_environment() -> DaikokuResult<String> {
    let config: Ini = read()?;

    if let Some(environment) = config.get("default", "environment") {
        config
            .get(&environment, "token")
            .map(Ok)
            .unwrap_or(Err(DaikokuCliError::Configuration(
                "missing token on default environment".to_string(),
            )))
    } else {
        Err(DaikokuCliError::Configuration(
            "missing default environment".to_string(),
        ))
    }
}

fn delete(name: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Deleting</> environment".to_string());
    let mut config: Ini = read()?;

    if name.to_lowercase() == "default" {
        return Err(DaikokuCliError::Configuration(
            "protected environment cant be deleted".to_string(),
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

fn get(name: String) -> DaikokuResult<Environment> {
    let config: Ini = read()?;

    let values = config
        .get_map()
        .map(Ok)
        .unwrap_or(Err(DaikokuCliError::Configuration(
            "failed to access configuration file".to_string(),
        )))?;

    match values.get(&name) {
        Some(value) => serde_json::from_str(serde_json::to_string(&value).unwrap().as_str())
            .map(Ok)
            .unwrap_or(Err(DaikokuCliError::Configuration(
                "failed reading environment".to_string(),
            ))),
        None => Err(DaikokuCliError::Configuration(
            "enviromnment not found".to_string(),
        )),
    }
}

pub(crate) fn get_default_environment() -> DaikokuResult<Environment> {
    let config: Ini = read()?;

    let default_environment = config.get("default", "environment").map(Ok).unwrap_or(Err(
        DaikokuCliError::Configuration("default environment not found".to_string()),
    ))?;

    get(default_environment)
}

pub(crate) fn check_environment_from_str(name: Option<String>) -> DaikokuResult<Environment> {
    name
        .map(|project_name| get(project_name))
        .unwrap_or(get_default_environment())
}

fn list() -> DaikokuResult<()> {
    let config: Ini = read()?;

    let map = config.get_map().unwrap_or(HashMap::new());

    logger::info(serde_json::to_string_pretty(&map).unwrap());

    Ok(())
}
