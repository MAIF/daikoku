mod plugin;
mod error;
mod logger;
mod watch;

use base64::{engine::general_purpose, Engine as _};
use clap::{Parser, Subcommand};
use error::{DaikokuCliError, WasmoResult};
use hyper_tls::HttpsConnector;
use core::panic;
// use hyper::{Body, Client, Method, Request};
// use serde::Deserialize;
use std::{
    collections::HashMap,
    fs::{self, File},
    io::Write,
    path::{PathBuf, Path}, str::FromStr,
};

use dirs;

const DAIKOKU_SERVER: &str = "DAIKOKU_SERVER";
const DAIKOKU_CLIENT_ID: &str = "DAIKOKU_CLIENT_ID";
const DAIKOKU_CLIENT_SECRET: &str = "DAIKOKU_CLIENT_SECRET";
const DAIKOKU_PATH: &str = "DAIKOKU_PATH";

const ZIP_CMS: &[u8] = include_bytes!("../templates/empty.zip");

/// A fictional versioning CLI
#[derive(Debug, Parser)] // requires `derive` feature
#[command(name = "daikokucli")]
#[command(about = "Daikoku CLI", long_about = None, version = env!("CARGO_PKG_VERSION"))]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// get installed version
    Version {},
    /// Initialize a cms folder
    #[command()]
    Init {
        /// The template to clone
        #[arg(
            value_name = "TEMPLATE", 
            short = 't',
            long = "template",
            value_parser = ["empty"], 
            require_equals = true, 
        )]
        template: Option<String>,
        /// The plugin name
        #[arg(
            value_name = "NAME", 
            short = 'n',
            long = "name",
            required = false
        )]
        name: String,
        /// The path where initialize the plugin
        #[arg(
            value_name = "PATH", 
            short = 'p',
            long = "path",
            required = false
        )]
        path: Option<String>,
    },
    /// 
    #[command()]
    Watch {
        /// The remote to target
        #[arg(
            value_name = "PATH", 
            short = 'p',
            long = "path",
            required = false
        )]
        path: Option<String>,
        /// The server to build
        #[arg(
            value_name = "SERVER", 
            short = 's',
            long = "server",
            required = false
        )]
        server: Option<String>,
        /// client id
        #[arg(
            value_name = "CLIENT_ID", 
            long = "clientId",
            required = false
        )]
        client_id: Option<String>,
        /// client secret
        #[arg(
            value_name = "CLIENT_SECRET", 
            long = "clientSecret",
            required = false
        )]
        client_secret: Option<String>,
    },
    /// Globally configure the CLI with the path where the configuration file will be stored and the server to reach during the build. These parameters are optional and can be passed when running the build command.
    Config {
        #[command(subcommand)]
        command: ConfigCommands,
    },
}

#[derive(Debug, Subcommand)]
enum ConfigCommands {
    Reset {},
    Set {
        /// The path to the configuration folder
        #[arg(
            value_name = "PATH", 
            short = 'p',
            long = "path",
            help = "The path to the configuration folder",
            required = false

        )]
        path: Option<String>,
        /// The remote server to build your plugins
        #[arg(
            value_name = "SERVER", 
            short = 's',
            long = "server",
            help = "The remote server to build your plugins",
            required = false
        )]
        server: Option<String>,
        /// client id
        #[arg(
            value_name = "CLIENT_ID", 
            long = "clientId",
            required = false
        )]
        client_id: Option<String>,
        /// client secret
        #[arg(
            value_name = "CLIENT_SECRET", 
            long = "clientSecret",
            required = false
        )]
        client_secret: Option<String>,
    },
    Get {},
}

