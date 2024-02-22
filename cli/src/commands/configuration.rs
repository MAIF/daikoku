use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    ConfigCommands,
};
use configparser::ini::Ini;
use std::{
    io,
    path::{Path, PathBuf},
};

use super::projects;

pub(crate) fn run(command: ConfigCommands) -> DaikokuResult<()> {
    match command {
        ConfigCommands::Clear {} => clear(),
        ConfigCommands::Add {
            name,
            server,
            secured,
            apikey,
            overwrite,
        } => add(name, server, secured, apikey, overwrite.unwrap_or(false)),
        ConfigCommands::Default { name } => update_default(name),
        ConfigCommands::Delete { name } => delete(name),
        ConfigCommands::Env { name } => get(name),
        ConfigCommands::List {} => list(),
    }
}

fn get_path() -> DaikokuResult<String> {
    let project = projects::get_default_project()?;

    Ok(Path::new(&PathBuf::from(project.path))
        .join(".daikoku")
        .join(".environments")
        .into_os_string()
        .into_string()
        .unwrap())
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

fn add(
    name: String,
    server: String,
    secured: Option<bool>,
    apikey: String,
    overwrite: bool,
) -> DaikokuResult<()> {
    logger::loading("<yellow>Patching</> configuration".to_string());
    let mut config: Ini = read()?;

    let exists = config.get(&name, "server").is_some();

    if name.to_lowercase() == "default" {
        return Err(DaikokuCliError::Configuration(
            "forbidden keyword usage".to_string(),
        ));
    }

    if exists && !overwrite {
        return Err(DaikokuCliError::Configuration("configuration already exists. use the --overwrite=true parameter to override the contets".to_string()));
    }

    config.set(&name, "server", Some(server));
    config.set(
        &name,
        "secured",
        Some(
            secured
                .map(|p| p.to_string())
                .unwrap_or("false".to_string()),
        ),
    );
    config.set(&name, "apikey", Some(apikey));

    match config.write(&get_path()?) {
        Ok(()) => {
            logger::println(if exists {
                "<green>Entry</> updated".to_string()
            } else {
                "<green>New entry</> added".to_string()
            });
            let _ = get(name);
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

fn get(name: String) -> DaikokuResult<()> {
    let config: Ini = read()?;

    let values = config
        .get_map()
        .map(Ok)
        .unwrap_or(Err(DaikokuCliError::Configuration(
            "failed to access configuration file".to_string(),
        )))?;

    match values.get(&name) {
        Some(value) => {
            logger::info(serde_json::to_string_pretty(&value).unwrap());
            Ok(())
        }
        None => Err(DaikokuCliError::Configuration(
            "failed to access value".to_string(),
        )),
    }
}

fn list() -> DaikokuResult<()> {
    let config: Ini = read()?;

    let map = config
        .get_map()
        .map(Ok)
        .unwrap_or(Err(DaikokuCliError::Configuration(
            "failed to access configuration file".to_string(),
        )))?;

    logger::info(serde_json::to_string_pretty(&map).unwrap());

    Ok(())
}
