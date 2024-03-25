use std::{
    fs::{self, File},
    io::Read,
    path::PathBuf,
    str::FromStr,
};

use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    utils::{absolute_path, frame_to_bytes_body},
    AssetsCommands,
};

use async_recursion::async_recursion;
use bytes::Bytes;

use http_body_util::{Empty, Full};
use hyper::{header, Request};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;
use walkdir::WalkDir;

use super::{
    enviroments::{get_default_environment, read_cookie_from_environment},
    projects::{self, get_default_project},
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
        AssetsCommands::Add {
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

    let cookie = read_cookie_from_environment(true)?;

    let url: String = format!(
        "{}/tenant-assets/{}",
        environment.server,
        slug::slugify(filename.clone()),
    );

    let req = Request::head(&url)
        .header(header::HOST, &host)
        .header(header::COOKIE, cookie)
        .body(Empty::<Bytes>::new())
        .expect("failed to build a request");

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

    let status = upstream_resp.status();

    println!("{:?}", status);
    if status == 303 {
        Err(DaikokuCliError::DaikokuStrError(
            "Whoops, your token has expired. daikokucli login --token is required".to_string(),
        ))
    } else if status != 404 {
        Err(DaikokuCliError::DaikokuStrError(
            "resource already exists".to_string(),
        ))
    } else {
        Ok(())
    }
}

#[async_recursion]
async fn add(
    filename: String,
    title: String,
    desc: String,
    path: Option<String>,
    slug: Option<String>,
) -> DaikokuResult<()> {
    logger::loading("<yellow>Creating</> new assets".to_string());

    exists(match &slug {
        Some(s) => s.clone(),
        None => filename.clone(),
    })
    .await?;

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let cookie = read_cookie_from_environment(true)?;

    let url: String = format!(
        "{}/tenant-assets?filename={}&title={}&desc={}&slug={}",
        environment.server,
        filename.clone(),
        title,
        desc,
        slug.unwrap_or("".to_string())
    );

    let project = get_default_project()?;

    let mut file = File::open(
        PathBuf::from_str(&project.path)
            .unwrap()
            .join("assets")
            .join(path.unwrap_or("".to_string()))
            .join(filename),
    )
    .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?;

    let mut contents = Vec::new();
    let _ = file
        .read_to_end(&mut contents)
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()));

    let req = Request::post(&url)
        .header(header::HOST, &host)
        .header(header::COOKIE, cookie)
        .body(Full::new(Bytes::from(contents)))
        .expect("failed to build a request");

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
        let zip_bytes: Vec<u8> = frame_to_bytes_body(body).await;

        println!("{:?}", String::from_utf8(zip_bytes).unwrap());

        Ok(())
    } else {
        Err(DaikokuCliError::DaikokuStrError(format!(
            "failed to reach the Daikoku server {}",
            status
        )))
    }
}

async fn remove(filename: String, path: Option<String>, slug: Option<String>) -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Removing</> {} asset", filename));

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let cookie = read_cookie_from_environment(true)?;

    let url: String = format!(
        "{}/tenant-assets/{}",
        environment.server,
        slug.unwrap_or(slug::slugify(filename.clone()))
    );

    let req = Request::delete(&url)
        .header(header::HOST, &host)
        .header(header::COOKIE, cookie)
        .body(Empty::<Bytes>::new())
        .expect("failed to build a request");

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
        _body,
    ) = upstream_resp.into_parts();

    let status = status.as_u16();

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
    logger::loading(format!("<yellow>Retrieving</> assets"));

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let cookie = read_cookie_from_environment(true)?;

    let url: String = format!("{}/tenant-assets/slugified", environment.server);

    let req = Request::get(&url)
        .header(header::HOST, &host)
        .header(header::COOKIE, cookie)
        .body(Empty::<Bytes>::new())
        .expect("failed to build a request");

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
        let bytes = frame_to_bytes_body(body).await;

        let assets: String = String::from_utf8(bytes).map_err(|_err| {
            DaikokuCliError::ParsingError("failed to convert assets body".to_string())
        })?;

        let assets: Vec<Asset> = serde_json::from_str(&assets).map_err(|_err| {
            DaikokuCliError::ParsingError("failed to convert assets body".to_string())
        })?;

        assets
            .iter()
            .for_each(|asset| logger::println(asset.slug.clone()));

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

    let project = projects::get_default_project()?;

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

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let cookie = read_cookie_from_environment(true)?;

    let url: String = format!("{}/tenant-assets/bulk", environment.server,);

    let files = pages
        .iter()
        .map(|page| File::open(page.path.clone().unwrap()).unwrap())
        .collect::<Vec<File>>();

    let contents = pages
        .iter()
        .enumerate()
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

    let req = Request::post(&url)
        .header(header::HOST, &host)
        .header(header::COOKIE, cookie)
        .body(Full::new(Bytes::from(
            serde_json::to_string(&contents).map_err(|_err| {
                DaikokuCliError::ParsingError("failed to convert assets to json array".to_string())
            })?,
        )))
        .expect("failed to build a request");

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
        _body,
    ) = upstream_resp.into_parts();

    let status = status.as_u16();

    if status == 200 {
        logger::success("synchronization done".to_string());
        list().await
    } else {
        Err(DaikokuCliError::DaikokuStrError(format!(
            "failed to reach the Daikoku server {}",
            status
        )))
    }
}