fn rename_plugin(template: String, name: String, path: Option<String>) -> WasmoResult<()> {
    let complete_path = match &path {
        Some(p) => Path::new(p).join(&name),
        None => Path::new("./").join(&name),
    };

    let _ = match &path {
        Some(p) => fs::create_dir_all(p),
        None => Result::Ok(()),
    };

    let manifest_dir = std::env::temp_dir();

    logger::indent_println(format!("<yellow>Write</> plugin from {} to {}", 
        &Path::new(&manifest_dir).join(format!("{}", template)).to_string_lossy(),
        &complete_path.to_string_lossy()));

    match std::fs::rename(Path::new(&manifest_dir).join(format!("{}", template)), &complete_path) {
        Ok(()) => {
            // update_metadata_file(&complete_path, &name, &template)?;
            logger::println("<green>Plugin created</>".to_string());
            Ok(())
        },
        Err(e) => Err(DaikokuCliError::PluginCreationFailed(format!("\n{}", e.to_string())))
    }
}

// fn update_metadata_file(path: &PathBuf, name: &String, template: &String) -> WasmoResult<()> {
//     let metadata_file = match template.as_str() {
//         "go" => "go.mod",
//         "rust" => "cargo.toml",
//         _ => "package.json"
//     };

//     let complete_path = path.join(metadata_file);

//     let content = match fs::read_to_string(&complete_path) {
//         Err(err) => return Err(DaikokuCliError::FileSystem(err.to_string())),
//         Ok(v) => v
//     };

//     match fs::write(&complete_path, content.replace("@@PLUGIN_NAME@@", name).replace("@@PLUGIN_VERSION@@", "1.0.0")) {
//         Err(err) => Err(DaikokuCliError::FileSystem(err.to_string())),
//         Ok(()) => Ok(())
//     }
// }

fn initialize(template: Option<String>, name: String, path: Option<String>) -> WasmoResult<()> {
    logger::loading("<yellow>Creating</> plugin ...".to_string());

    let manifest_dir = std::env::temp_dir();

    let template = template.unwrap_or("empty".to_string());

    let zip_bytes = match template.as_str() {
        _ => ZIP_CMS
    };
    let zip_path = Path::new(&manifest_dir).join(format!("{}.zip", template));

    match std::path::Path::new(&zip_path).exists() {
        true => (),
        false => {
            logger::indent_println(format!("turn template bytes to zip file, {}", &zip_path.to_string_lossy()));
            match fs::File::create(&zip_path) {
                Ok(mut file) => match file.write_all(zip_bytes) {
                    Err(err) => return Err(DaikokuCliError::FileSystem(err.to_string())),
                    Ok(()) => ()
                },
                Err(e) => return Err(DaikokuCliError::FileSystem(e.to_string()))
            };
        }
    }

    logger::indent_println("<yellow>Unzipping</> the template ...".to_string());
    let zip_action = zip_extensions::read::zip_extract(
        &PathBuf::from(zip_path),
        &manifest_dir,
    );

    match zip_action {
        Ok(()) => rename_plugin(template, name, path),
        Err(er) => Err(DaikokuCliError::FileSystem(er.to_string())),
    }
}

async fn watch(path: Option<String>, server: Option<String>, client_id: Option<String>, client_secret: Option<String>) -> WasmoResult<()> {
    let _ = watch::watching().await;

    Ok(())
}

fn extract_variable_or_default(
    contents: &std::collections::HashMap<String, String>,
    key: &str,
    default_value: Option<String>,
) -> String {
    let default = default_value.clone().unwrap_or("".to_string());

    match contents.get(key) {
        Some(v) => match v.is_empty() {
            true => default,
            false => default_value.unwrap_or(v.to_string()),
        },
        None => default,
    }
}

fn format(str: Option<String>) -> std::collections::HashMap<String, String> {
    match str {
        None => std::collections::HashMap::new(),
        Some(str) => str
            .split("\n")
            .map(|x| {
                let mut parts = x.splitn(2, "=");
                (
                    parts.next().unwrap_or("").to_string(),
                    parts.next().unwrap_or("").to_string(),
                )
            })
            .into_iter()
            .collect(),
    }
}

fn configuration_file_to_hashmap(configuration_path: &PathBuf) -> HashMap<String, String> {
    let complete_path = if configuration_path.ends_with(".daikoku") {
        configuration_path.clone()
    } else {
        Path::new(configuration_path).join(".daikoku")
    };

    match std::path::Path::new(&complete_path).exists() {
        false => HashMap::new(),
        true => format(Some(match fs::read_to_string(&complete_path) {
            Ok(content) => content,
            Err(_) => String::new()
        })),
    }
}

