use crate::{
    helpers::{daikoku_cms_api_get, raw_daikoku_cms_api_get},
    interactive::prompt,
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    utils::apply_credentials_mask,
    EnvironmentsCommands,
};
use configparser::ini::Ini;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use super::cms;

#[derive(Deserialize, Serialize, Clone, Debug)]
pub(crate) struct Environment {
    pub(crate) server: String,
    pub(crate) cookie: Option<String>,
    pub(crate) apikey: Option<String>,
    pub(crate) name: String,
}

pub(crate) async fn run(command: EnvironmentsCommands) -> DaikokuResult<()> {
    match command {
        EnvironmentsCommands::Clear {} => clear(),
        EnvironmentsCommands::Add {
            name,
            server,
            overwrite,
            apikey,
        } => add(name, server, overwrite.unwrap_or(false), apikey).await,
        EnvironmentsCommands::Switch { name } => switch_environment(name),
        EnvironmentsCommands::Remove { name } => remove(name),
        EnvironmentsCommands::Info { name, full } => info(name, full.unwrap_or(false)),
        EnvironmentsCommands::List {} => list(),
        EnvironmentsCommands::Config { apikey, cookie } => configure(apikey, cookie).await,
    }
}

fn get_environments_path() -> DaikokuResult<String> {
    get_hidden_file(
        ".environments".to_string(),
        "failed to read environments file".to_string(),
    )
}

fn get_hidden_file(name: String, error_message: String) -> DaikokuResult<String> {
    let project = cms::get_default_project()?;

    let path = Path::new(&PathBuf::from(project.path))
        .join(".daikoku")
        .join(name)
        .into_os_string()
        .into_string();

    path.map(Ok)
        .unwrap_or(Err(DaikokuCliError::Configuration(error_message)))
}

fn get_secrets_path() -> DaikokuResult<String> {
    get_hidden_file(
        ".secrets".to_string(),
        "failed to read secrets file".to_string(),
    )
}

fn read_environments() -> DaikokuResult<Ini> {
    let mut config = Ini::new();

    match config.load(&get_environments_path()?) {
        Ok(_) => Ok(config),
        Err(e) => Err(DaikokuCliError::Configuration(e.to_string())),
    }
}

fn read_secrets() -> DaikokuResult<Ini> {
    let mut config = Ini::new();

    match config.load(&get_secrets_path()?) {
        Ok(_) => Ok(config),
        Err(e) => Err(DaikokuCliError::Configuration(e.to_string())),
    }
}

fn set_content_file(content: &String) -> DaikokuResult<()> {
    std::fs::write(get_environments_path()?, content)
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))
}

fn clear() -> DaikokuResult<()> {
    logger::error("Are you to delete all environments ? [yN]".to_string());

    let choice = prompt()?;

    if choice.trim() == "y" {
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
    } else {
        Ok(())
    }
}

pub(crate) async fn can_join_daikoku(
    server: &String,
    apikey: Option<&String>,
) -> DaikokuResult<bool> {
    let host = server.replace("http://", "").replace("https://", "");

    let url: String = format!("{}/health", host);

    let status = match apikey {
        None => daikoku_cms_api_get(&url).await?.status,
        Some(apikey) => {
            raw_daikoku_cms_api_get("/health", &server.clone(), &apikey)
                .await?
                .status
        }
    };

    logger::println(format!("Daikoku have returned : {}", status));

    Ok(status == 200)
}

