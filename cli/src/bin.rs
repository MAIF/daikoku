mod commands;
mod logging;
mod models;
mod utils;

use clap::{Parser, Subcommand};
use logging::{error::DaikokuResult, logger};
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
    /// Get installed version
    Version {},
    /// Initialize a new CMS project from template at specific path. Currently adding project as default project
    #[command()]
    Create {
        /// The template to clone
        #[arg(
            value_name = "TEMPLATE",
            short = 't',
            long = "template",
            value_parser = ["empty"],
            require_equals = true,
        )]
        template: Option<String>,
        /// Project name
        #[arg(value_name = "NAME", short = 'n', long = "name", required = false)]
        name: String,
        /// Path where initialize the project
        #[arg(value_name = "PATH", short = 'p', long = "path", required = false)]
        path: Option<String>,
    },
    /// Add a token to the current project. The token must be pasted from your Daikoku profile page.
    Login {
        #[arg(
            value_name = "TOKEN",
            short = 't',
            long = "token",
            require_equals = true
        )]
        token: String,
    },
    /// Watch project changes and serve pages on :3333 (or on WATCHING_PORT=)
    #[command()]
    Watch {
        #[arg(
            value_name = "PROJECT",
            short = 'p',
            long = "project",
            required = false
        )]
        project: Option<String>,
    },
    Environment {
        #[command(subcommand)]
        command: EnvironmentsCommands,
    },
    Projects {
        #[command(subcommand)]
        command: ProjectCommands,
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
pub enum EnvironmentsCommands {
    Add {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "SERVER", short = 's', long = "server")]
        server: String,
        #[arg(value_name = "TOKEN", short = 'a', long = "token")]
        token: String,
        #[arg(value_name = "OVERWRITE", long = "overwrite", required = false)]
        overwrite: Option<bool>,
    },
    PathDefault {
        #[arg(
            value_name = "TOKEN",
            short = 't',
            long = "token",
            require_equals = true
        )]
        token: String,
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
    Env {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    List {},
}

#[derive(Debug, Subcommand)]
pub enum ProjectCommands {
    Add {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "PATH", short = 'p', long = "path")]
        path: String,
        #[arg(value_name = "OVERWRITE", short = 'o', long = "overwrite")]
        overwrite: Option<bool>,
    },
    Default {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    Delete {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    List {},
    Reset {},
}

async fn process(command: Commands) -> DaikokuResult<()> {
    match command {
        Commands::Version {} => commands::version::run(),
        Commands::Create {
            template,
            name,
            path,
        } => commands::creation::run(template, name, path.map(|p| absolute_path(p).unwrap())).await,
        Commands::Watch { project } => commands::watch::run(project).await,
        Commands::Environment { command } => commands::enviroments::run(command),
        Commands::Projects { command } => commands::projects::run(command),
        Commands::Login { token } => commands::login::run(token).await,
    }
}

#[tokio::main]
async fn main() {
    let args = Cli::parse();

    let out = process(args.command).await;

    if let Err(e) = out {
        logger::error(format!("{}", e));
        std::process::exit(1);
    }

    std::process::exit(0);
}
