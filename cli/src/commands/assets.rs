use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    str::FromStr,
};

use crate::{
    helpers::daikoku_cms_api_post,
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    utils::absolute_path,
    AssetsCommands,
};

use bytes::Bytes;

use hyper::header;
use mime_guess::mime;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use super::{
    cms::{self, get_default_project},
    environments::{get_default_environment, read_apikey_from_secrets},
};

#[derive(Deserialize, Serialize, Debug)]
struct Asset {
    slug: String,
    filename: Option<String>,
    path: Option<String>,
    content: Option<Vec<u8>>,
}

pub(crate) async fn run(command: AssetsCommands) -> DaikokuResult<()> {
    match command {
        AssetsCommands::Push {
            filename,
            title,
            desc,
            path,
            slug,
        } => {
            add(
                filename,
                title,
                desc,
                path.map(|p| absolute_path(p).unwrap()),
                slug,
            )
            .await
        }
        AssetsCommands::Remove {
            filename,
            path,
            slug,
        } => remove(filename, path.map(|p| absolute_path(p).unwrap()), slug).await,
        AssetsCommands::List {} => list().await,
        AssetsCommands::Sync {} => sync().await,
    }
}

async fn exists(filename: String) -> DaikokuResult<()> {
    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let apikey = read_apikey_from_secrets(true)?;

    let url: String = format!(
        "{}/tenant-assets/{}",
        environment.server,
        slug::slugify(filename.clone()),
    );

    let resp = reqwest::Client::new()
        .head(url)
        .header(header::HOST, host)
        .header(header::AUTHORIZATION, format!("Basic {}", apikey))
        .send()
        .await
        .map_err(|err| DaikokuCliError::DaikokuStrError(err.to_string()))?;

    let status = resp.status().as_u16();

    if status == 303 {
        Err(DaikokuCliError::DaikokuStrError(
            "Whoops, your session has expired. daikoku login is required".to_string(),
        ))
    } else if status != 404 {
        Err(DaikokuCliError::DaikokuStrError(
            "resource already exists".to_string(),
        ))
    } else {
        Ok(())
    }
}

async fn add(
    filename: String,
    title: String,
    desc: String,
    path: Option<String>,
    slug: Option<String>,
) -> DaikokuResult<()> {
    logger::loading("<yellow>Creating and pushing</> new assets".to_string());

    exists(match &slug {
        Some(s) => s.clone(),
        None => filename.clone(),
    })
    .await?;

    let url: String = format!(
        "/tenant-assets?filename={}&title={}&desc={}&slug={}",
        filename.clone(),
        title,
        desc,
        slug.unwrap_or("".to_string())
    );

    let project = get_default_project()?;

    let filepath = PathBuf::from_str(&project.path)
        .unwrap()
        .join("assets")
        .join(path.unwrap_or("".to_string()))
        .join(filename);
    let mut file =
        File::open(filepath.clone()).map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?;

    let mut contents = Vec::new();
    let _ = file
        .read_to_end(&mut contents)
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()));

    let content_type = mime_guess::from_path(filepath.to_string_lossy().into_owned())
        .first()
        .unwrap_or(mime::APPLICATION_OCTET_STREAM);

    let _ = daikoku_cms_api_post(&url, Bytes::from(contents), false, Some(content_type)).await?;

    logger::success("New asset has been pushed".to_string());

    Ok(())
}

async fn remove(filename: String, path: Option<String>, slug: Option<String>) -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Removing</> {} asset", filename));

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let apikey = read_apikey_from_secrets(true)?;

    let url: String = format!(
        "{}/cms-api/tenant-assets/{}",
        environment.server,
        slug.unwrap_or(slug::slugify(filename.clone()))
    );

    let req = reqwest::Client::new()
        .delete(url)
        .header(header::HOST, host)
        .header(header::AUTHORIZATION, format!("Basic {}", apikey))
        .send()
        .await
        .map_err(|err| DaikokuCliError::DaikokuStrError(err.to_string()))?;

    let status = req.status().as_u16();

    if status == 200 {
        let project = get_default_project()?;

        fs::remove_file(
            PathBuf::from_str(&project.path)
                .unwrap()
                .join("assets")
                .join(path.unwrap_or("".to_string()))
                .join(filename),
        )
        .map_err(|_err| DaikokuCliError::FileSystem("failed to remove local file".to_string()))
    } else {
        Err(DaikokuCliError::DaikokuStrError(format!(
            "failed to reach the Daikoku server {}",
            status
        )))
    }
}

