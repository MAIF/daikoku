use std::{collections::HashMap, path::PathBuf};

use configparser::ini::Ini;

use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    utils::absolute_path,
    ProjectCommands,
};

pub(crate) struct Project {
    pub(crate)path: String,
    pub(crate)name: String,
}

pub(crate) fn run(command: ProjectCommands) -> DaikokuResult<()> {
    match command {
        ProjectCommands::Add {
            name,
            path,
            overwrite,
        } => add(name, absolute_path(path), overwrite.unwrap_or(false)),
        ProjectCommands::Default { name } => update_default(name),
        ProjectCommands::Delete { name } => delete(name),
        ProjectCommands::List {} => list(),
    }
}

pub(crate) fn get_default_project() -> DaikokuResult<Project> {
    let config = read(false)?;

    let missing_error = DaikokuCliError::Configuration(
        "missing default project or values in project. Use project default --name<YOUR_PROJECT>"
            .to_string(),
    );

    let default_project_name = config.get("default", "project").ok_or(missing_error)?;

    let project = config
        .get_map()
        .map(|m| m[&default_project_name])
        .ok_or(missing_error)?;

    match (project["name"], project["path"]) {
        (Some(name), Some(path)) => Ok(Project { name, path }),
        (_, _) => Err(missing_error),
    }
}

fn add(name: String, path: String, overwrite: bool) -> DaikokuResult<()> {
    logger::loading("<yellow>Initialize</> path to project ...".to_string());

    let mut config: Ini = read(false)?;

    if config.get(&name, "path").is_some() && !overwrite {
        return Err(DaikokuCliError::Configuration(
            "project already exists".to_string(),
        ));
    }

    config.set(&name, "path", Some(path));
    config.set(&name, "name", Some(name.clone()));
    config.set("default", "project", Some(name.clone()));

    match config.write(&get_path()?) {
        Ok(()) => {
            logger::println("<green>New entry</> added".to_string());
            let _ = get(name);
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
            let _ = get("default".to_string());
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}

fn get(name: String) -> DaikokuResult<()> {
    let config: Ini = read(false)?;

    let values = config
        .get_map()
        .map(Ok)
        .unwrap_or(Err(DaikokuCliError::Configuration(
            "failed to access projects file".to_string(),
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
