use std::time::Duration;
use std::{process, thread};

use async_recursion::async_recursion;
use http_body_util::Full;
use hyper::body::Bytes;
use hyper::header::{self, COOKIE};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};

use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;

use crate::logging::error::{DaikokuCliError, DaikokuResult};
use crate::logging::logger::{self};
use crate::{process, Commands};

use super::enviroments::{can_join_daikoku, get_default_environment};
use super::watch::SESSION_EXPIRED;

#[async_recursion]
pub(crate) async fn run(token: Option<String>) -> DaikokuResult<()> {
    match token {
        Some(token) => {
            process(Commands::Environments {
                command: crate::EnvironmentsCommands::PathDefault { token },
            })
            .await?;
            Ok(())
        }
        None => {
            let environment = get_default_environment()?;

            let _ = can_join_daikoku(&environment.server).await?;

            let port = std::env::var("WATCHING_PORT").unwrap_or("3334".to_string());

            logger::loading(format!("<yellow>Listening</> on {}", port));

            let listener = TcpListener::bind(format!("0.0.0.0:{}", port))
                .await
                .unwrap();

            let environment = get_default_environment()?;

            let host = environment.server;

            webbrowser::open(&format!(
                "{}/cli/login?redirect=http://localhost:{}",
                host, port
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
    }
}

async fn watcher(
    req: Request<hyper::body::Incoming>,
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    let headers = req.headers();

    if let Some(cookie_header) = headers.get_all(COOKIE).iter().next() {
        if let Ok(cookie_value) = cookie_header.to_str() {
            process(Commands::Environments {
                command: crate::EnvironmentsCommands::PathDefault {
                    token: cookie_value.to_string(),
                },
            })
            .await?;
        }
    }

    thread::spawn(move || {
        thread::sleep(Duration::from_millis(15000));
        process::exit(1);
    });

    logger::println("Everything is configured. Run daikokucli watch".to_string());

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "text/html")
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
