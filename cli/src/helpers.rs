use std::any::type_name;

use bytes::{Buf, Bytes};
use http_body_util::{Empty, Full};
use hyper::{header, Method, Request};
use hyper_util::rt::TokioIo;
use serde::Deserialize;
use tokio::net::TcpStream;

use crate::{
    commands::enviroments::Environment,
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    utils::frame_to_bytes_body,
};

pub(crate) fn bytes_to_struct<T: for<'a> Deserialize<'a>>(content: Vec<u8>) -> DaikokuResult<T> {
    let name = type_name::<T>();

    let content =
        String::from_utf8(content).map_err(|err| map_error_to_filesystem_error(err, name))?;

    let summary: T =
        serde_json::from_str(&content).map_err(|err| map_error_to_filesystem_error(err, name))?;

    Ok(summary)
}

pub(crate) fn bytes_to_vec_of_struct<T: for<'a> Deserialize<'a>>(
    content: Vec<u8>,
) -> DaikokuResult<Vec<T>> {
    let name = type_name::<T>();

    let content =
        String::from_utf8(content).map_err(|err| map_error_to_filesystem_error(err, name))?;

    let summary: Vec<T> =
        serde_json::from_str(&content).map_err(|err| map_error_to_filesystem_error(err, name))?;

    Ok(summary)
}

pub(crate) async fn post_daikoku_api<T: Buf + std::marker::Send + 'static>(
    path: &str,
    host: &String,
    environment: &Environment,
    cookie: &String,
    body: T,
) -> DaikokuResult<Vec<u8>> {
    let url: String = format!("{}/api{}", environment.server, &path);

    let req: Request<Full<T>> = Request::builder()
        .method(Method::POST)
        .uri(&url)
        .header(header::HOST, host)
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

    if status < 300 {
        Ok(frame_to_bytes_body(body).await)
    } else {
        Err(DaikokuCliError::DaikokuStrError(format!(
            "failed to reach the Daikoku server {}",
            status
        )))
    }
}

pub(crate) async fn get_daikoku_api(
    path: &str,
    host: &String,
    environment: &Environment,
    cookie: &String,
) -> DaikokuResult<Vec<u8>> {
    let url: String = format!("{}/api{}", environment.server, &path);

    let req = Request::builder()
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

pub(crate) fn map_error_to_filesystem_error<T: std::error::Error>(
    err: T,
    type_name: &str,
) -> DaikokuCliError {
    DaikokuCliError::FileSystem(format!("{} : {}", type_name.to_string(), err.to_string()))
}
