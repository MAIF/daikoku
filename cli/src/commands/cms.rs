use std::{
    collections::HashMap,
    fs::{self, create_dir, File},
    path::{Path, PathBuf},
    str::FromStr,
};

use async_recursion::async_recursion;
use configparser::ini::Ini;
use serde::{Deserialize, Serialize};

use crate::{
    helpers::{
        bytes_to_struct, bytes_to_vec_of_struct, map_error_to_filesystem_error,
        raw_daikoku_cms_api_get,
    },
    interactive::prompt,
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    models::folder::{Ext, SourceExtension},
    process,
    utils::{absolute_path, new_custom_ini_file},
    CmsCommands, Commands,
};

const ZIP_CMS: &[u8] = include_bytes!("../../templates/cms.zip");

#[derive(Clone)]
pub(crate) struct Project {
    pub(crate) path: String,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
pub(crate) struct CmsPage {
    pub(crate) _id: String,
    visible: bool,
    authenticated: bool,
    pub(crate) name: String,
    #[serde(alias = "contentType")]
    pub(crate) content_type: String,
    pub(crate) path: Option<String>,
    exact: bool,
    #[serde(alias = "lastPublishedDate")]
    last_published_date: Option<u64>,
    #[serde(alias = "body")]
    pub(crate) content: String,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
struct MailTemplate {
    _id: String,
    _tenant: String,
    language: String,
    key: String,
    value: String,
    #[serde(alias = "lastModificationAt")]
    last_modification_at: Option<u64>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
struct IntlTranslation {
    _id: String,
    translations: Vec<MailTemplate>,
    content: String,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
pub(crate) struct IntlTranslationBody {
    translations: Vec<IntlTranslation>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
pub(crate) struct TenantMailBody {
    #[serde(alias = "mailerSettings")]
    mailer_settings: Option<MailerSettings>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
struct MailerSettings {
    template: Option<String>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
pub(crate) struct Api {
    pub(crate) _id: String,
    #[serde(alias = "_humanReadableId")]
    human_readable_id: String,
    header: Option<String>,
    description: Option<String>,
}

pub(crate) const EXCLUDE_API: [&'static str; 2] =
    ["admin-api-tenant-default", "cms-api-tenant-default"];

pub(crate) async fn run(command: CmsCommands) -> DaikokuResult<()> {
    match command {
        CmsCommands::Add {
            name,
            path,
            overwrite,
        } => add(name, absolute_path(path)?, overwrite.unwrap_or(false)),
        CmsCommands::Switch { name } => switch_cms(name),
        CmsCommands::Remove { name, remove_files } => delete(name, remove_files),
        CmsCommands::List {} => list(),
        CmsCommands::Clear { force } => clear(force.unwrap_or(false)),
        CmsCommands::Migrate {
            name,
            path,
            server,
            apikey,
        } => {
            migrate(
                name,
                absolute_path(path.unwrap_or("./".to_string()))?,
                server,
                apikey,
            )
            .await
        }
        CmsCommands::Init { name, path } => {
            init(name, absolute_path(path.unwrap_or("./".to_string()))?).await
        }
    }
}

pub(crate) fn get_default_project() -> DaikokuResult<Project> {
    let config = read(false)?;

    let default_project_name =
        config
            .get("default", "project")
            .ok_or(DaikokuCliError::Configuration(
                "missing default project or values in project. See cms commands".to_string(),
            ))?;

    let project = config
        .get_map()
        .map(|m| m[&default_project_name].clone())
        .ok_or(DaikokuCliError::Configuration(
            "missing default project or values in project. See cms commands".to_string(),
        ))?;

    match (&project["name"], &project["path"]) {
        (Some(_name), Some(path)) => Ok(Project {
            path: path.to_string(),
        }),
        (_, _) => Err(DaikokuCliError::Configuration(
            "missing default project or values in project. See cms commands".to_string(),
        )),
    }
}

fn add(name: String, path: String, overwrite: bool) -> DaikokuResult<()> {
    logger::loading("<yellow>Initialize</> path to project ...".to_string());

    let mut config: Ini = read(false)?;

    if config.get(&name, "path").is_some() && !overwrite {
        return Err(DaikokuCliError::Configuration(
            format!("project already exists in the configuration file. Run daikoku cms remove --name={} to remove it", name),
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

fn switch_cms(name: String) -> DaikokuResult<()> {
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
            let _ = get_project(name.clone());
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

fn internal_get_project(name: String) -> Option<Project> {
    let config = read(false).ok()?;

    let projects = config.get_map()?;

    projects
        .get(&name)
        .map(|project| match (&project["name"], &project["path"]) {
            (Some(_name), Some(path)) => Some(Project {
                path: path.to_string(),
            }),
            (_, _) => None,
        })
        .flatten()
}

fn force_clearing_default_project() -> DaikokuResult<()> {
    let mut config: Ini = read(false)?;

    config.remove_section("default");

    config
        .write(&get_path()?)
        .map_err(|err| DaikokuCliError::Configuration(err.to_string()))
}

fn list() -> DaikokuResult<()> {
    let config: Ini = read(false)?;

    let map = config.get_map().map(Ok).unwrap_or(Ok(HashMap::new()))?;

    logger::info(serde_json::to_string_pretty(&map).unwrap());

    Ok(())
}

fn delete(name: String, remove_files: bool) -> DaikokuResult<()> {
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

    if remove_files {
        if let Some(folder_path) = config.get(&name, "path") {
            let _ = fs::remove_dir_all(folder_path);
        }
    }

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
    let mut config = new_custom_ini_file();

    match config.load(&get_path()?) {
        Ok(_) => Ok(config),
        Err(_) if !last_attempt => match std::fs::File::create(&get_path()?) {
            Ok(_) => read(true),
            Err(e) => Err(DaikokuCliError::Configuration(e.to_string())),
        },
        Err(e) => Err(DaikokuCliError::Configuration(e.to_string())),
    }
}

fn remove_cms() -> DaikokuResult<()> {
    let mut config = new_custom_ini_file();
    config.clear();
    match config.write(&get_path()?) {
        Ok(_) => {
            logger::println("<green>Projects erased</>".to_string());
            Ok(())
        }
        Err(e) => Err(DaikokuCliError::FileSystem(format!(
            "failed to reset the projects file : {}",
            e.to_string()
        ))),
    }
}

fn clear(force: bool) -> DaikokuResult<()> {
    if force {
        return remove_cms();
    }

    logger::error("Are you to delete all cms ? [yN]".to_string());

    let choice = prompt()?;

    if choice.trim() == "y" {
        remove_cms()
    } else {
        Ok(())
    }
}

fn map_filesystem_err(err: zip::result::ZipError) -> DaikokuCliError {
    DaikokuCliError::FileSystem(err.to_string())
}
fn map_io_err(err: std::io::Error) -> DaikokuCliError {
    DaikokuCliError::FileSystem(err.to_string())
}

fn unzip_to_path(zip_bytes: &[u8], dest_path: &PathBuf) -> DaikokuResult<()> {
    let cursor = std::io::Cursor::new(zip_bytes);

    let mut archive =
        zip::ZipArchive::new(cursor).map_err(map_filesystem_err)?;

    std::fs::create_dir_all(dest_path)
        .map_err(map_io_err)?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(map_filesystem_err)?;

        let filename = file.name().replace("cms/", "");

        if !filename.is_empty() {
            let out_path = Path::new(dest_path).join(filename);

            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(map_io_err)?;
            }

            if file.is_dir() {
                let _ = create_dir(out_path)
                    .map_err(map_io_err)?;
            } else {
                let mut dest_file = File::create(out_path)
                    .map_err(map_io_err)?;

                std::io::copy(&mut file, &mut dest_file)
                    .map_err(map_io_err)?;
            }
        }
    }

    Ok(())
}

#[async_recursion]
async fn init(name: String, path: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Initializing project</> ...".to_string());

    logger::indent_println("<yellow>Unzipping</> the template ...".to_string());

    let complete_path = Path::new(&path).join(&name);

    match unzip_to_path(ZIP_CMS, &complete_path) {
        Ok(()) => {
            process(Commands::Cms {
                command: crate::CmsCommands::Add {
                    name: name,
                    path: complete_path.into_os_string().into_string().unwrap(),
                    overwrite: None,
                },
            })
            .await?;
            logger::println("<green>CMS created</>".to_string());
            Ok(())
        }
        Err(e) => Err(DaikokuCliError::CmsCreationFile(e.to_string())),
    }
}

#[async_recursion]
async fn migrate(name: String, path: String, server: String, apikey: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Converting</> legacy project from Daikoku environment".to_string());

    if internal_get_project(name.clone()).is_some() {
        return Err(DaikokuCliError::Configuration(
            "Project already exists".to_string(),
        ));
    } else {
        force_clearing_default_project()?
    }

    if raw_daikoku_cms_api_get("/health", &server.clone(), &apikey)
        .await?
        .status
        != 200
    {
        return Err(DaikokuCliError::Configuration(
            "Failed to join Daikoku server".to_string(),
        ));
    }

    if raw_daikoku_cms_api_get("/version", &server, &apikey)
        .await?
        .status
        != 404
    {
        return Err(DaikokuCliError::DaikokuStrError(
            "The CMS version in Daikoku is too recent to be migrated".to_string(),
        ));
    }

    let project_path = PathBuf::from_str(&path)
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?
        .join(name.clone());

    let sources_path = project_path.join("src");

    let root_mail_user_translations = bytes_to_struct::<IntlTranslationBody>(
        raw_daikoku_cms_api_get(
            "/translations/_mail?domain=tenant.mail.template",
            &server,
            &apikey,
        )
        .await?
        .response,
    )?;

    let mail_user_template = bytes_to_struct::<IntlTranslationBody>(
        raw_daikoku_cms_api_get("/translations/_mail?domain=mail", &server, &apikey)
            .await?
            .response,
    )?;

    let apis_informations: Vec<Api> = bytes_to_vec_of_struct::<Api>(
        raw_daikoku_cms_api_get(
            "/apis?fields=_id,_humanReadableId,header,description",
            &server,
            &apikey,
        )
        .await?
        .response,
    )?
    .into_iter()
    .filter(|api| !EXCLUDE_API.contains(&api._id.as_str()))
    .collect();

    create_mail_folder(root_mail_user_translations, sources_path.clone(), true)?;
    create_mail_folder(mail_user_template, sources_path.clone(), false)?;

    create_api_folder(apis_informations, sources_path.clone())?;

    logger::info("create_cms_pages".to_string());
    create_cms_pages(&sources_path, &server, &apikey).await?;

    logger::info("create_daikoku_hidden_files".to_string());
    create_daikoku_hidden_files(project_path.clone())?;

    logger::info("Trying to create project".to_string());
    create_project(name.clone(), project_path.clone()).await?;

    logger::info("Trying to create environment".to_string());
    create_environment(name, server, apikey).await?;

    logger::println("<green>Migration endded</>".to_string());

    Ok(())
}

fn replace_ids(items: Vec<CmsPage>) -> DaikokuResult<Vec<CmsPage>> {
    let identifiers = items
        .iter()
        .map(|item| item._id.clone())
        .collect::<Vec<String>>();

    let mut paths: HashMap<String, String> = HashMap::new();
    items.iter().for_each(|item| {
        if let Ok(path) = get_cms_page_path(item)
            .unwrap()
            .into_os_string()
            .into_string()
        {
            paths.insert(item._id.clone(), format!("/{}", path));
        }
    });

    let mut updated_pages = Vec::new();

    items.iter().for_each(|item| {
        let mut new_page = item.clone();
        identifiers.iter().for_each(|identifier| {
            new_page.content = new_page.content.replace(
                identifier,
                paths.get(identifier).unwrap_or(&item._id.clone()),
            );
        });
        updated_pages.push(new_page)
    });

    Ok(updated_pages)
}

pub(crate) fn create_api_folder(
    apis: Vec<Api>,
    project_path: PathBuf,
) -> DaikokuResult<Vec<String>> {
    let mut created: Vec<String> = Vec::new();

    apis.iter().for_each(|item| {
        let file_path = project_path.clone().join(
            PathBuf::from_str("apis")
                .unwrap()
                .join(item.human_readable_id.clone()),
        );

        if !file_path.exists() {
            let _ = fs::create_dir_all(file_path.clone());

            created.push(item.human_readable_id.clone());

            let mut config: Ini = new_custom_ini_file();
            config.set(&"default", "id", Some(item._id.clone()));
            let _ = config.write(file_path.clone().join(".daikoku_data"));

            if let Some(description) = &item.description {
                let _description = create_path_and_file(
                    file_path.join("description").join("page.html").clone(),
                    description.clone(),
                    item._id.clone(),
                    HashMap::new(),
                    SourceExtension::HTML,
                );
            } else {
                let _ = fs::create_dir_all(file_path.join("description"))
                    .map_err(|err| map_error_to_filesystem_error(err, ""));
            }

            if let Some(header) = &item.header {
                let _header = create_path_and_file(
                    file_path.join("header").join("page.html").clone(),
                    header.clone(),
                    item._id.clone(),
                    HashMap::new(),
                    SourceExtension::HTML,
                );
            } else {
                let _ = fs::create_dir_all(file_path.join("header"))
                    .map_err(|err| map_error_to_filesystem_error(err, ""));
            }
        }
    });

    Ok(created)
}

pub(crate) fn create_mail_folder(
    intl_translation: IntlTranslationBody,
    project_path: PathBuf,
    is_root_mail: bool,
) -> DaikokuResult<()> {
    intl_translation.translations.iter().for_each(|item| {
        let mail_folder = project_path
            .clone()
            .join(get_mail_page_path(&item._id.clone().replace(".", "-"), is_root_mail).unwrap());

        let mut config: Ini = new_custom_ini_file();

        config.set(&"default", "id", Some(item._id.clone()));

        let _ = config.write(mail_folder.clone().join(".daikoku_data"));

        item.translations.iter().for_each(|translation| {
            let file_path = mail_folder
                        .clone()
                        .join(translation.language.clone());

            if !file_path.exists() {
                let _ = create_path_and_file(
                    mail_folder
                        .clone()
                        .join(translation.language.clone())
                        .join("page.html"),
                    translation.value.clone().replace("''", "'"),
                    translation._id.clone(),
                    HashMap::new(),
                    SourceExtension::HTML,
                );
            }
        })
    });

    Ok(())
}

async fn create_cms_pages(
    sources_path: &PathBuf,
    server: &String,
    apikey: &String,
) -> DaikokuResult<()> {
    let items = bytes_to_vec_of_struct::<CmsPage>(
        raw_daikoku_cms_api_get("/pages", &server, &apikey)
            .await?
            .response,
    )?;

    let new_pages = replace_ids(items)?;

    convert_cms_pages(new_pages, sources_path.clone())
}

fn convert_cms_pages(items: Vec<CmsPage>, project_path: PathBuf) -> DaikokuResult<()> {
    items.iter().for_each(|item| {
        let extension = SourceExtension::from_str(&item.content_type).unwrap();

        let file_path = project_path.clone().join(get_cms_page_path(item).unwrap());

        let metadata = extract_metadata(item).unwrap_or(HashMap::new());

        let _ = create_path_and_file(
            file_path,
            item.content.clone(),
            item.name.clone(),
            metadata,
            extension,
        );
    });

    Ok(())
}

fn get_mail_page_path(filename: &String, is_root_mail: bool) -> DaikokuResult<PathBuf> {
    let folder = if is_root_mail { "mails/root" } else { "mails" };

    let folder_path = PathBuf::from_str(folder).unwrap().join(filename);

    Ok(folder_path)
}

fn get_cms_page_path(item: &CmsPage) -> DaikokuResult<PathBuf> {
    let extension = SourceExtension::from_str(&item.content_type).unwrap();

    let mut folder = match extension {
        SourceExtension::HTML => item.path.clone().map(|_| "pages").unwrap_or("blocks"),
        SourceExtension::CSS => "styles",
        SourceExtension::Javascript => "scripts",
        SourceExtension::JSON => "data",
    };

    if item.path.clone().map(|p| p.contains("mails")).is_some() {
        folder = "mails"
    }

    let router_path = item
        .path
        .clone()
        .map(|p| p.replacen("/", "", 1))
        .map(|formatted_path| {
            if formatted_path == "/" || formatted_path.is_empty() {
                item.name.clone()
            } else {
                formatted_path
            }
        });

    let folder_path = if router_path
        .clone()
        .unwrap_or(item.name.clone())
        .starts_with(folder)
    {
        PathBuf::from_str(folder).unwrap().join(
            router_path
                .unwrap_or(item.name.clone())
                .replacen(folder, "", 1),
        )
    } else {
        PathBuf::from_str(folder).unwrap().join(format!(
            "{}{}",
            router_path.unwrap_or(item.name.clone()),
            extension.ext()
        ))
    };

    let parent = folder_path.parent().unwrap();

    if !parent.exists() {
        fs::create_dir_all(parent).map_err(|err| map_error_to_filesystem_error(err, ""))?;
    }

    Ok(folder_path)
}

pub fn create_path_and_file(
    file_buf: PathBuf,
    content: String,
    name: String,
    metadata: HashMap<String, String>,
    content_type: SourceExtension,
) -> DaikokuResult<()> {
    let parent =
        file_buf
            .parent()
            .map(|path| Ok(path))
            .unwrap_or(Err(DaikokuCliError::FileSystem(
                "failed to recursively create paths".to_string(),
            )))?;

    if !parent.exists() {
        fs::create_dir_all(parent).map_err(|err| map_error_to_filesystem_error(err, ""))?;
    }

    let mut file_path = file_buf.clone();

    // set extension if missing
    file_path
        .clone()
        .as_path()
        .as_os_str()
        .to_str()
        .unwrap()
        .split("/")
        .last()
        .filter(|part| !part.contains("."))
        .map(|_| file_path.set_extension(content_type.ext()[1..].to_string()));

    logger::println(format!("Creating {} {:?}", name, file_path));

    if content_type == SourceExtension::HTML {
        if metadata.is_empty() {
            Ok(fs::write(file_path, content)
                .map_err(|err| map_error_to_filesystem_error(err, ""))?)
        } else {
            let metadata_header = serde_yaml::to_string(&metadata).map_err(|_err| {
                DaikokuCliError::ParsingError(format!("failed parsing metadata {}", &name))
            })?;

            Ok(
                fs::write(file_path, format!("{}\n---\n{}", metadata_header, content))
                    .map_err(|err| map_error_to_filesystem_error(err, ""))?,
            )
        }
    } else {
        Ok(fs::write(file_path, content).map_err(|err| map_error_to_filesystem_error(err, ""))?)
    }
}

fn extract_metadata(item: &CmsPage) -> DaikokuResult<HashMap<String, String>> {
    let mut metadata: HashMap<String, String> = HashMap::new();

    metadata.insert("_authenticated".to_string(), item.authenticated.to_string());
    metadata.insert("_visible".to_string(), item.visible.to_string());
    metadata.insert("_exact".to_string(), item.exact.to_string());
    item.last_published_date
        .map(|value| metadata.insert("_last_published_date".to_string(), value.to_string()));
    Ok(metadata)
}

fn create_daikoku_hidden_files(complete_path: PathBuf) -> DaikokuResult<File> {
    fs::create_dir_all(complete_path.join(".daikoku"))
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?;

    fs::File::create(complete_path.join(".daikoku").join(".environments"))
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?;

    fs::File::create(complete_path.join(".daikoku").join(".daikokuignore"))
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?;

    fs::File::create(complete_path.join(".daikoku").join(".secrets"))
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))
}

async fn create_project(name: String, complete_path: PathBuf) -> DaikokuResult<()> {
    process(Commands::Cms {
        command: crate::CmsCommands::Add {
            name: name,
            path: complete_path.into_os_string().into_string().unwrap(),
            overwrite: None,
        },
    })
    .await?;
    Ok(())
}

async fn create_environment(name: String, server: String, apikey: String) -> DaikokuResult<()> {
    process(Commands::Environments {
        command: crate::EnvironmentsCommands::Add {
            name: name,
            server,
            apikey,
            overwrite: Some(true),
        },
    })
    .await?;
    Ok(())
}
