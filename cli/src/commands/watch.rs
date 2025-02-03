use hyper::header::{HeaderValue, LOCATION};
use regex::Regex;
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::str::FromStr;

use http_body_util::{BodyExt, Empty, Full};
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{header, Method, StatusCode};
use hyper::{Request, Response};

use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};

use tokio::net::{TcpListener, TcpStream};

use crate::logging::error::{DaikokuCliError, DaikokuResult};
use crate::logging::logger::{self};
use crate::models::folder::{read_contents, CmsFile, SourceExtension, UiCmsFile};
use crate::utils::frame_to_bytes_body;

use super::cms::{self};
use super::environments::{
    can_join_daikoku, check_environment_from_str, read_cookie_from_environment, Environment,
};

pub(crate) const SESSION_EXPIRED: &[u8] = include_bytes!("../../templates/session_expired.html");
const MANAGER_PAGE: &[u8] = include_bytes!("../../templates/manager.html");

#[derive(Debug, Clone)]
struct RouterCmsPage {
    exact: bool,
    path: String,
}

#[derive(Debug)]
struct UrlSearchParam {
    key: String,
    value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub(crate) struct Summary {
    pub(crate) pages: Vec<CmsFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct CmsRequestRendering {
    content: Vec<CmsFile>,
    current_page: String,
    fields: HashMap<String, String>,
}

pub(crate) async fn run(
    incoming_environment: Option<String>,
    authentication: Option<bool>,
) -> DaikokuResult<()> {
    let environment = check_environment_from_str(incoming_environment.clone())?;

    let _ = can_join_daikoku(&environment.server, None).await?;

    let port = std::env::var("WATCHING_PORT").unwrap_or("3333".to_string());

    logger::loading(format!("<yellow>Listening</> on {}", port));

    if webbrowser::open(&format!("http://localhost:{}", port)).is_ok() {}

    let listener = TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();

    loop {
        let environment = environment.clone();
        let authentication = authentication.unwrap_or(true);
        {
            match listener.accept().await {
                Err(err) => logger::error(format!("{}", err.to_string())),
                Ok((stream, _)) => {
                    let io = TokioIo::new(stream);

                    tokio::task::spawn(async move {
                        if let Err(err) = http1::Builder::new()
                            .serve_connection(
                                io,
                                service_fn(|req| watcher(req, &environment, authentication)),
                            )
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

fn read_cms_pages() -> DaikokuResult<Summary> {
    Ok(Summary {
        pages: read_contents(&PathBuf::from(cms::get_default_project()?.path))?,
    })
}

async fn watcher(
    req: Request<hyper::body::Incoming>,
    environment: &Environment,
    authentication: bool,
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    let uri = req.uri().path().to_string();

    if uri.starts_with("/tenant-assets/") {
        let redirect_url = "http://localhost:5173/tenant-assets/api3.jpeg";

        let mut response = Response::new(Full::<Bytes>::new(Bytes::from("")));
        *response.status_mut() = StatusCode::FOUND; // 302 status
        response
            .headers_mut()
            .insert(LOCATION, HeaderValue::from_str(redirect_url).unwrap());

        Ok(response)
    } else if uri.starts_with("/api/") {
        logger::println("forward to api".to_string());
        forward_api_call(uri, req, environment).await
    } else {
        let path = uri.replace("_/", "");

        let visualizer = req
            .uri()
            .query()
            .map(|queries| queries.contains("visualizer"))
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
            Some(page) => {
                render_page(page, path, environment, visualizer, authentication, vec![]).await
            }
            None => {
                let (strict_page, url_search_params) =
                    get_matching_routes(&path, get_pages(&router_pages, true), true);

                let (result_page, url_search_params) = if !strict_page.is_empty() {
                    (strict_page, url_search_params)
                } else {
                    get_matching_routes(&path, get_pages(&router_pages, false), false)
                };

                if result_page.is_empty() {
                    logger::println("<red>No page found</>".to_string());
                    Ok(Response::new("404 page not found".into()))
                } else {
                    match result_page.iter().nth(0) {
                        None => {
                            logger::println("<green>Serve 404</>".to_string());
                            match pages.iter().find(|p| p.path() == "/404") {
                                Some(page) => {
                                    render_page(
                                        page,
                                        path,
                                        environment,
                                        visualizer,
                                        authentication,
                                        url_search_params,
                                    )
                                    .await
                                }
                                None => Ok(Response::new("404 page not found".into())),
                            }
                        }
                        Some(res) => {
                            render_page(
                                pages.iter().find(|p| p.path() == res.path).unwrap(),
                                path,
                                environment,
                                visualizer,
                                authentication,
                                url_search_params,
                            )
                            .await
                        }
                    }
                }
            }
        }
    }
}

fn find_page_from_path<'a>(path: String) -> Option<CmsFile> {
    let Summary { pages } = read_cms_pages().unwrap();

    let mut router_pages = vec![];

    pages.iter().for_each(|p| {
        router_pages.push(RouterCmsPage {
            exact: p.exact(),
            path: p.path(),
        })
    });

    match pages.iter().find(|page| page.path() == path) {
        Some(page) => Some(page.clone()),
        None => {
            let (strict_page, params) =
                get_matching_routes(&path, get_pages(&router_pages, true), true);

            let (result_page, _params) = if !strict_page.is_empty() {
                (strict_page, params)
            } else {
                get_matching_routes(&path, get_pages(&router_pages, false), false)
            };

            if result_page.is_empty() {
                None
            } else {
                match result_page.iter().nth(0) {
                    None => None,
                    Some(res) => pages
                        .iter()
                        .find(|p| p.path() == res.path)
                        .map(|p| p.clone()),
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

    let raw_req = Request::builder()
        .method(Method::from_str(&method).unwrap())
        .uri(&url)
        .header(header::HOST, &host)
        .header("Accept", "*/*")
        .header(header::COOKIE, read_cookie_from_environment(true)?);

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
            logger::error(format!("Connection error: {:?}", err));
        }
    });

    let upstream_resp = sender.send_request(req).await.map_err(|err| {
        logger::error(format!("send request failed {:?}", err));
        DaikokuCliError::ParsingError(err.to_string())
    })?;

    let (
        hyper::http::response::Parts {
            headers: _headers,
            status,
            ..
        },
        body,
    ) = upstream_resp.into_parts();

    let result: Vec<u8> = frame_to_bytes_body(body).await;

    let status = status.as_u16();

    println!("{:?}", _headers);

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
    visualizer: bool,
    authentication: bool,
    url_search_params: Vec<UrlSearchParam>,
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    logger::println(format!(
        "<green>Serve page</> {} {}",
        page.path(),
        page.name
    ));

    let mut current_page = page.path().clone();

    let project = cms::get_default_project()?;

    let mut content = read_contents(&PathBuf::from(&project.path))?;

    let mut fields: HashMap<String, String> = HashMap::new();

    for param in url_search_params {
        fields.insert(param.key, param.value);
    }

    if watch_path.starts_with("/mails")
        && !watch_path.starts_with("/mails/root/tenant-mail-template")
    {
        let language = if watch_path.contains("/fr") {
            "fr"
        } else {
            "en"
        };

        let root_template = format!("/mails/root/tenant-mail-template/{}", language);

        if let Some(root) = find_page_from_path(root_template) {
            current_page = root.path().clone();
        }

        fields.insert("email".to_string(), page.content.clone());

        content = content
            .clone()
            .iter_mut()
            .map(|page| {
                let input = page.content.clone();
                let re = Regex::new(r"\[([^\]]+)\]").unwrap();
                page.content = re
                    .replace_all(&input, |caps: &regex::Captures| {
                        format!("{{{{{}}}}}", &caps[1])
                    })
                    .to_string();
                page.clone()
            })
            .collect();
    }

    let body_obj = CmsRequestRendering {
        content: content.clone(),
        current_page,
        fields,
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

    let mut builder = reqwest::Client::new()
        .post(url)
        .header(header::HOST, host)
        .header(header::CONTENT_TYPE, "application/json")
        .body(body);

    if authentication && page.authenticated() {
        match read_cookie_from_environment(true) {
            Ok(cookie) => builder = builder.header(header::COOKIE, cookie),
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
    }

    let resp = builder
        .send()
        .await
        .map_err(|err| DaikokuCliError::DaikokuStrError(err.to_string()))?;

    let status = resp.status().as_u16();

    let result: Vec<u8> = resp
        .bytes()
        .await
        .map_err(|err| DaikokuCliError::DaikokuStrError(err.to_string()))?
        .to_vec();

    if status == 303 {
        Ok(Response::builder()
            .header(header::CONTENT_TYPE, "text/html")
            .body(Full::new(Bytes::from(
                String::from_utf8(SESSION_EXPIRED.to_vec())
                    .unwrap()
                    .replace("{{message}}", "Whoops, your session has expired"),
            )))
            .unwrap())
    } else if status >= 400 {
        Ok(Response::new(Full::new(Bytes::from(result))))
    } else {
        if !visualizer {
            Ok(Response::builder()
                .header(header::CONTENT_TYPE, &page.content_type())
                .body(Full::new(Bytes::from(result)))
                .unwrap())
        } else {
            let src = String::from_utf8(result).unwrap();

            let source = src.replace('"', "&quot;");

            let children: String = if SourceExtension::from_str(&page.content_type()).unwrap()
                == SourceExtension::HTML
            {
                format!("<iframe srcdoc=\"{}\"></iframe>", source)
            } else {
                format!("<textarea readonly>{}</textarea>", src)
            };

            Ok(Response::builder()
                .header(header::CONTENT_TYPE, "text/html")
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
) -> (Vec<RouterCmsPage>, Vec<UrlSearchParam>) {
    let str = path.clone().replace("/_", "").replace(".html", "");
    let paths = str
        .split("/")
        .filter(|p| !p.is_empty())
        .collect::<Vec<&str>>();

    if paths.is_empty() {
        (vec![], vec![])
    } else {
        let mut matched = false;

        let mut formatted_paths: Vec<(Vec<String>, RouterCmsPage)> = vec![];

        cms_paths.clone().iter().for_each(|r| {
            let mut current_path: Vec<String> =
                r.0.replace("/_/", "")
                    .split("/")
                    .map(String::from)
                    .collect();

            let path_suffix = if r.1.exact { "" } else { "*" }.to_string();

            current_path.push(path_suffix);
            current_path = current_path.into_iter().filter(|p| !p.is_empty()).collect();

            if !current_path.is_empty() {
                formatted_paths.push((current_path, r.1.clone()))
            }
        });

        formatted_paths.sort_by(|a, b| a.0.len().cmp(&b.0.len()));

        let mut params: Vec<UrlSearchParam> = vec![];

        (
            paths
                .iter()
                .fold(
                    formatted_paths,
                    |acc: Vec<(Vec<String>, RouterCmsPage)>, path| {
                        if acc.is_empty() || matched {
                            acc
                        } else {
                            let matching_routes: Vec<(Vec<String>, RouterCmsPage)> = acc
                                .iter()
                                .filter(|p| {
                                    if p.0.is_empty() {
                                        false
                                    } else {
                                        let path_path = p.0.iter().nth(0).unwrap();

                                        if path_path == path || path_path == "*" {
                                            true
                                        } else {
                                            let pattern = r"\[\w+\]";
                                            let regex: Regex = Regex::new(pattern).unwrap();

                                            if let Some(cap) = regex.captures(&path_path) {
                                                params.push(UrlSearchParam {
                                                    value: path.to_string(),
                                                    key: cap[0][1..cap[0].len() - 1].to_string(),
                                                });

                                                true
                                            } else {
                                                false
                                            }
                                        }
                                    }
                                })
                                .map(|p| (p.0.to_vec(), p.1.clone()))
                                .collect();

                            if !matching_routes.is_empty() {
                                matching_routes
                                    .iter()
                                    .map(|p| {
                                        (p.0.to_vec().into_iter().skip(1).collect(), p.1.clone())
                                    })
                                    .collect()
                            } else {
                                match acc.iter().find(|p| p.0.is_empty()) {
                                    Some(matching_route) if !strict_mode => {
                                        matched = true;
                                        let mut results = Vec::new();
                                        results.push((
                                            matching_route.0.to_vec(),
                                            matching_route.1.clone(),
                                        ));
                                        results
                                    }
                                    _ => Vec::new(),
                                }
                            }
                        }
                    },
                )
                .into_iter()
                .map(|page| page.1)
                .collect(),
            params,
        )
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
