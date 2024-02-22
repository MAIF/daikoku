use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::str::FromStr;

use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{header, Method};
use hyper::{Request, Response};

use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use tokio::io;
use tokio::net::{TcpListener, TcpStream};
use uuid::Uuid;

use std::{fmt, fs};

use crate::logging::error::{DaikokuCliError, DaikokuResult};
use crate::logging::logger;
use crate::models::folder::{read_contents, Folder, SourceExtension, ToContentType};
use crate::utils::get_current_working_dir;

use super::projects::{self, Project};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub(crate) struct CmsPage {
    pub(crate) _id: String,
    _tenant: String,
    _deleted: bool,
    visible: bool,
    authenticated: bool,
    pub(crate) name: String,
    // picture: Option<dyn Any>,
    tags: Vec<String>,
    metadata: HashMap<String, String>,
    #[serde(alias = "contentType")]
    pub(crate) content_type: String,
    // forwardRef: dyn Any,
    path: Option<String>,
    exact: bool,
    #[serde(alias = "lastPublishedDate")]
    last_published_date: u64,
}

#[derive(Debug)]
struct RouterCmsPage<'a> {
    _id: &'a str,
    exact: bool,
    path: &'a str,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub(crate) struct Summary {
    pub(crate) pages: Vec<CmsPage>,
}

#[derive(Serialize, Deserialize, Clone)]
struct CmsRequestRendering {
    pages: Vec<CmsPage>,
    content: Folder,
    current_page: String,
}

impl fmt::Display for CmsPage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{:?} - {} - {}{}{}",
            self.path.clone().unwrap_or("NO_PATH".to_string()),
            self.name,
            self.content_type,
            if self.authenticated {
                "- AUTH_REQUIRED -"
            } else {
                ""
            },
            if self.exact { "- EXACT_MATCHING" } else { "" }
        )
    }
}

impl Summary {
    pub(crate) fn add_new_file(
        &mut self,
        name: String,
        visible: Option<bool>,
        authenticated: Option<bool>,
        path: Option<String>,
        exact: Option<bool>,
        content_type: &String,
        overwrite: bool,
    ) -> DaikokuResult<()> {
        let new_page = CmsPage {
            _id: Uuid::new_v4().to_string(), // TODO - generate new UUID
            _tenant: "".to_string(),         // TODO - get tenant from configuration file
            _deleted: false,
            visible: visible.unwrap_or(true),
            authenticated: authenticated.unwrap_or(false),
            name: name.clone(),
            tags: vec![],
            metadata: HashMap::new(),
            content_type: content_type.clone(),
            path,
            exact: exact.unwrap_or(true),
            last_published_date: chrono::offset::Utc::now().timestamp() as u64,
        };

        if overwrite && self.contains_page(&name, content_type) {
            self.pages = self
                .pages
                .iter()
                .filter(|p| !(p.name == name.clone() && p.content_type == content_type.clone()))
                .cloned()
                .collect();
        }

        self.pages.push(new_page);

        write_cms_pages(&self)
    }

    pub(crate) fn remove_file(
        &mut self,
        id: Option<String>,
        name: Option<String>,
        extension: Option<String>,
    ) -> DaikokuResult<()> {
        let contents = read_cms_pages()?;

        let identifier = id.map(|p| p.clone()).unwrap_or("".to_string());
        let name = &name.unwrap_or("".to_string());
        let extension = &extension
            .map(|e| SourceExtension::from_str(&e).unwrap().content_type())
            .unwrap_or("text/html".to_string());

        match contents
            .pages
            .iter()
            .position(|p| p._id == identifier || (self.contains_page(&name, &extension)))
        {
            Some(idx) => {
                self.pages.remove(idx);
                write_cms_pages(&self)
            }
            None => Err(DaikokuCliError::Configuration(
                "file registration is missing".to_string(),
            )),
        }
    }

    pub(crate) fn contains_page(&self, name: &String, content_type: &String) -> bool {
        self.pages
            .iter()
            .find(|p| &p.name == name && &p.content_type == content_type)
            .is_some()
    }
}

pub(crate) async fn run(
    path: Option<String>,
    server: Option<String>,
    client_id: Option<String>,
    client_secret: Option<String>,
) {
    logger::loading("<yellow>Listening</> on 3333".to_string());

    let _ = initialize_command(path, server, client_id, client_secret).unwrap();

    let listener = TcpListener::bind(format!("0.0.0.0:3333")).await.unwrap();

    loop {
        match listener.accept().await {
            Err(err) => logger::error(format!("{}", err.to_string())),
            Ok((stream, _)) => {
                let io = TokioIo::new(stream);

                tokio::task::spawn(async move {
                    if let Err(err) = http1::Builder::new()
                        .serve_connection(io, service_fn(watcher))
                        .await
                    {
                        println!("Error serving connection: {:?}", err);
                    }
                });
            }
        };
    }
}

fn initialize_command(
    path: Option<String>,
    server: Option<String>,
    client_id: Option<String>,
    client_secret: Option<String>,
) -> DaikokuResult<()> {
    Ok(())
    // let mut configuration = read_configuration()?;

    // let complete_path = match path {
    //     Some(p) => p,
    //     None => get_current_working_dir()?,
    // };

    // if server.is_some() {
    //     configuration.insert(DAIKOKU_SERVER.to_owned(), server.unwrap().to_owned());
    // }

    // if client_id.is_some() {
    //     configuration.insert(DAIKOKU_CLIENT_ID.to_owned(), client_id.unwrap().to_owned());
    // }

    // if client_secret.is_some() {
    //     configuration.insert(
    //         DAIKOKU_CLIENT_SECRET.to_owned(),
    //         client_secret.unwrap().to_owned(),
    //     );
    // }

    // if !Path::new(&complete_path).exists() {
    //     return Err(DaikokuCliError::FolderNotExists(complete_path));
    // } else {
    //     Ok(())
    // }
}

