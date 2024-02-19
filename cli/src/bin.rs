#[macro_use]
extern crate ini;

mod commands;
mod logging;
mod models;
mod utils;

use clap::{Parser, Subcommand};
use logging::logger;
use utils::absolute_path;

/// A fictional versioning CLI
#[derive(Debug, Parser)] // requires `derive` feature
#[command(name = "daikokucli")]
#[command(about = "Daikoku CLI", long_about = None, version = env!("CARGO_PKG_VERSION"))]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
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
        #[arg(value_name = "NAME", short = 'n', long = "name", required = false)]
        name: String,
        /// The path where initialize the plugin
        #[arg(value_name = "PATH", short = 'p', long = "path", required = false)]
        path: Option<String>,
    },
    Source {
        #[command(subcommand)]
        command: SourceCommands,
    },
    ///
    #[command()]
    Watch {
        /// The remote to target
        #[arg(value_name = "PATH", short = 'p', long = "path", required = false)]
        path: Option<String>,
        /// The server to build
        #[arg(value_name = "SERVER", short = 's', long = "server", required = false)]
        server: Option<String>,
        /// client id
        #[arg(value_name = "CLIENT_ID", long = "clientId", required = false)]
        client_id: Option<String>,
        /// client secret
        #[arg(value_name = "CLIENT_SECRET", long = "clientSecret", required = false)]
        client_secret: Option<String>,
    },
    /// Globally configure the CLI with the path where the configuration file will be stored and the server to reach during the build. These parameters are optional and can be passed when running the build command.
    Config {
        #[command(subcommand)]
        command: ConfigCommands,
    },
}

#[derive(Debug, Subcommand)]
pub enum SourceCommands {
    New {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "EXTENSION", short = 'e', long = "extension", value_parser=["javascript", "html", "json", "css"], require_equals = true)]
        extension: String,
        #[arg(
            value_name = "VISIBLE",
            short = 'v',
            long = "visible",
            required = false
        )]
        visible: Option<bool>,
        #[arg(
            value_name = "AUTHENTICATED",
            short = 'a',
            long = "authenticated",
            required = false
        )]
        authenticated: Option<bool>,
        #[arg(value_name = "PATH", long = "path")]
        path: Option<String>,
        #[arg(value_name = "EXACT", long = "exact", required = false)]
        exact: Option<bool>,
        #[arg(value_name = "BLOCK", long = "block", required = false)]
        block: Option<bool>,
        #[arg(value_name = "OVERWRITE", long = "overwrite", required = false)]
        overwrite: Option<bool>,
    },
    Delete {
        #[arg(value_name = "ID", short = 'i', long = "identifier")]
        id: Option<String>,
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: Option<String>,
        #[arg(value_name = "EXTENSION", short = 'e', long = "extension", value_parser=["javascript", "html", "json", "css"], require_equals = true)]
        extension: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum ConfigCommands {
    Add {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "SERVER", short = 's', long = "server")]
        server: Option<String>,
        #[arg(value_name = "SECURED", long = "secured", required = false)]
        secured: Option<bool>,
    },
    Clear {},
    Default {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    Delete {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    Get {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    Use {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
}

#[tokio::main]
async fn main() {
    let args = Cli::parse();

    let out = match args.command {
        Commands::Version {} => commands::version::run(),
        Commands::Init {
            template,
            name,
            path,
        } => commands::initialization::run(template, name, path.map(absolute_path)),
        Commands::Source { command } => commands::source::run(command),
        Commands::Watch {
            path,
            server,
            client_id,
            client_secret,
        } => {
            commands::watch::run(path.map(absolute_path), server, client_id, client_secret).await;
            Ok(())
        }
        Commands::Config { command } => commands::configuration::run(command),
    };

    if let Err(e) = out {
        logger::error(format!("{}", e));
        std::process::exit(1);
    }

    std::process::exit(0);
}
