use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use configparser::ini::Ini;

use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    utils::absolute_path,
    ProjectCommands,
};

#[derive(Clone)]
pub(crate) struct Project {
    pub(crate) path: String,
    // name: String,
}

pub(crate) fn run(command: ProjectCommands) -> DaikokuResult<()> {
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