pub(crate) fn read_cms_pages() -> DaikokuResult<Summary> {
    let project = projects::get_default_project()?;

    read_cms_pages_from_project(project)
}

pub(crate) fn read_cms_pages_from_project(project: Project) -> DaikokuResult<Summary> {
    let content = fs::read_to_string(PathBuf::from(project.path).join("src").join("summary.json")).unwrap();
    let Summary { pages } = serde_json::from_str(&content).unwrap();

    Ok(Summary {
        pages: pages.into_iter().collect(),
    })
}

fn write_cms_pages(contents: &Summary) -> DaikokuResult<()> {
    let project = projects::get_default_project()?;
    let path = PathBuf::from(project.path).join("src").join("summary.json");
    match fs::write(
        path,
        serde_json::to_string_pretty(contents).unwrap(),
    ) {
        Ok(_) => Ok(()),
        Err(_) => Err(DaikokuCliError::Configuration(
            "failed to patch the summary file".to_string(),
        )),
    }
}

fn get_matching_routes<'a>(
    path: &'a String,
    cms_paths: Vec<(&'a str, &'a RouterCmsPage<'a>)>,
    strict_mode: bool,
) -> Vec<&'a RouterCmsPage<'a>> {
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

        // println!("possible paths : {:?}", init);

        paths
            .iter()
            .fold(init, |acc: Vec<(Vec<String>, &RouterCmsPage)>, path| {
                // println!("Start compare with {}", path);
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

                    // println!("matching route : {:?}", matching_routes);

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
    router_pages: &'a Vec<RouterCmsPage<'a>>,
    exact: bool,
) -> Vec<(&'a str, &'a RouterCmsPage<'a>)> {
    router_pages
        .into_iter()
        .filter(|p| p.exact == exact)
        .map(|p| (p.path, p))
        .collect()
}

fn not_visible_page() -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    Ok(Response::new(Full::new(Bytes::from("NOT VISIBLE"))))
}

fn not_found_page() -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    Ok(Response::new(Full::new(Bytes::from("NOT FOUND"))))
}

async fn watcher(
    req: Request<hyper::body::Incoming>,
) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    logger::println(format!("<green>Request received</> {}", &req.uri()));

    let Summary { pages } = read_cms_pages()?;

    let mut router_pages = vec![];

    pages.iter().filter(|p| p.path.is_some()).for_each(|p| {
        let path = p.path.as_ref().map(|x| &**x).unwrap();
        router_pages.push(RouterCmsPage {
            _id: &p._id,
            exact: p.exact,
            path: &path,
        })
    });

    let path = req.uri().path().to_string();
    match pages
        .iter()
        .find(|page| page.path.clone().map(|p| p == path).unwrap_or(false))
    {
        Some(page) if !page.visible => not_visible_page(),
        Some(page) => render_page(page).await,
        None => {
            let strict_page = get_matching_routes(&path, get_pages(&router_pages, true), true);

            let result_page = if !strict_page.is_empty() {
                strict_page
            } else {
                get_matching_routes(&path, get_pages(&router_pages, false), false)
            };

            match result_page.iter().nth(0) {
                None => not_found_page(),
                Some(res) => render_page(pages.iter().find(|p| p._id == res._id).unwrap()).await,
            }
        }
    }
}

async fn render_page(page: &CmsPage) -> Result<Response<Full<Bytes>>, DaikokuCliError> {
    logger::println(format!("<green>Serve page</> {}", page));

    let host = "localhost:9000";

    let url: String = format!("http://{}/__/?force_reloading=true", host);
    let Summary { pages } = read_cms_pages()?;

    let project = projects::get_default_project()?;

    let content = read_contents(
        &PathBuf::from(&project.path).join("src")
            .into_os_string()
            .into_string()
            .unwrap(),
    );

    let body_obj = CmsRequestRendering {
        pages,
        content,
        current_page: page._id.clone(),
    };

    let body = Bytes::from(serde_json::to_string(&body_obj).unwrap());

    let req = Request::builder()
        .method(Method::POST)
        .uri(&url)
        .header(header::HOST, host)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Full::new(body))
        .unwrap();

    let stream = TcpStream::connect(format!("{}:{}", &"localhost", 9000))
        .await
        .map_err(|err| DaikokuCliError::DaikokuError(err))?;
    let io = TokioIo::new(stream);

    let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();

    tokio::task::spawn(async move {
        if let Err(err) = conn.await {
            println!("Connection error: {:?}", err);
        }
    });

    let upstream_resp = sender.send_request(req).await.unwrap();

    let (
        hyper::http::response::Parts {
            headers, status, ..
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

    let redirect_location = headers.get::<String>(header::LOCATION.to_string());

    let location = redirect_location
        .map(|location| {
            format!(
                "{}{}",
                host.to_string(),
                String::from_utf8(location.as_bytes().to_vec()).unwrap()
            )
        })
        .unwrap_or(host.to_string());

    // println!("{:?} - {} - {}", redirect_location, location, status);

    let status = status.as_u16();

    if status >= 300 && status < 400 {
        Ok(Response::new(Full::new(Bytes::from(
            "Authentication needed! Refresh this page once done",
        ))))
    } else {
        let response = Response::builder()
            .header(header::CONTENT_TYPE, &page.content_type)
            .body(Full::new(Bytes::from(result)))
            .unwrap();

        // println!("{:?}", response.headers());
        Ok(response)
    }
}
