use std::io::Read;
use std::path::PathBuf;
use std::str::FromStr;

use http_body_util::{BodyExt, Empty, Full};
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{header, Method};
use hyper::{Request, Response};

use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};

use tokio::net::{TcpListener, TcpStream};

use crate::logging::error::{DaikokuCliError, DaikokuResult};
use crate::logging::logger::{self};
use crate::models::folder::{read_contents, CmsFile, SourceExtension, UiCmsFile};
use crate::utils::frame_to_bytes_body;

use super::enviroments::{
    can_join_daikoku, check_environment_from_str, read_cookie_from_environment, Environment,
};
use super::projects::{self};

const SESSION_EXPIRED: &[u8] = include_bytes!("../../templates/session_expired.html");
const MANAGER_PAGE: &[u8] = include_bytes!("../../templates/manager.html");

#[derive(Debug)]
struct RouterCmsPage {
    exact: bool,
    path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub(crate) struct Summary {
    pub(crate) pages: Vec<CmsFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct CmsRequestRendering {
    content: Vec<CmsFile>,
    current_page: String,
}

pub(crate) async fn run(incoming_environment: Option<String>) -> DaikokuResult<()> {
    let environment = check_environment_from_str(incoming_environment.clone())?;

    let _ = can_join_daikoku(&environment.server).await?;

    let port = std::env::var("WATCHING_PORT").unwrap_or("3333".to_string());
    logger::loading(format!("<yellow>Listening</> on {}", port));

    let listener = TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();

    loop {
        let environment = environment.clone();
        {
            match listener.accept().await {
                Err(err) => logger::error(format!("{}", err.to_string())),
                Ok((stream, _)) => {
                    let io = TokioIo::new(stream);

                    tokio::task::spawn(async move {
                        if let Err(err) = http1::Builder::new()
                            .serve_connection(io, service_fn(|req| watcher(req, &environment)))
                            .await
                        {
                            println!("Error serving connection: {:?}", err);
                        }
                    });
                }
            };
        }
    }
}

fn read_cms_pages() -> DaikokuResult<Summary> {
    Ok(Summary {
        pages: read_contents(&PathBuf::from(projects::get_default_project()?.path))?,
    })
}

async fn watcher(
    req: Request<hyper::body::Incoming>,
    environment: &Environment,
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    let uri = req.uri().path().to_string();

    if uri.starts_with("/api/") || uri.starts_with("/tenant-assets/") {
        println!("forward to api or /tenant-assets");
        forward_api_call(uri, req, environment).await
    } else {
        let path = uri.replace("_/", "");

        let root_source = req
            .uri()
            .query()
            .map(|queries| queries.contains("root_source"))
            .unwrap_or(false);

        logger::println(format!("<green>Request received</> {}", &path));

        let Summary { pages } = read_cms_pages()?;

        let mut router_pages = vec![];

        pages.iter().for_each(|p| {
            router_pages.push(RouterCmsPage {
                exact: p.exact(),
                path: p.path(),
            })
        });

        match pages.iter().find(|page| page.path() == path) {
            Some(page) => render_page(page, path, environment, root_source).await,
            None => {
                let strict_page = get_matching_routes(&path, get_pages(&router_pages, true), true);

                let result_page = if !strict_page.is_empty() {
                    strict_page
                } else {
                    get_matching_routes(&path, get_pages(&router_pages, false), false)
                };

                if result_page.is_empty() {
                    Ok(Response::new("404 page not found".into()))
                } else {
                    match result_page.iter().nth(0) {
                        None => match pages.iter().find(|p| p.path() == "/404") {
                            Some(page) => render_page(page, path, environment, root_source).await,
                            None => Ok(Response::new("404 page not found".into())),
                        },
                        Some(res) => {
                            render_page(
                                pages.iter().find(|p| p.path() == res.path).unwrap(),
                                path,
                                environment,
                                root_source,
                            )
                            .await
                        }
                    }
                }
            }
        }
    }
}

async fn forward_api_call(
    uri: String,
    mut req: Request<hyper::body::Incoming>,
    environment: &Environment,
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let method = req.method().to_string();

    let url: String = format!("{}{}", environment.server, uri);

    println!("forward to {}", url);

    let cookie = read_cookie_from_environment()?;

    let raw_req = Request::builder()
        .method(Method::from_str(&method).unwrap())
        .uri(&url)
        .header(header::HOST, &host)
        .header(header::COOKIE, format!("daikoku-session={}", cookie));

    let req = if method == "GET" {
        raw_req.body(Empty::<Bytes>::new().boxed()).unwrap()
    } else {
        let mut result: Vec<u8> = Vec::new();

        while let Some(next) = req.frame().await {
            let frame = next.unwrap();
            if let Ok(chunk) = frame.into_data() {
                for b in chunk.bytes() {
                    (result).push(b.unwrap().clone());
                }
            }
        }
        let body = Full::new(hyper::body::Bytes::from(result)).boxed();
        raw_req
            .header(header::CONTENT_TYPE, "application/json")
            .body(body)
            .unwrap()
    };

    let stream = TcpStream::connect(&host)
        .await
        .map_err(|err| DaikokuCliError::DaikokuError(err))?;
    let io = TokioIo::new(stream);

    let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
        .await
        .map_err(|err| DaikokuCliError::HyperError(err))?;

    tokio::task::spawn(async move {
        if let Err(err) = conn.await {
            println!("Connection error: {:?}", err);
        }
    });

    let upstream_resp = sender.send_request(req).await.map_err(|err| {
        println!("{:?}", err);

        DaikokuCliError::ParsingError(err.to_string())
    })?;

    let (
        hyper::http::response::Parts {
            headers: _, status, ..
        },
        body,
    ) = upstream_resp.into_parts();

    let result: Vec<u8> = frame_to_bytes_body(body).await;

    let status = status.as_u16();

    if status >= 300 && status < 400 {
        Ok(Response::new(Full::new(Bytes::from(
            "Authentication needed! Refresh this page once done",
        ))))
    } else {
        let response = Response::builder()
            .body(Full::new(Bytes::from(result)))
            .unwrap();

        Ok(response)
    }
}

async fn render_page(
    page: &CmsFile,
    watch_path: String,
    environment: &Environment,
    root_source: bool,
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    logger::println(format!(
        "<green>Serve page</> {} {}",
        page.path(),
        page.name
    ));

    let project = projects::get_default_project()?;

    let content = read_contents(&PathBuf::from(&project.path))?;

    let body_obj = CmsRequestRendering {
        content: content.clone(),
        current_page: page.path().clone(),
    };

    let body = Bytes::from(
        serde_json::to_string(&body_obj)
            .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?,
    );

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let url: String = format!(
        "{}/_{}?force_reloading=true",
        environment.server, watch_path
    );

    let mut builder = Request::builder()
        .method(Method::POST)
        .uri(&url)
        .header(header::HOST, &host)
        .header(header::CONTENT_TYPE, "application/json");

    // if page.authenticated() {
    match read_cookie_from_environment() {
        Ok(cookie) => {
            builder = builder.header(header::COOKIE, format!("daikoku-session={}", cookie))
        }
        Err(err) => {
            return Ok(Response::builder()
                .header(header::CONTENT_TYPE, "text/html")
                .body(Full::new(Bytes::from(
                    String::from_utf8(SESSION_EXPIRED.to_vec())
                        .unwrap()
                        .replace("{{message}}", err.to_string().as_str()),
                )))
                .unwrap())
        }
    }
    // }
    let req = builder.body(Full::new(body)).unwrap();

    let stream = TcpStream::connect(&host)
        .await
        .map_err(|err| DaikokuCliError::DaikokuError(err))?;
    let io = TokioIo::new(stream);

    let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
        .await
        .map_err(|err| DaikokuCliError::HyperError(err))?;

    tokio::task::spawn(async move {
        if let Err(err) = conn.await {
            println!("Connection error: {:?}", err);
        }
    });

    logger::println(format!("<green>Query</> server {}", page.name));

    let upstream_resp = sender.send_request(req).await.map_err(|err| {
        println!("{:?}", err);

        DaikokuCliError::ParsingError(err.to_string())
    })?;

    let (
        hyper::http::response::Parts {
            headers: _, status, ..
        },
        body,
    ) = upstream_resp.into_parts();

    let result: Vec<u8> = frame_to_bytes_body(body).await;

    let status = status.as_u16();

    if status == 303 {
        Ok(Response::builder()
            .header(header::CONTENT_TYPE, "text/html")
            .body(Full::new(Bytes::from(
                String::from_utf8(SESSION_EXPIRED.to_vec())
                    .unwrap()
                    .replace("{{message}}", "Whoops, your token has expired"),
            )))
            .unwrap())
    } else if status >= 400 {
        Ok(Response::new(Full::new(Bytes::from(result))))
    } else {
        if !root_source {
            Ok(Response::builder()
                .header(header::CONTENT_TYPE, &page.content_type())
                .body(Full::new(Bytes::from(result)))
                .unwrap())
        } else {
            let source = String::from_utf8(result).unwrap().replace('"', "&quot;");
            let children: String = if SourceExtension::from_str(&page.content_type()).unwrap()
                == SourceExtension::HTML
            {
                format!("<iframe srcdoc=\"{}\"></iframe>", source)
            } else {
                format!("<textarea readonly>{}</textarea>", source)
            };

            Ok(Response::builder()
                // .header(header::CONTENT_TYPE, &page.content_type())
                .header(header::CONTENT_TYPE, "text/html")
                // .body(Full::new(Bytes::from(result)))
                .body(Full::new(Bytes::from(
                    String::from_utf8(MANAGER_PAGE.to_vec())
                        .unwrap()
                        .replace(
                            "{{components}}",
                            serde_json::to_string(
                                &content
                                    .iter()
                                    .map(|file| file.to_ui_component())
                                    .collect::<Vec<UiCmsFile>>(),
                            )
                            .unwrap()
                            .as_str(),
                        )
                        .replace("{{children}}", children.as_str()),
                )))
                .unwrap())
        }
    }
}

fn get_matching_routes<'a>(
    path: &'a String,
    cms_paths: Vec<(String, &'a RouterCmsPage)>,
    strict_mode: bool,
) -> Vec<&'a RouterCmsPage> {
    let str = path.clone().replace("/_", "");
    let paths = str
        .split("/")
        .filter(|p| !p.is_empty())
        .collect::<Vec<&str>>();

    if paths.is_empty() {
        vec![]
    } else {
        let mut matched = false;

        let mut init: Vec<(Vec<String>, &RouterCmsPage)> = vec![];

        cms_paths.iter().for_each(|r| {
            let page = r.1;

            let mut current_path: Vec<String> =
                r.0.replace("/_/", "")
                    .split("/")
                    .map(String::from)
                    .collect();

            let path_suffix = if page.exact { "" } else { "*" }.to_string();

            current_path.push(path_suffix);
            current_path = current_path.into_iter().filter(|p| !p.is_empty()).collect();

            if !current_path.is_empty() {
                init.push((current_path, page))
            }
        });

        paths
            .iter()
            .fold(init, |acc: Vec<(Vec<String>, &RouterCmsPage)>, path| {
                if acc.is_empty() || matched {
                    acc
                } else {
                    let matching_routes: Vec<(Vec<String>, &RouterCmsPage)> = acc
                        .iter()
                        .filter(|p| {
                            if p.0.is_empty() {
                                false
                            } else {
                                let path_path = p.0.iter().nth(0).unwrap();
                                path_path == path || path_path == "*"
                            }
                        })
                        .map(|p| (p.0.to_vec(), p.1))
                        .collect();

                    if !matching_routes.is_empty() {
                        matching_routes
                            .iter()
                            .map(|p| (p.0.to_vec().into_iter().skip(1).collect(), p.1))
                            .collect()
                    } else {
                        match acc.iter().find(|p| p.0.is_empty()) {
                            Some(matching_route) if !strict_mode => {
                                matched = true;
                                let mut results = Vec::new();
                                results.push((matching_route.0.to_vec(), matching_route.1));
                                results
                            }
                            _ => Vec::new(),
                        }
                    }
                }
            })
            .into_iter()
            .map(|f| f.1)
            .collect()
    }
}

fn get_pages<'a>(
    router_pages: &'a Vec<RouterCmsPage>,
    exact: bool,
) -> Vec<(String, &'a RouterCmsPage)> {
    router_pages
        .into_iter()
        .filter(|p| p.exact == exact)
        .map(|p| (p.path.clone(), p))
        .collect()
}