async fn list() -> DaikokuResult<()> {
    logger::loading(format!(
        "<yellow>Retrieving</> assets, limited to those identified by slugs."
    ));

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let apikey = read_apikey_from_secrets(true)?;

    let url: String = format!("{}/cms-api/tenant-assets/slugified", environment.server);

    let req = reqwest::Client::new()
        .get(url)
        .header(header::HOST, host)
        .header(header::AUTHORIZATION, format!("Basic {}", apikey))
        .send()
        .await
        .map_err(|err| DaikokuCliError::DaikokuStrError(err.to_string()))?;

    let status = req.status().as_u16();

    if status == 200 {
        let bytes = req
            .bytes()
            .await
            .map_err(|err| DaikokuCliError::DaikokuStrError(err.to_string()))?;

        let assets: String = String::from_utf8(bytes.to_vec()).map_err(|_err| {
            DaikokuCliError::ParsingError("failed to convert assets body".to_string())
        })?;

        let assets: Vec<Asset> = serde_json::from_str(&assets).map_err(|_err| {
            DaikokuCliError::ParsingError("failed to convert assets body".to_string())
        })?;

        assets
            .iter()
            .for_each(|asset| logger::println(asset.slug.clone()));

        if assets.is_empty() {
            logger::println("no assets found".to_string());
        }

        logger::success("".to_string());

        Ok(())
    } else {
        Err(DaikokuCliError::DaikokuStrError(format!(
            "failed to reach the Daikoku server {}",
            status
        )))
    }
}

async fn sync() -> DaikokuResult<()> {
    logger::loading("<yellow>Syncing</> assets folder".to_string());

    let project = cms::get_default_project()?;

    let mut pages: Vec<Asset> = Vec::new();

    for entry in WalkDir::new(PathBuf::from(project.path).join("assets"))
        .into_iter()
        .filter_map(Result::ok)
    {
        let f_name = String::from(entry.file_name().to_string_lossy());

        if !f_name.contains("DS_Store") && entry.metadata().unwrap().is_file() {
            let new_file = Asset {
                path: Some(
                    entry
                        .clone()
                        .into_path()
                        .into_os_string()
                        .into_string()
                        .map_err(|_err| {
                            DaikokuCliError::FileSystem(format!(
                                "failed reading asset path {}",
                                f_name.clone()
                            ))
                        })?,
                ),
                slug: slug::slugify(f_name.clone()),
                filename: Some(f_name),
                content: None,
            };
            pages.push(new_file);
        }
    }

    let files = pages
        .iter()
        .map(|page| File::open(page.path.clone().unwrap()).unwrap())
        .collect::<Vec<File>>();

    let contents = pages
        .iter()
        .enumerate()
        .filter(|(_idx, page)| {
            page.filename
                .clone()
                .map(|filename| !filename.starts_with("."))
                .unwrap_or(false)
        })
        .map(|(idx, page)| {
            let mut content = Vec::new();
            let _ = files.get(idx).unwrap().read_to_end(&mut content).unwrap();
            Asset {
                content: Some(content),
                filename: page.filename.clone(),
                path: page.path.clone(),
                slug: page.slug.clone(),
            }
        })
        .collect::<Vec<Asset>>();

    if contents.is_empty() {
        logger::println("already up to date".to_string());
        logger::done();
        return Ok(());
    }

    let _resp: Vec<u8> = daikoku_cms_api_post(
        "/tenant-assets/bulk",
        Bytes::from(serde_json::to_string(&contents).map_err(|_err| {
            DaikokuCliError::ParsingError("failed to convert assets to json array".to_string())
        })?),
        false,
        None
    )
    .await?;

    logger::success("synchronization done".to_string());
    list().await
}
