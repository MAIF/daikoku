use std::any::type_name;

use bytes::Buf;
use hyper::header;
use serde::Deserialize;

use crate::{
    commands::enviroments::{get_default_environment, read_apikey_from_secrets},
    logging::error::{DaikokuCliError, DaikokuResult},
};

#[derive(Debug)]
pub(crate) struct CmsApiResponse<T> {
    pub(crate) status: u16,
    pub(crate) response: T,
}

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

pub(crate) async fn daikoku_cms_api_post<T: Buf + std::marker::Send + 'static>(
    path: &str,
    body: T,
) -> DaikokuResult<Vec<u8>>
where
    reqwest::Body: From<T>,
{
    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let apikey = read_apikey_from_secrets(true)?;

    let url: String = format!("{}/cms-api{}", environment.server, &path);

    let resp = reqwest::Client::new()
        .post(url)
        .header(header::HOST, host)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Basic {}", apikey))
        .body(body)
        .send()
        .await
        .map_err(|err| DaikokuCliError::DaikokuStrError(err.to_string()))?;

    let status = resp.status().as_u16();

    if status < 300 {
        Ok(resp
            .bytes()
            .await
            .map_err(|err| DaikokuCliError::DaikokuStrError(err.to_string()))?
            .to_vec())
    } else {
        Err(DaikokuCliError::DaikokuStrError(format!(
            "failed to reach the Daikoku server {}",
            status
        )))
    }
}

pub(crate) async fn raw_daikoku_cms_api_get(
    path: &str,
    server: &String,
    apikey: &String,
) -> DaikokuResult<CmsApiResponse<Vec<u8>>> {
    let host = server.replace("http://", "").replace("https://", "");

    daikoku_cms_api_get_internal(path, &server, &apikey, &host).await
}

pub(crate) async fn daikoku_cms_api_get(path: &str) -> DaikokuResult<CmsApiResponse<Vec<u8>>> {
    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let apikey = read_apikey_from_secrets(true)?;

    daikoku_cms_api_get_internal(path, &environment.server, &apikey, &host).await
}

async fn daikoku_cms_api_get_internal(
    path: &str,
    server: &String,
    apikey: &String,
    host: &String,
) -> DaikokuResult<CmsApiResponse<Vec<u8>>> {
    let url: String = format!("{}/cms-api{}", server, &path);

    let resp = reqwest::Client::new()
        .get(url)
        .header(header::HOST, host)
        .header(header::AUTHORIZATION, format!("Basic {}", apikey))
        .send()
        .await
        .map_err(|err| DaikokuCliError::DaikokuStrError(err.to_string()))?;

    Ok(CmsApiResponse {
        status: resp.status().as_u16(),
        response: resp
            .bytes()
            .await
            .map_err(|err| DaikokuCliError::DaikokuStrError(err.to_string()))?
            .to_vec(),
    })
}

pub(crate) fn map_error_to_filesystem_error<T: std::error::Error>(
    err: T,
    type_name: &str,
) -> DaikokuCliError {
    DaikokuCliError::FileSystem(format!("{} : {}", type_name.to_string(), err.to_string()))
}
