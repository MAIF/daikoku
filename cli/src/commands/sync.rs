use std::path::PathBuf;

use bytes::Bytes;
use http_body_util::Full;
use hyper::{header, Method, Request};
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;

use crate::{
    helpers::post_daikoku_api,
    interactive::prompt,
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    models::folder::{read_contents, read_sources, read_sources_and_daikoku_metadata, CmsFile},
    utils::frame_to_bytes_body,
};

use super::{
    enviroments::{get_daikokuignore, get_default_environment, read_cookie_from_environment},
    projects,
};

pub(crate) async fn run() -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Syncing</> project"));
    logger::done();

    logger::info("What kind of synchronization ? Only write the identifier.".to_string());
    logger::info("ID - Description".to_string());
    logger::info(" 1 - Global".to_string());
    logger::info(" 2 - Documentation page".to_string());
    logger::info(" 3 - API page".to_string());
    logger::info(" 4 - Mail page".to_string());

    let identifier = prompt()?;

    match identifier.trim() {
        "1" => global_synchronization().await,
        "2" => documentation_synchronization().await,
        "3" => api_synchronization().await,
        "4" => mail_synchronization().await,
        _ => Err(DaikokuCliError::ParsingError(
            "Invalid identifier".to_string(),
        )),
    }
}

async fn global_synchronization() -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Syncing</> project"));
    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let url: String = format!("{}/api/cms/sync", environment.server);

    let project = projects::get_default_project()?;

    let mut body = read_contents(&PathBuf::from(&project.path))?;

    apply_daikoku_ignore(&mut body)?;

    let body = Bytes::from(
        serde_json::to_string(&body)
            .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?,
    );

    let cookie = read_cookie_from_environment(true)?;

    let req = Request::builder()
        .method(Method::POST)
        .uri(&url)
        .header(header::HOST, &host)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, cookie)
        .body(Full::new(body))
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

    if status == 204 {
        logger::success("synchronization done".to_string());
    } else {
        let bytes_body: Vec<u8> = frame_to_bytes_body(body).await;

        logger::error(format!(
            "failed to sync project : {:?}",
            String::from_utf8(bytes_body)
                .unwrap()
                .as_str()
                .replace("\n", "")
        ));
    }

    Ok(())
}

async fn documentation_synchronization() -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Syncing</> documentation"));

    Ok(())
}

async fn api_synchronization() -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Syncing</> API"));

    Ok(())
}

fn apply_daikoku_ignore(items: &mut Vec<CmsFile>) -> DaikokuResult<()> {
    let daikoku_ignore = get_daikokuignore()?;

    let rules: Vec<&String> = daikoku_ignore
        .iter()
        .filter(|line| !line.is_empty())
        .collect::<Vec<&String>>();

    if !rules.is_empty() {
        logger::println("Excluded files and folders".to_string());
    }

    items.retain(|file| {
        let retained = daikoku_ignore
            .iter()
            .filter(|line| !line.is_empty())
            .find(|&line| {
                line == &file.name || line == &file.path() || file.path().starts_with(line)
            })
            .is_none();

        if !retained {
            logger::println(file.name.to_string());
        }

        retained
    });

    Ok(())
}

async fn mail_synchronization() -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Syncing</> mail"));

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let cookie = read_cookie_from_environment(true)?;

    let project = projects::get_default_project()?;

    let mail_path = PathBuf::from(project.path).join("src").join("mails");

    let mut body = read_sources_and_daikoku_metadata(mail_path)?;

    apply_daikoku_ignore(&mut body)?;

    let body = Bytes::from(
        serde_json::to_string(&body)
            .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?,
    );

    post_daikoku_api("/cms/sync", &host, &environment, &cookie, body).await?;

    Ok(())
}
