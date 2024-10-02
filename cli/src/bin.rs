mod commands;
mod helpers;
mod interactive;
mod logging;
mod models;
mod utils;

use clap::{Parser, Subcommand};
use logging::{error::DaikokuResult, logger};

/// A fictional versioning CLI
#[derive(Debug, Parser)] // requires `derive` feature
#[command(name = "daikoku")]
#[command(about = "Daikoku CLI", long_about = None, version = env!("CARGO_PKG_VERSION"))]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Get installed version
    Version {},
    /// Add a cookie to the current project
    Login {},
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
        /// Enable/Disable cookie usage - really useful for testing authenticated pages
        #[arg(value_name = "AUTHENTICATION", short = 'a', long = "authentication")]
        authentication: Option<bool>,
    },
    /// Manage your environments representing your Daikoku servers
    Environments {
        #[command(subcommand)]
        command: EnvironmentsCommands,
    },
    /// Manage your CMS projects
    Cms {
        #[command(subcommand)]
        command: CmsCommands,
    },
    /// ⚠️ synchronize projects file with Daikoku
    Push {
        #[arg(value_name = "DRY_RUN", short = 'd', long = "dry_run")]
        dry_run: Option<bool>,
        #[arg(value_name = "FILE_PATH", short = 'f', long = "file_path")]
        file_path: Option<String>,
    },
    Pull {
        #[command(subcommand)]
        command: PullCommands,
    },
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
        #[arg(value_name = "APIKEY", short = 'a', long = "apikey")]
        apikey: String,
        #[arg(value_name = "OVERWRITE", long = "overwrite", required = false)]
        overwrite: Option<bool>,
    },
    /// update default environment
    Config {
        #[arg(value_name = "APIKEY", short = 'a', long = "apikey")]
        apikey: Option<String>,
        #[arg(value_name = "COOKIE", short = 'c', long = "cookie")]
        cookie: Option<String>,
        // #[arg(value_name = "NAME", short = 'n', long = "name")]
        // name: Option<String>,
    },
    /// ⚠️  be careful, this will clear all environments
    Clear {
        #[arg(value_name = "FORCE", short = 'f', long = "force")]
        force: Option<bool>,
    },
    /// change the default environment to the specified name
    Switch {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    /// ⚠️  be careful, remove the specified environment
    Remove {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    /// show information of the specified environment
    Info {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "FULL", short = 'f', long = "full")]
        full: Option<bool>,
    },
    /// list all environments
    List {},
}

#[derive(Debug, Subcommand)]
pub enum CmsCommands {
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
    Switch {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
    },
    /// ⚠️  be careful, remove the specified project
    Remove {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "REMOVE_FILES", short = 'f', long = "remove_files")]
        remove_files: bool,
    },
    /// list all projects
    List {},
    /// ⚠️  be careful, this will clear all projects
    Clear {
        #[arg(value_name = "FORCE", short = 'f', long = "force")]
        force: Option<bool>,
    },
    /// ⚠️ import legacy projects from Daikoku
    Migrate {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "PATH", short = 'p', long = "path")]
        path: Option<String>,
        #[arg(value_name = "APIKEY", short = 'a', long = "apikey")]
        apikey: String,
        #[arg(value_name = "SERVER", short = 's', long = "server")]
        server: String,
    },
    Init {
        #[arg(value_name = "NAME", short = 'n', long = "name")]
        name: String,
        #[arg(value_name = "PATH", short = 'p', long = "path")]
        path: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum AssetsCommands {
    /// register a new asset
    Push {
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
pub enum PullCommands {
    Apis {
        #[arg(value_name = "ID", short = 'i', long = "od")]
        id: Option<String>,
    },
    Mails {},
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
        desc: String,
    },
}

async fn process(command: Commands) -> DaikokuResult<()> {
    match command {
        Commands::Version {} => commands::version::run(),
        Commands::Watch {
            environment,
            authentication,
        } => commands::watch::run(environment, authentication).await,
        Commands::Environments { command } => commands::environments::run(command).await,
        Commands::Cms { command } => commands::cms::run(command).await,
        Commands::Login {} => commands::login::run().await,
        Commands::Pull { command } => commands::pull::run(command).await,
        Commands::Push { dry_run, file_path } => commands::push::run(dry_run, file_path).await,
        Commands::Assets { command } => commands::assets::run(command).await,
        Commands::Generate { command } => commands::generate::run(command).await,
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
