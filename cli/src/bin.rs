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
        /// Token can be found on your Daikoku profile page and used by Daikoku to access authenticated resources
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
        /// if specified, the default environment will be ignored and the CLI will use that one
        #[arg(
            value_name = "ENVIRONMENT",
            short = 'e',
            long = "environment",
            required = false
        )]
        environment: Option<String>,
    },
    /// Manage your environments representing your Daikoku servers
    Environments {
        #[command(subcommand)]
        command: EnvironmentsCommands,
    },
    /// Manage your CMS projects
    Projects {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// ⚠️ synchronize projects file with Daikoku
    Sync {}
}

#[derive(Debug, Subcommand)]
pub enum EnvironmentsCommands {
    /// add a new environment to the list of environments and use it as default
    Add {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "SERVER", short = 's', long = "server")]
        server: String,
        #[arg(value_name = "TOKEN", short = 'a', long = "token")]
        token: Option<String>,
        #[arg(value_name = "OVERWRITE", long = "overwrite", required = false)]
        overwrite: Option<bool>,
    },
    /// update default environment by adding auth token
    PathDefault {
        #[arg(
            value_name = "TOKEN",
            short = 't',
            long = "token",
            require_equals = true
        )]
        token: String,
    },
    /// ⚠️  be careful, this will clear all environments
    Clear {},
    /// change the default environment to the specified name
    Default {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    /// ⚠️  be careful, remove the specified environment
    Delete {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    /// show information of the specified environment
    Env {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    /// list all environments
    List {},
}

#[derive(Debug, Subcommand)]
pub enum ProjectCommands {
    /// register a new project to the CLI
    Add {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "PATH", short = 'p', long = "path")]
        path: String,
        #[arg(value_name = "OVERWRITE", short = 'o', long = "overwrite")]
        overwrite: Option<bool>,
    },
    /// change the default project to the specified name
    Default {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    /// ⚠️  be careful, remove the specified project
    Delete {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
      /// list all projects
    List {},
      /// ⚠️  be careful, this will clear all projects
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
        Commands::Watch { environment } => commands::watch::run(environment).await,
        Commands::Environments { command } => commands::enviroments::run(command).await,
        Commands::Projects { command } => commands::projects::run(command),
        Commands::Login { token } => commands::login::run(token).await,
        Commands::Sync {  } => commands::sync::run().await
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