fn read_configuration() -> WasmoResult<HashMap<String, String>> {
    let client_id = option_env!("DAIKOKU_CLIENT_ID");
    let client_secret = option_env!("DAIKOKU_CLIENT_SECRET");
    let server = option_env!("DAIKOKU_SERVER");

    let envs: HashMap<String, String> = if server.is_none() || client_id.is_none() || client_secret.is_none() {
        let configuration_path: PathBuf = match option_env!("DAIKOKU_PATH") {
            Some(path) => Path::new(path).to_path_buf(),
            None => get_home().unwrap(),
        };

        let envs = configuration_file_to_hashmap(&configuration_path.join(".daikoku"));

        match envs.get("DAIKOKU_PATH") {
            Some(p) if !p.is_empty() => configuration_file_to_hashmap(&Path::new(p).join(".daikoku")),
            _ => envs,
        }
    } else {
        let mut envs: HashMap<String, String> = HashMap::new();
        envs.insert(DAIKOKU_SERVER.to_owned(), server.unwrap().to_owned());
        envs.insert(DAIKOKU_CLIENT_ID.to_owned(), client_id.unwrap().to_owned());
        envs.insert(DAIKOKU_CLIENT_SECRET.to_owned(), client_secret.unwrap().to_owned());
        envs.insert(DAIKOKU_PATH.to_owned(), get_option_home());
        envs
    };

    Ok(envs)
}


fn get_current_working_dir() -> WasmoResult<String> {
    match std::env::current_dir() {
        Ok(x) => Ok(x.into_os_string().into_string().unwrap()),
        Err(e) => Err(DaikokuCliError::FileSystem(format!("Should be able to read the current directory, {}", e))),
    }
}

fn reset_configuration() -> WasmoResult<()> {
    logger::loading("<yellow>Reset</> configuration".to_string());
    let home_path = get_home()?;

    let complete_path = home_path.join(".daikoku");

    let _ = fs::remove_file(complete_path);

    logger::check_loading();
    logger::success(format!("<green>wasmo configuration has been reset</>"));
    Ok(())
}

fn get_option_home() -> String {
    match dirs::home_dir() {
        Some(p) => p.into_os_string().into_string().unwrap(),
        None => "".to_owned(),
    }
}

fn get_home() -> WasmoResult<PathBuf> {
    match dirs::home_dir() {
        Some(p) => Ok(p),
        None => Err(DaikokuCliError::FileSystem(format!("Impossible to get your home dir!"))),
    }
}

fn absolute_path(path: String) -> String {
    match expand_tilde(&path) {
        None => fs::canonicalize(path).unwrap().into_os_string().into_string().unwrap(),
        Some(path) => match fs::canonicalize(path) {
            Ok(res) => res.into_os_string().into_string().unwrap(),
            Err(err) => panic!("{:#?}", err)
        }
    }
}

fn expand_tilde<P: AsRef<Path>>(path_user_input: P) -> Option<PathBuf> {
    let p = path_user_input.as_ref();
    if !p.starts_with("~") {
        return Some(p.to_path_buf());
    }
    if p == Path::new("~") {
        return dirs::home_dir();
    }
    dirs::home_dir().map(|mut h| {
        if h == Path::new("/") {
            // Corner case: `h` root directory;
            // don't prepend extra `/`, just drop the tilde.
            p.strip_prefix("~").unwrap().to_path_buf()
        } else {
            h.push(p.strip_prefix("~/").unwrap());
            h
        }
    })
}

