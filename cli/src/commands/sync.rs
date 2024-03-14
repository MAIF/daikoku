use std::path::PathBuf;

use bytes::Bytes;
use http_body_util::Full;
use hyper::{header, Method, Request};
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;

use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    models::folder::read_contents,
    utils::frame_to_bytes_body,
};

use super::{enviroments::{get_default_environment, read_cookie_from_environment}, projects};

pub(crate) async fn run() -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Syncing</> project"));
    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let url: String = format!("{}/api/cms/sync", environment.server);

    let project = projects::get_default_project()?;

    let body = read_contents(&PathBuf::from(&project.path))?;

    let body = Bytes::from(
        serde_json::to_string(&body)
            .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?,
    );

    let cookie = read_cookie_from_environment()?;
    
    let req = Request::builder()
        .method(Method::POST)
        .uri(&url)
        .header(header::HOST, &host)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, format!("daikoku-session={}", cookie))
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
            String::from_utf8(bytes_body).unwrap().as_str().replace("\n", "")
        ));
    }

    Ok(())
}