async fn add(name: String, server: String, overwrite: bool, apikey: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Patching</> configuration".to_string());
    let mut config: Ini = read_environments()?;

    if name.to_lowercase() == "default" {
        return Err(DaikokuCliError::Configuration(
            "forbidden keyword usage".to_string(),
        ));
    }

    let exists = config.get(&name, "server").is_some();

    if exists && !overwrite {
        return Err(DaikokuCliError::Configuration("configuration already exists. you maybe want to use --overwrite=true parameter to overwrite contents".to_string()));
    }

    if !can_join_daikoku(&server, Some(&apikey)).await? {
        return Err(DaikokuCliError::Configuration(
            "failed to save configuration. The specified Daikoku server can not be reached"
                .to_string(),
        ));
    }

    config.set(&name, "server", Some(server));
    config.set("default", "environment", Some(name.clone()));
    config.set(name.clone().as_str(), "name", Some(name.clone()));

    let mut secrets: Ini = read_secrets()?;
    secrets.set(name.clone().as_str(), "apikey", Some(apikey));

    secrets
        .write(&get_secrets_path()?)
        .map_err(|err| DaikokuCliError::DaikokuError(err))?;

    match config.write(&get_environments_path()?) {
        Ok(()) => {
            logger::println(if exists {
                "<green>Entry</> updated".to_string()
            } else {
                "<green>New entry</> added".to_string()
            });
            // logger::info(serde_json::to_string_pretty(&get(name)?).unwrap());
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}

fn switch_environment(name: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Switch</> of default environment".to_string());
    let mut config: Ini = read_environments()?;

    if config.get(&name, "server").is_none() {
        return Err(DaikokuCliError::Configuration(
            "a non-existing section cannot be set as default".to_string(),
        ));
    }

    config.set("default", "environment", Some(name.clone()));

    match config.write(&get_environments_path()?) {
        Ok(()) => {
            logger::println("<green>Defaut</> updated".to_string());
            let _ = get("default".to_string());
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}

async fn configure(apikey: Option<String>, cookie: Option<String>) -> DaikokuResult<()> {
    logger::loading("<yellow>Updating</> default environment".to_string());

    let environment = get_default_environment()?;

    let mut config: Ini = read_secrets()?;

    if let Some(new_apikey) = apikey {
        config.set(&environment.name, "apikey", Some(new_apikey.clone()));

        if !can_join_daikoku(&environment.server, Some(&new_apikey)).await? {
            return Err(DaikokuCliError::Configuration(
                "failed to save configuration. The specified Daikoku server can not be reached"
                    .to_string(),
            ));
        }

        match config.write(&get_secrets_path()?) {
            Ok(()) => {
                logger::println("<green>apikey</> updated".to_string());
            }
            Err(err) => return Err(DaikokuCliError::Configuration(err.to_string())),
        }
    }

    if let Some(new_cookie) = cookie {
        config.set(&environment.name, "cookie", Some(new_cookie.clone()));

        match config.write(&get_secrets_path()?) {
            Ok(()) => {
                logger::println("<green>cookie</> updated".to_string());
            }
            Err(err) => return Err(DaikokuCliError::Configuration(err.to_string())),
        }
    }

    Ok(())
}

pub(crate) fn format_cookie(str: String) -> String {
    if str.starts_with("daikoku-session=") {
        str.to_string()
    } else {
        format!("daikoku-session={}", str)
    }
}

pub(crate) fn read_cookie_from_environment(failed_if_not_present: bool) -> DaikokuResult<String> {
    let config: Ini = read_environments()?;

    if let Some(environment) = config.get("default", "environment") {
        let secrets: Ini = read_secrets()?;
        secrets
            .get(&environment, "cookie")
            .map(|cookie| Ok(format_cookie(cookie)))
            .unwrap_or(if failed_if_not_present {
                Err(DaikokuCliError::Configuration(
                    "Missing cookie on default environment. Run daikoku login".to_string(),
                ))
            } else {
                Ok("".to_string())
            })
    } else {
        Err(DaikokuCliError::Configuration(
            "missing default environment".to_string(),
        ))
    }
}

pub(crate) fn read_apikey_from_secrets(failed_if_not_present: bool) -> DaikokuResult<String> {
    let config: Ini = read_environments()?;

    if let Some(environment) = config.get("default", "environment") {
        let secrets: Ini = read_secrets()?;
        secrets
            .get(&environment, "apikey")
            .map(Ok)
            .unwrap_or(if failed_if_not_present {
                Err(DaikokuCliError::Configuration(
                    "Missing apikey on default environment. Run daikoku environments configure --apikey=<> with the apikey paste from your Daikoku CMS API".to_string(),
                ))
            } else {
                Ok("".to_string())
            })
    } else {
        Err(DaikokuCliError::Configuration(
            "missing default environment".to_string(),
        ))
    }
}

fn info(name: String, show_full_credentials: bool) -> DaikokuResult<()> {
    let mut environment = get(name)?;

    let secrets = read_secrets()?;

    environment.apikey = secrets
        .get(&environment.name, "apikey")
        .map(|credential| apply_credentials_mask(&credential, show_full_credentials));
    environment.cookie = secrets
        .get(&environment.name, "cookie")
        .map(|credential| apply_credentials_mask(&credential, show_full_credentials));

    logger::info(serde_json::to_string_pretty(&environment).unwrap());
    Ok(())
}

fn remove(name: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Deleting</> environment".to_string());
    let mut config: Ini = read_environments()?;

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

    let mut secrets: Ini = read_secrets()?;
    secrets.remove_section(&name);

    match (
        config.write(&get_environments_path()?),
        secrets.write(&get_secrets_path()?),
    ) {
        (Ok(()), Ok(())) => {
            logger::println(format!("<green>{}</> deleted", &name));
            Ok(())
        }
        _ => Err(DaikokuCliError::Configuration(
            "failed to update environments and secrets files".to_string(),
        )),
    }
}

fn get(name: String) -> DaikokuResult<Environment> {
    let config: Ini = read_environments()?;

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
    let config: Ini = read_environments()?;

    let default_environment = config.get("default", "environment").map(Ok).unwrap_or(Err(
        DaikokuCliError::Configuration(
            "default environment not found. see daikoku environments help".to_string(),
        ),
    ))?;

    get(default_environment)
}

pub(crate) fn check_environment_from_str(name: Option<String>) -> DaikokuResult<Environment> {
    name.map(|project_name| get(project_name))
        .unwrap_or(get_default_environment())
}

fn list() -> DaikokuResult<()> {
    let config: Ini = read_environments()?;

    let map = config.get_map().unwrap_or(HashMap::new());

    logger::info(serde_json::to_string_pretty(&map).unwrap());

    Ok(())
}

pub(crate) fn get_daikokuignore() -> DaikokuResult<Vec<String>> {
    let project = cms::get_default_project()?;

    let daikokuignore_path = Path::new(&PathBuf::from(project.path))
        .join(".daikoku")
        .join(".daikokuignore")
        .into_os_string()
        .into_string();

    match daikokuignore_path {
        Ok(path) => {
            let content = fs::read_to_string(path)
                .map_err(|err| DaikokuCliError::Configuration(err.to_string()))?;

            Ok(content
                .split("\n")
                .map(|str| str.to_string())
                .collect::<Vec<String>>())
        }
        Err(_) => Ok(Vec::new()),
    }
}