fn set_configuration(server: Option<String>, path: Option<String>, client_id: Option<String>, client_secret: Option<String>) -> WasmoResult<()> {

    if client_id.is_none() && client_secret.is_none() && server.is_none() && path.is_none() {
        return Err(DaikokuCliError::Configuration("missing client_id, client_secret or path keys".to_string()));
    }

    let home_path = get_home()?;

    let complete_path = match &path {
        Some(p) => Path::new(p).join(".daikoku"),
        None => home_path.join(".daikoku"),
    };

    let contents = match std::path::Path::new(&complete_path).exists() {
        false => {
            if path.is_some() {
                let _ = fs::create_dir(&path.as_ref().unwrap());
            } 
            format(None)
        }
        true => configuration_file_to_hashmap(&complete_path),
    };

    let client_id = extract_variable_or_default(&contents, DAIKOKU_CLIENT_ID, client_id);
    let client_secret = extract_variable_or_default(&contents, DAIKOKU_CLIENT_SECRET, client_secret);
    let server = extract_variable_or_default(&contents, DAIKOKU_SERVER, server);
    let daikoku_path = extract_variable_or_default(&contents, "DAIKOKU_PATH", path.clone());

    if DAIKOKU_PATH.eq("") {
        let new_content = format!("DAIKOKU_SERVER={}\nDAIKOKU_CLIENT_ID={}\nDAIKOKU_CLIENT_SECRET={}",
            server,
            client_id,
            client_secret);

        match fs::write(home_path.join(".daikoku"), new_content) {
            Ok(()) => logger::println(format!("wasmo configuration patched")),
            Err(e) => panic!(
                "Should have been able to write the wasmo configuration, {:#?}",
                e
            ),
        }
    } else {
        let content_at_path = format!(
            "DAIKOKU_SERVER={}\nDAIKOKU_PATH={}\nDAIKOKU_CLIENT_ID={}\nDAIKOKU_CLIENT_SECRET={}",
            server, daikoku_path, client_id, client_secret
        );
        let content_at_default_path = format!("DAIKOKU_PATH={}", daikoku_path);

        let home_file = home_path.join(".daikoku");

        // println!("Write in home {} - {}", format!("{}/.daikoku", &home_path), content_at_default_path);
        let _ = fs::remove_file(&home_file);
        match fs::write(&home_file, &content_at_default_path) {
            Ok(()) => (),
            Err(e) => panic!(
                "Should have been able to write the wasmo configuration, {:#?}",
                e
            ),
        }

        let project_file = match &path {
            Some(p) => Path::new(p).join(".daikoku"),
            None => match daikoku_path.is_empty() {
                true => home_path.join(".daikoku"),
                false => Path::new(&daikoku_path).join(".daikoku")
            }
        }
            .to_string_lossy()
            .to_string()
            .replace(".daikoku.daikoku", ".daikoku"); // guard

        // println!("Write inside project, {} - {:#?}", project_file, content_at_path);
        let _ = fs::remove_file(&project_file);
        match fs::write(project_file, &content_at_path) {
            Ok(()) => (),
            Err(e) => panic!(
                "Should have been able to write the wasmo configuration, {:#?}",
                e
            ),
        }

        logger::println(format!("wasmo configuration patched"))
    }

    Ok(())
}

#[tokio::main]
async fn main() {
    let args = Cli::parse();

    let out = match args.command {
        Commands::Version {} => {
            logger::success(format!("Wasmo version: {}", env!("CARGO_PKG_VERSION")));
            Ok(())
        },
        Commands::Init {
            template,
            name,
            path,
        } => initialize(template, name, path.map(absolute_path)),
        Commands::Watch { path, server, client_id, client_secret 
        } => watch(path, server, client_id, client_secret).await,
        Commands::Config { command } => match command {
            ConfigCommands::Set {
                client_id,
                client_secret,
                server,
                path
            } => set_configuration(server, path.map(absolute_path), client_id, client_secret),
            ConfigCommands::Get {} => {
                logger::loading("<yellow>Read</> configuration".to_string());
                let configuration = read_configuration().unwrap();

                logger::indent_println(format!("{:#?}", configuration));

                Ok(())
            }
            ConfigCommands::Reset {} => reset_configuration(),
        },
    };

    if let Err(e) = out {
        logger::error(format!("{}", e));
        std::process::exit(1);
     }

     std::process::exit(0);
}
