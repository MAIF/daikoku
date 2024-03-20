use std::{fs::File, io::Read, path::PathBuf, str::FromStr};

use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    utils::frame_to_bytes_body,
    AssetsCommands,
};

use async_recursion::async_recursion;
use bytes::Bytes;

use http_body_util::Full;
use hyper::{header, Request};
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;

use super::{
    enviroments::{get_default_environment, read_cookie_from_environment},
    projects::get_default_project,
};

pub(crate) async fn run(command: AssetsCommands) -> DaikokuResult<()> {
    match command {
        AssetsCommands::Add {
            filename,
            title,
            desc,
            path,
        } => add(filename, title, desc, path).await,
        AssetsCommands::Remove { filename } => remove(filename),
        AssetsCommands::List {} => list(),
    }
}

#[async_recursion]
async fn add(filename: String, title: String, desc: String, path: String) -> DaikokuResult<()> {
    logger::loading("<yellow>Creating</> new assets".to_string());

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let cookie = read_cookie_from_environment()?;

    let url: String = format!(
        "{}/tenant-assets?filename={}&title={}&desc={}",
        environment.server,
        filename.clone(),
        title,
        desc
    );

    let project = get_default_project()?;

    println!(
        "{:?}",
        PathBuf::from_str(&project.path)
            .unwrap()
            .join("assets")
            .join(path.clone())
            .join(filename.clone())
    );

    let mut file = File::open(
        PathBuf::from_str(&project.path)
            .unwrap()
            .join("assets")
            .join(path)
            .join(filename),
    )
    .map_err(|err| DaikokuCliError::FileSystem(err.to_string()))?;

    let mut contents = Vec::new();
    let _ = file
        .read_to_end(&mut contents)
        .map_err(|err| DaikokuCliError::FileSystem(err.to_string()));

    let req = Request::post(&url)
        .header(header::HOST, &host)
        .header(header::COOKIE, format!("daikoku-session={}", cookie))
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

fn remove(filename: String) -> DaikokuResult<()> {
    Ok(())
}

fn list() -> DaikokuResult<()> {
    Ok(())
}
