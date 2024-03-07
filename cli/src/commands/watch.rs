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
use crate::models::folder::{read_contents, read_sources, CmsFile};

use super::enviroments::read_cookie_from_environment;
use super::projects::{self, get_project, Project};

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

pub(crate) async fn run(incoming_project: Option<String>) -> DaikokuResult<()> {
    let port = std::env::var("WATCHING_PORT").unwrap_or("3333".to_string());
    logger::loading(format!("<yellow>Listening</> on {}", port));

    let listener = TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();

    loop {
        let project = incoming_project
            .clone()
            .map(|name| get_project(name).ok())
            .flatten();

        if incoming_project.is_some() && project.is_none() {
            return Err(DaikokuCliError::Configuration(
                "project not found".to_string(),
            ));
        }

        {
            match listener.accept().await {
                Err(err) => logger::error(format!("{}", err.to_string())),
                Ok((stream, _)) => {
                    let io = TokioIo::new(stream);

                    tokio::task::spawn(async move {
                        if let Err(err) = http1::Builder::new()
                            .serve_connection(io, service_fn(|req| watcher(req, project.clone())))
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

fn read_cms_pages(project: Option<Project>) -> DaikokuResult<Summary> {
    let project = project.unwrap_or(projects::get_default_project()?);
    Ok(Summary {
        pages: read_sources(
            &PathBuf::from(project.path)
                .join("src")
                .into_os_string()
                .into_string()
                .unwrap(),
        ),
    })
}

async fn watcher(
    req: Request<hyper::body::Incoming>,
    project: Option<Project>,
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    let uri = req.uri().path().to_string();

    if uri.starts_with("/api") {
        println!("forward to api");
        forward_api_call(uri, req).await
    } else {
        let path = uri.replace("_/", "");

        logger::println(format!("<green>Request received</> {}", &path));

        let Summary { pages } = read_cms_pages(project)?;

        let mut router_pages = vec![];

        pages.iter().for_each(|p| {
            router_pages.push(RouterCmsPage {
                exact: p.exact(),
                path: p.path(),
            })
        });

        match pages.iter().find(|page| page.path() == path) {
            Some(page) => render_page(page, path).await,
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
                            Some(page) => render_page(page, path).await,
                            None => Ok(Response::new("404 page not found".into())),
                        },
                        Some(res) => {
                            render_page(pages.iter().find(|p| p.path() == res.path).unwrap(), path)
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
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    let host = "localhost:9000";
    let method = req.method().to_string();

    let url: String = format!("http://{}{}", host, uri);

    println!("forward to {}", url);

    let cookie = read_cookie_from_environment()?;

    let raw_req = Request::builder()
        .method(Method::from_str(&method).unwrap())
        .uri(&url)
        .header(header::HOST, host)
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
        mut body,
    ) = upstream_resp.into_parts();

    let mut result: Vec<u8> = Vec::new();

    while let Some(next) = body.frame().await {
        let frame = next.unwrap();
        if let Ok(chunk) = frame.into_data() {
            for b in chunk.bytes() {
                (result).push(b.unwrap().clone());
            }
        }
    }

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
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    logger::println(format!(
        "<green>Serve page</> {} {}",
        page.path(),
        page.name
    ));

    let project = projects::get_default_project()?;

    let content = read_contents(
        &PathBuf::from(&project.path)
            .into_os_string()
            .into_string()
            .map_err(|err| {
                DaikokuCliError::Configuration(err.to_str().unwrap_or(&"").to_string())
            })?,
    );

    let body_obj = CmsRequestRendering {
        content,
        current_page: page.path().clone(),
    };

    let body = Bytes::from(
        serde_json::to_string(&body_obj)
            .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?,
    );

    let host = "localhost:9000";

    let url: String = format!("http://{}/_{}?force_reloading=true", host, watch_path);

    let cookie = read_cookie_from_environment()?;

    let req = Request::builder()
        .method(Method::POST)
        .uri(&url)
        .header(header::COOKIE, format!("daikoku-session={}", cookie))
        .header(header::HOST, host)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Full::new(body))
        .unwrap();

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
        mut body,
    ) = upstream_resp.into_parts();

    let mut result: Vec<u8> = Vec::new();

    while let Some(next) = body.frame().await {
        let frame = next.unwrap();
        if let Ok(chunk) = frame.into_data() {
            for b in chunk.bytes() {
                (result).push(b.unwrap().clone());
            }
        }
    }

    let status = status.as_u16();

    if status >= 300 && status < 400 {
        Ok(Response::new(Full::new(Bytes::from(
            "Authentication needed! Refresh this page once done",
        ))))
    } else {
        let response = Response::builder()
            .header(header::CONTENT_TYPE, &page.content_type())
            .body(Full::new(Bytes::from(result)))
            .unwrap();

        Ok(response)
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
