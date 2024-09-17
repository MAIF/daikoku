use std::process::exit;

use async_recursion::async_recursion;
use base64::engine::general_purpose;
use base64::Engine;
use http_body_util::Full;
use hyper::body::Bytes;
use hyper::header::{self, COOKIE};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response};

use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;

use crate::helpers::{bytes_to_struct, daikoku_cms_api_get};
use crate::logging::error::{DaikokuCliError, DaikokuResult};
use crate::logging::logger::{self};
use crate::{process, Commands};

use super::enviroments::{can_join_daikoku, get_default_environment};
use super::watch::SESSION_EXPIRED;

#[derive(Clone, Deserialize, Serialize, Debug)]
struct LoginResponse {
    token: String,
}

#[async_recursion]
pub(crate) async fn run() -> DaikokuResult<()> {
    let environment = get_default_environment()?;

    let _ = can_join_daikoku(&environment.server, None).await?;

    let port = std::env::var("WATCHING_PORT").unwrap_or("3334".to_string());

    logger::loading(format!("<yellow>Listening</> on {}", port));

    let listener = TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();

    let environment = get_default_environment()?;

    let host = environment.server;

    let response: LoginResponse =
        bytes_to_struct::<LoginResponse>(daikoku_cms_api_get("/cli/login").await?.response)?;

    let redirect = general_purpose::STANDARD_NO_PAD
        .encode(format!("http://localhost:{}?token={}", port, response.token).as_bytes());

    webbrowser::open(&format!(
        "{}/cms-api/cli/redirect?redirect={}",
        host, redirect
    ))
    .expect("Failed to open a new browser tab");

    loop {
        match listener.accept().await {
            Err(err) => logger::error(format!("{}", err.to_string())),
            Ok((stream, _)) => {
                let io = TokioIo::new(stream);

                tokio::task::spawn(async move {
                    if let Err(err) = http1::Builder::new()
                        .serve_connection(io, service_fn(|req| watcher(req)))
                        .await
                    {
                        logger::error(format!("Error serving connection {:?}", err));
                    }
                });
            }
        };
    }
}

async fn watcher(
    req: Request<hyper::body::Incoming>,
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    match (req.method(), req.uri().path()) {
        (&Method::OPTIONS, _) => Ok(Response::builder()
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            .header(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization",
            )
            .body(http_body_util::Full::new(Bytes::from("")))
            .unwrap()),
        _ => {
            let headers = req.headers();

            if let Some(cookie_header) = headers.get_all(COOKIE).iter().next() {
                if let Ok(cookie_value) = cookie_header.to_str() {
                    process(Commands::Environments {
                        command: crate::EnvironmentsCommands::Config {
                            cookie: Some(cookie_value.to_string()),
                            apikey: None,
                        },
                    })
                    .await?;
                }
            }

            logger::println("Everything is configured. Run daikoku watch".to_string());

            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(2000));
                std::process::exit(0);
            });

            Ok(Response::builder()
                .header(header::CONTENT_TYPE, "text/html")
                .header("Access-Control-Allow-Origin", "*")
                .body(Full::new(Bytes::from(
                    String::from_utf8(SESSION_EXPIRED.to_vec())
                        .unwrap()
                        .replace(
                        "{{message}}",
                        "You've successfully log in. You can close the tab and start using the CMS",
                    ),
                )))
                .unwrap())
        }
    }
}
