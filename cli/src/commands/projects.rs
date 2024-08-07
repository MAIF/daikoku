use std::{
    any::type_name,
    collections::HashMap,
    fs::{self, File},
    path::{Path, PathBuf},
    str::FromStr,
};

use async_recursion::async_recursion;
use bytes::Bytes;
use configparser::ini::Ini;
use http_body_util::Empty;
use hyper::{header, Method, Request};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;

use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    models::folder::{Ext, SourceExtension},
    process,
    utils::{absolute_path, frame_to_bytes_body},
    Commands, ProjectCommands,
};

use super::enviroments::{can_join_daikoku, format_cookie, Environment};

#[derive(Clone)]
pub(crate) struct Project {
    pub(crate) path: String,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
struct CmsPage {
    _id: String,         //: "651443d43d00001b85d2dc7a",
    visible: bool,       //: true,
    authenticated: bool, //: false,
    name: String,        //: "parcours-affiliation-digitale",
    #[serde(alias = "contentType")]
    content_type: String, //: "text/html",
    path: Option<String>, //: "/parcours-affiliation-digitale",
    exact: bool,         //: false,
    #[serde(alias = "lastPublishedDate")]
    last_published_date: Option<u64>, //: 1706520418595
    #[serde(alias = "body")]
    content: String,
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
struct IntlTranslationBody {
    translations: Vec<IntlTranslation>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
struct TenantMailBody {
    #[serde(alias = "mailerSettings")]
    mailer_settings: Option<MailerSettings>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
struct MailerSettings {
    template: Option<String>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
struct Api {
    _id: String,
    #[serde(alias = "_humanReadableId")]
    human_readable_id: String,
    header: Option<String>,
    description: Option<String>,
}

pub(crate) async fn run(command: ProjectCommands) -> DaikokuResult<()> {
    match command {
        ProjectCommands::Add {
            name,
            path,
            overwrite,
        } => add(name, absolute_path(path)?, overwrite.unwrap_or(false)),
        ProjectCommands::Default { name } => update_default(name),
        ProjectCommands::Remove { name, remove_files } => delete(name, remove_files),
        ProjectCommands::List {} => list(),
        ProjectCommands::Clear {} => clear(),
        ProjectCommands::Import {
            name,
            path,
            server,
            token,
            domain,
        } => import(name, domain, absolute_path(path)?, server, token).await,
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
            "project already exists in the configuration file. use daikokucli projects list and remove it".to_string(),
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
        Some(project) => {
            match (&project["name"], &project["path"]) {
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
            }
        }
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

#[async_recursion]
async fn import(
    name: String,
    domain: String,
    path: String,
    server: String,
    token: String,
) -> DaikokuResult<()> {
    logger::loading("<yellow>Converting</> legacy project from Daikoku environment".to_string());

    if internal_get_project(name.clone()).is_some() {
        return Err(DaikokuCliError::Configuration(
            "Project already exists".to_string(),
        ));
    } else {
        force_clearing_default_project()?
    }

    if !can_join_daikoku(&server.clone()).await? {
        return Err(DaikokuCliError::Configuration(
            "Failed to join Daikoku server".to_string(),
        ));
    }

    let cookie = format_cookie(token);

    let environment = Environment {
        server: server.clone(),
        token: Some(cookie.clone()),
    };

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    // let url: String = format!("{}/api/cms", environment.server);

    // let req = Request::builder()
    //     .method(Method::GET)
    //     .uri(&url)
    //     .header(header::HOST, &host)
    //     .header(header::COOKIE, cookie.clone())
    //     .body(Empty::<Bytes>::new())
    //     .unwrap();

    // let stream = TcpStream::connect(&host).await.map_err(|err| {
    //     DaikokuCliError::DaikokuErrorWithMessage("failed to join the server".to_string(), err)
    // })?;
    // let io = TokioIo::new(stream);

    // let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
    //     .await
    //     .map_err(|err| DaikokuCliError::HyperError(err))?;

    // tokio::task::spawn(async move {
    //     if let Err(err) = conn.await {
    //         logger::error(format!("Connection error {:?}", err));
    //     }
    // });

    // let upstream_resp = sender
    //     .send_request(req)
    //     .await
    //     .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?;

    // let (
    //     hyper::http::response::Parts {
    //         headers: _, status, ..
    //     },
    //     body,
    // ) = upstream_resp.into_parts();

    let items = bytes_to_vec_of_struct::<CmsPage>(
        fetch_daikoku_api("/cms", &host, &environment, &cookie).await?,
    )?;

    if items.iter().find(|p| p.path.is_none()).is_none() {
        return Err(DaikokuCliError::DaikokuStrError(
            "imported project is not a legacy project".to_string(),
        ));
    }

    let project_path = PathBuf::from_str(&path)
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?
        .join(name.clone());

    let sources_path = project_path.join("src");

    let new_pages = replace_ids(items)?;

    let root_mail_tenant = bytes_to_struct::<TenantMailBody>(
        fetch_daikoku_api("/tenants/default", &host, &environment, &cookie).await?,
    )?;

    let root_mail_user_translations = bytes_to_struct::<IntlTranslationBody>(
        fetch_daikoku_api(
            "/translations/_mail?domain=tenant.mail.template",
            &host,
            &environment,
            &cookie,
        )
        .await?,
    )?;

    let mail_user_template = bytes_to_struct::<IntlTranslationBody>(
        fetch_daikoku_api(
            "/translations/_mail?domain=mail",
            &host,
            &environment,
            &cookie,
        )
        .await?,
    )?;

    let apis_informations = bytes_to_vec_of_struct::<Api>(
        fetch_daikoku_api(
            "/apis?fields=_id,_humanReadableId,header,description",
            &host,
            &environment,
            &cookie,
        )
        .await?,
    )?;

    create_mail_tenant(root_mail_tenant, sources_path.clone())?;

    create_mail_folder(root_mail_user_translations, sources_path.clone(), true)?;

    create_mail_folder(mail_user_template, sources_path.clone(), false)?;

    create_api_folder(apis_informations, sources_path.clone())?;

    convert_cms_pages(new_pages, sources_path.clone())?;

    create_daikoku_hidden_files(project_path.clone())?;

    create_project(name.clone(), project_path.clone()).await?;

    create_environment(name, server, cookie).await?;

    Ok(())
}

async fn fetch_daikoku_api(
    path: &str,
    host: &String,
    environment: &Environment,
    cookie: &String,
) -> DaikokuResult<Vec<u8>> {
    let url: String = format!("{}/api{}", environment.server, &path);

    println!("fetch_daikoku_api {}", url);
    println!("{:?}", environment);
    println!("{:?}", cookie);
    println!("{:?}", host);

    println!("############");

    let req: Request<Empty<Bytes>> = Request::builder()
        .method(Method::GET)
        .uri(&url)
        .header(header::ACCEPT, "application/json")
        .header(header::HOST, &host.clone())
        .header(header::COOKIE, cookie.clone())
        .body(Empty::<Bytes>::new())
        .unwrap();

    let stream = TcpStream::connect(&host).await.map_err(|err| {
        DaikokuCliError::DaikokuErrorWithMessage("failed to join the server".to_string(), err)
    })?;
    let io = TokioIo::new(stream);

    let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
        .await
        .map_err(|err| DaikokuCliError::HyperError(err))?;

    tokio::task::spawn(async move {
        if let Err(err) = conn.await {
            logger::error(format!("Connection error {:?}", err));
        }
    });

    let upstream_resp = sender
        .send_request(req)
        .await
        .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?;

    let (
        hyper::http::response::Parts {
            headers: _, status, ..
        },
        body,
    ) = upstream_resp.into_parts();

    let status = status.as_u16();

    if status == 200 {
        Ok(frame_to_bytes_body(body).await)
    } else {
        Err(DaikokuCliError::DaikokuStrError(format!(
            "failed to reach the Daikoku server {}",
            status
        )))
    }
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

fn create_api_folder(apis: Vec<Api>, project_path: PathBuf) -> DaikokuResult<()> {
    apis.iter().for_each(|item| {
        let file_path = project_path.clone().join(
            PathBuf::from_str("apis")
                .unwrap()
                .join(item.human_readable_id.clone()),
        );

        println!("{:?}", item);

        let _ = create_path_and_file(
            file_path.clone().join(".daikoku_data"),
            format!("id:{}", item._id),
            item._id.clone(),
            HashMap::new(),
            SourceExtension::HTML,
        );

        if let Some(description) = &item.description {
            let _description = create_path_and_file(
                file_path.join("description").join("page.html").clone(),
                description.clone(),
                item._id.clone(),
                HashMap::new(),
                SourceExtension::HTML,
            );
        }

        if let Some(header) = &item.header {
            let _header = create_path_and_file(
                file_path.join("header").join("page.html").clone(),
                header.clone(),
                item._id.clone(),
                HashMap::new(),
                SourceExtension::HTML,
            );
        }
    });

    Ok(())
}

fn create_mail_tenant(mail_settings: TenantMailBody, project_path: PathBuf) -> DaikokuResult<()> {
    let filename = "page.html".to_string();

    let file_path = project_path
        .clone()
        .join(get_mail_page_path(&filename, true).unwrap());

    let _ = create_path_and_file(
        file_path,
        mail_settings
            .mailer_settings
            .map(|mailer| mailer.template.unwrap_or("".to_string()))
            .unwrap_or("".to_string()),
        filename,
        HashMap::new(),
        SourceExtension::HTML,
    );

    Ok(())
}

fn create_mail_folder(
    intl_translation: IntlTranslationBody,
    project_path: PathBuf,
    is_root_mail: bool,
) -> DaikokuResult<()> {
    intl_translation.translations.iter().for_each(|item| {
        let file_path = project_path
            .clone()
            .join(get_mail_page_path(&item._id.clone().replace(".", "-"), is_root_mail).unwrap());

        let _ = create_path_and_file(
            file_path.clone().join(".daikoku_data"),
            format!("id:{}", item._id),
            item._id.clone(),
            HashMap::new(),
            SourceExtension::HTML,
        );

        item.translations.iter().for_each(|translation| {
            let _ = create_path_and_file(
                file_path
                    .clone()
                    .join(translation.language.clone())
                    .join("page.html"),
                translation.value.clone(),
                translation._id.clone(),
                HashMap::new(),
                SourceExtension::HTML,
            );
        })
    });

    Ok(())
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

    let folder = match extension {
        SourceExtension::HTML => item.path.clone().map(|_| "pages").unwrap_or("blocks"),
        SourceExtension::CSS => "styles",
        SourceExtension::Javascript => "scripts",
        SourceExtension::JSON => "data",
    };

    let router_path = item.path.clone().map(|p| p.replace("/", "")).map(|path| {
        if path == "/" || path.is_empty() {
            item.name.clone()
        } else {
            path
        }
    });

    let folder_path = PathBuf::from_str(folder).unwrap().join(format!(
        "{}{}",
        router_path.unwrap_or(item.name.clone()),
        extension.ext()
    ));

    let parent = folder_path.parent().unwrap();

    if !parent.exists() {
        fs::create_dir_all(parent).map_err(|err| map_error_to_filesystem_error(err, ""))?;
    }

    Ok(folder_path)
}

fn create_path_and_file(
    file_buf: PathBuf,
    content: String,
    // item: &CmsPage,
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

    logger::println(format!("Creating {} {:?}", name, file_buf));

    if content_type == SourceExtension::HTML {
        if metadata.is_empty() {
            Ok(fs::write(file_buf, content)
                .map_err(|err| map_error_to_filesystem_error(err, ""))?)
        } else {
            let metadata_header = serde_yaml::to_string(&metadata).map_err(|_err| {
                DaikokuCliError::ParsingError(format!("failed parsing metadata {}", &name))
            })?;

            Ok(
                fs::write(file_buf, format!("{}\n---\n{}", metadata_header, content))
                    .map_err(|err| map_error_to_filesystem_error(err, ""))?,
            )
        }
    } else {
        Ok(fs::write(file_buf, content).map_err(|err| map_error_to_filesystem_error(err, ""))?)
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
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))
}

async fn create_project(name: String, complete_path: PathBuf) -> DaikokuResult<()> {
    process(Commands::Projects {
        command: crate::ProjectCommands::Add {
            name: name,
            path: complete_path.into_os_string().into_string().unwrap(),
            overwrite: None,
        },
    })
    .await?;
    Ok(())
}

async fn create_environment(name: String, server: String, token: String) -> DaikokuResult<()> {
    process(Commands::Environments {
        command: crate::EnvironmentsCommands::Add {
            name: name,
            server,
            token: Some(token),
            overwrite: Some(true),
            force: Some(false),
        },
    })
    .await?;
    logger::println("<green>Migration endded</>".to_string());
    Ok(())
}

fn read_summary_file(content: Vec<u8>) -> DaikokuResult<Vec<CmsPage>> {
    bytes_to_vec_of_struct::<CmsPage>(content)
}

fn bytes_to_struct<T: for<'a> Deserialize<'a>>(content: Vec<u8>) -> DaikokuResult<T> {
    let name = type_name::<T>();

    let content =
        String::from_utf8(content).map_err(|err| map_error_to_filesystem_error(err, name))?;

    let summary: T =
        serde_json::from_str(&content).map_err(|err| map_error_to_filesystem_error(err, name))?;

    Ok(summary)
}

fn bytes_to_vec_of_struct<T: for<'a> Deserialize<'a>>(content: Vec<u8>) -> DaikokuResult<Vec<T>> {
    let name = type_name::<T>();

    let content =
        String::from_utf8(content).map_err(|err| map_error_to_filesystem_error(err, name))?;

    println!("{:?}", content);

    let summary: Vec<T> =
        serde_json::from_str(&content).map_err(|err| map_error_to_filesystem_error(err, name))?;

    Ok(summary)
}

fn map_error_to_filesystem_error<T: std::error::Error>(err: T, type_name: &str) -> DaikokuCliError {
    DaikokuCliError::FileSystem(format!("{} : {}", type_name.to_string(), err.to_string()))
}
