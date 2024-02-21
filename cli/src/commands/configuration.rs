use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    ConfigCommands,
};
use configparser::ini::{Ini, WriteOptions};
use std::{collections::HashMap, io, path::Path};

// TODO - provider a way to save and get the path to the CMS project

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
        ConfigCommands::Get { name } => get(name),
        ConfigCommands::Use { name } => use_configuration(name),
    }
}

fn get_path() -> String {
    Path::new("./cms/.daikoku/.environments")
        .to_path_buf()
        .into_os_string()
        .into_string()
        .unwrap()
}

fn set_content_file(content: &String) -> Result<(), io::Error> {
    std::fs::write(get_path(), content)
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

fn read() -> DaikokuResult<Ini> {
    let mut config = Ini::new();

    match config.load(&get_path()) {
        Ok(_) => Ok(config),
        Err(e) => Err(DaikokuCliError::Configuration(e.to_string())),
    }
}

fn add(
    name: String,
    server: Option<String>,
    secured: Option<bool>,
    apikey: String,
    overwrite: bool,
) -> DaikokuResult<()> {
    logger::loading("<yellow>Patching</> configuration".to_string());
    let mut config: Ini = read()?;

    let exists = config.get(&name, "server").is_some();

    if name.to_lowercase() == "default" {
        return Err(DaikokuCliError::Configuration("forbidden keyword usage".to_string()));
    }

    if exists && !overwrite {
        return Err(DaikokuCliError::Configuration("configuration already exists. use the --overwrite=true parameter to override the contets".to_string()));
    }

    config.set(&name, "server", server);
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

    match config.write(&get_path()) {
        Ok(()) => {
            logger::println(if exists {
                "<green>Entry</> updated".to_string()
            } else {
                "<green>New entry</> added".to_string()
            });
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}

fn update_default(name: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Updating</> default environment".to_string());
    let mut config: Ini = read()?;

    if config.get(&name, "server").is_none() {
        return Err(DaikokuCliError::Configuration("a non-existing section cannot be set as default".to_string()))
    }
    
    config.set("default", "environment", Some(name));

    match config.write(&get_path()) {
        Ok(()) => {
            logger::println("<green>Defaut</> updated".to_string());
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}
fn delete(name: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Deleting</> environment".to_string());
    let mut config: Ini = read()?;

    if name.to_lowercase() == "default" {
        return Err(DaikokuCliError::Configuration("protected environment cant be deleted".to_string()));
    }
    
    if config.remove_section(&name).is_none() {
        return Err(DaikokuCliError::Configuration("a non-existing section cannot be delete".to_string()))
    };

    match config.write(&get_path()) {
        Ok(()) => {
            logger::println(format!("<green>{}</> deleted", &name));
            Ok(())
        }
        Err(err) => Err(DaikokuCliError::Configuration(err.to_string())),
    }
}
fn get(name: String) -> DaikokuResult<()> {
    todo!()
}
fn use_configuration(name: String) -> DaikokuResult<()> {
    todo!()
}

// pub(crate) fn get_sources_root() -> Option<String> {
//     if let Ok(values) = read_configuration() {
//         Some(
//             values
//                 .get("DAIKOKU_PATH")
//                 .map(|p| p.clone())
//                 .unwrap_or("./cms".to_string()),
//         )
//     } else {
//         None
//     }
// }

// pub(crate) fn read_configuration() -> DaikokuResult<HashMap<String, String>> {
//     let client_id = option_env!("DAIKOKU_CLIENT_ID");
//     let client_secret = option_env!("DAIKOKU_CLIENT_SECRET");
//     let server = option_env!("DAIKOKU_SERVER");

//     let envs: HashMap<String, String> =
//         if server.is_none() || client_id.is_none() || client_secret.is_none() {
//             let configuration_path: PathBuf = match option_env!("DAIKOKU_PATH") {
//                 Some(path) => Path::new(path).to_path_buf(),
//                 None => get_home().unwrap(),
//             };

//             let envs = configuration_file_to_hashmap(&configuration_path.join(".daikoku"));

//             match envs.get("DAIKOKU_PATH") {
//                 Some(p) if !p.is_empty() => {
//                     configuration_file_to_hashmap(&Path::new(p).join(".daikoku"))
//                 }
//                 _ => envs,
//             }
//         } else {
//             let mut envs: HashMap<String, String> = HashMap::new();
//             envs.insert(DAIKOKU_SERVER.to_owned(), server.unwrap().to_owned());
//             envs.insert(DAIKOKU_CLIENT_ID.to_owned(), client_id.unwrap().to_owned());
//             envs.insert(
//                 DAIKOKU_CLIENT_SECRET.to_owned(),
//                 client_secret.unwrap().to_owned(),
//             );
//             envs.insert(DAIKOKU_PATH.to_owned(), get_option_home());
//             envs
//         };

//     Ok(envs)
// }

// fn reset_configuration() -> DaikokuResult<()> {
//     logger::loading("<yellow>Reset</> configuration".to_string());
//     let home_path = get_home()?;

//     let complete_path = home_path.join(".daikoku");

//     let _ = fs::remove_file(complete_path);

//     logger::check_loading();
//     logger::success(format!("<green>wasmo configuration has been reset</>"));
//     Ok(())
// }

// fn set_configuration(
//     server: Option<String>,
//     path: Option<String>,
//     client_id: Option<String>,
//     client_secret: Option<String>,
// ) -> DaikokuResult<()> {
//     if client_id.is_none() && client_secret.is_none() && server.is_none() && path.is_none() {
//         return Err(DaikokuCliError::Configuration(
//             "missing client_id, client_secret or path keys".to_string(),
//         ));
//     }

//     let home_path = get_home()?;

//     let complete_path = match &path {
//         Some(p) => Path::new(p).join(".daikoku"),
//         None => home_path.join(".daikoku"),
//     };

//     let contents = match std::path::Path::new(&complete_path).exists() {
//         false => {
//             if path.is_some() {
//                 let _ = fs::create_dir(&path.as_ref().unwrap());
//             }
//             format(None)
//         }
//         true => configuration_file_to_hashmap(&complete_path),
//     };

//     let client_id = extract_variable_or_default(&contents, DAIKOKU_CLIENT_ID, client_id);
//     let client_secret =
//         extract_variable_or_default(&contents, DAIKOKU_CLIENT_SECRET, client_secret);
//     let server = extract_variable_or_default(&contents, DAIKOKU_SERVER, server);
//     let daikoku_path = extract_variable_or_default(&contents, "DAIKOKU_PATH", path.clone());

//     if DAIKOKU_PATH.eq("") {
//         let new_content = format!(
//             "DAIKOKU_SERVER={}\nDAIKOKU_CLIENT_ID={}\nDAIKOKU_CLIENT_SECRET={}",
//             server, client_id, client_secret
//         );

//         match fs::write(home_path.join(".daikoku"), new_content) {
//             Ok(()) => logger::println(format!("wasmo configuration patched")),
//             Err(e) => panic!(
//                 "Should have been able to write the wasmo configuration, {:#?}",
//                 e
//             ),
//         }
//     } else {
//         let content_at_path = format!(
//             "DAIKOKU_SERVER={}\nDAIKOKU_PATH={}\nDAIKOKU_CLIENT_ID={}\nDAIKOKU_CLIENT_SECRET={}",
//             server, daikoku_path, client_id, client_secret
//         );
//         let content_at_default_path = format!("DAIKOKU_PATH={}", daikoku_path);

//         let home_file = home_path.join(".daikoku");

//         // println!("Write in home {} - {}", format!("{}/.daikoku", &home_path), content_at_default_path);
//         let _ = fs::remove_file(&home_file);
//         match fs::write(&home_file, &content_at_default_path) {
//             Ok(()) => (),
//             Err(e) => panic!(
//                 "Should have been able to write the wasmo configuration, {:#?}",
//                 e
//             ),
//         }

//         let project_file = match &path {
//             Some(p) => Path::new(p).join(".daikoku"),
//             None => match daikoku_path.is_empty() {
//                 true => home_path.join(".daikoku"),
//                 false => Path::new(&daikoku_path).join(".daikoku"),
//             },
//         }
//         .to_string_lossy()
//         .to_string()
//         .replace(".daikoku.daikoku", ".daikoku"); // guard

//         // println!("Write inside project, {} - {:#?}", project_file, content_at_path);
//         let _ = fs::remove_file(&project_file);
//         match fs::write(project_file, &content_at_path) {
//             Ok(()) => (),
//             Err(e) => panic!(
//                 "Should have been able to write the wasmo configuration, {:#?}",
//                 e
//             ),
//         }

//         logger::println(format!("wasmo configuration patched"))
//     }

//     Ok(())
// }

// fn configuration_file_to_hashmap(configuration_path: &PathBuf) -> HashMap<String, String> {
//     let complete_path = if configuration_path.ends_with(".daikoku") {
//         configuration_path.clone()
//     } else {
//         Path::new(configuration_path).join(".daikoku")
//     };

//     match std::path::Path::new(&complete_path).exists() {
//         false => HashMap::new(),
//         true => format(Some(match fs::read_to_string(&complete_path) {
//             Ok(content) => content,
//             Err(_) => String::new(),
//         })),
//     }
// }

// fn format(str: Option<String>) -> std::collections::HashMap<String, String> {
//     match str {
//         None => std::collections::HashMap::new(),
//         Some(str) => str
//             .split("\n")
//             .map(|x| {
//                 let mut parts = x.splitn(2, "=");
//                 (
//                     parts.next().unwrap_or("").to_string(),
//                     parts.next().unwrap_or("").to_string(),
//                 )
//             })
//             .into_iter()
//             .collect(),
//     }
// }

// fn extract_variable_or_default(
//     contents: &std::collections::HashMap<String, String>,
//     key: &str,
//     default_value: Option<String>,
// ) -> String {
//     let default = default_value.clone().unwrap_or("".to_string());

//     match contents.get(key) {
//         Some(v) => match v.is_empty() {
//             true => default,
//             false => default_value.unwrap_or(v.to_string()),
//         },
//         None => default,
//     }
// }
