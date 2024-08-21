mod commands;
mod logging;
mod models;
mod utils;
mod interactive;
mod helpers;

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
        #[arg(value_name = "TOKEN", short = 't', long = "token")]
        token: Option<String>,
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
        /// Enable/Disable token usage - really useful for testing authenticated pages
        #[arg(value_name = "AUTHENTICATION", short = 'a', long = "authentication")]
        authentication: Option<bool>,
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
    Sync {},
    /// Manage your CMS assets
    Assets {
        #[command(subcommand)]
        command: AssetsCommands,
    },
    Generate {
        #[command(subcommand)]
        command: GenerateCommands,
    },
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
        #[arg(value_name = "FORCE", long = "force", required = false)]
        force: Option<bool>,
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
    Remove {
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
    Remove {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "FILES", short = 'f', long = "files")]
        remove_files: bool,
    },
    /// list all projects
    List {},
    /// ⚠️  be careful, this will clear all projects
    Clear {},
    /// ⚠️ import legacy projects from Daikoku
    Import {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "PATH", short = 'p', long = "path")]
        path: String,
        #[arg(value_name = "TOKEN", short = 't', long = "token")]
        token: String,
        #[arg(value_name = "SERVER", short = 's', long = "server")]
        server: String,
        #[arg(
            value_name = "DOMAIN", 
            short = 'd', 
            long = "domain",
            value_parser = ["all", "pages", "apis", "mails"], 
            default_value = "all",
        )]
        domain: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum AssetsCommands {
    /// register a new asset
    Add {
        #[arg(value_name = "FILENAME", short = 'f', long = "filename")]
        filename: String,
        #[arg(value_name = "TITLE", short = 't', long = "title")]
        title: String,
        #[arg(value_name = "DESC", short = 'd', long = "desc")]
        desc: String,
        #[arg(value_name = "PATH", short = 'p', long = "path")]
        path: Option<String>,
        #[arg(value_name = "SLUG", short = 's', long = "slug")]
        slug: Option<String>,
    },
    /// ⚠️  be careful, remove remote and local asset
    Remove {
        #[arg(value_name = "filename", short = 'f', long = "filename")]
        filename: String,
        #[arg(value_name = "SLUG", short = 's', long = "slug")]
        slug: Option<String>,
        #[arg(value_name = "PATH", short = 'p', long = "path")]
        path: Option<String>,
    },
    /// list all assets
    List {},
    /// sync all assets to the remote bucket
    Sync {},
}

#[derive(Debug, Subcommand)]
pub enum GenerateCommands {
    /// create a new documentation page for your api
    Documentation {
        #[arg(value_name = "FILENAME", short = 'f', long = "filename")]
        filename: String,
        #[arg(value_name = "TITLE", short = 't', long = "title")]
        title: String,
        #[arg(value_name = "DESC", short = 'd', long = "desc")]
        desc: String
    },
}


async fn process(command: Commands) -> DaikokuResult<()> {
    match command {
        Commands::Version {} => commands::version::run(),
        Commands::Create {
            template,
            name,
            path,
        } => commands::creation::run(template, name, path.map(|p| absolute_path(p).unwrap())).await,
        Commands::Watch {
            environment,
            authentication,
        } => commands::watch::run(environment, authentication).await,
        Commands::Environments { command } => commands::enviroments::run(command).await,
        Commands::Projects { command } => commands::projects::run(command).await,
        Commands::Login { token } => commands::login::run(token).await,
        Commands::Sync {} => commands::sync::run().await,
        Commands::Assets { command } => commands::assets::run(command).await,
        Commands::Generate { command } => commands::generate::run(command).await
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
