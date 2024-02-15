use std::collections::HashMap;
use std::convert::Infallible;
use std::io;
use std::path::PathBuf;

use bytes::Buf;
use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_tls::HttpsConnector;
use hyper_util::client::legacy::Client;
use hyper_util::rt::{TokioExecutor, TokioIo};
use hyper::{Error, Request, Response};
use hyper::{body::Incoming as IncomingBody, header, Method, StatusCode};
use serde::{Deserialize, Serialize};
use tokio::net::{TcpListener, TcpStream};

use std::fs;

use crate::plugin::{read_contents, Folder};

#[derive(Serialize, Deserialize, Clone, Debug)]
struct CmsPage {
    _id: String,
    _tenant: String,
    _deleted: bool,
    visible: bool,
    authenticated: bool,
    name: String,
    // picture: Option<dyn Any>,
    tags: Vec<String>,
    metadata: HashMap<String, String>,
    #[serde(alias = "contentType")]
    content_type: String,
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
struct Summary {
    pages: Vec<CmsPage>,
}

#[derive(Serialize, Deserialize, Clone)]
struct CmsRequestRendering {
    pages: Vec<CmsPage>,
    content: Folder,
    current_page: String
}

fn read_cms_pages() -> Summary {
    let content = fs::read_to_string(PathBuf::from("./my-first-cms/src/summary.json")).unwrap();
    let Summary { pages } = serde_json::from_str(&content).unwrap();

    Summary {
        pages: pages
            .into_iter()
            // .filter(|page| page.path.is_some())
            .collect(),
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

        cms_paths
            .iter()
            .for_each(|r| {
                let page = r.1;

                let mut current_path: Vec<String> = r.0
                  .replace("/_/", "")
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
                        matching_routes.iter()
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

async fn hello(req: Request<hyper::body::Incoming>) -> Result<Response<Full<Bytes>>, Infallible> {
    let path = req.uri().path().to_string();

    let Summary { pages } = read_cms_pages();

    let mut router_pages = vec![];

    pages.iter().filter(|p| p.path.is_some()).for_each(|p| {
        let path = p.path.as_ref().map(|x| &**x).unwrap();
        router_pages.push(RouterCmsPage {
            _id: &p._id,
            exact: p.exact,
            path: &path,
        })
    });

    match pages.iter().find(|page| page.path.clone().map(|p| p == path).unwrap_or(false)) {
      Some(page) if !page.visible => Ok(Response::new(Full::new(Bytes::from("NOT VISIBLE")))),
      Some(page) if page.authenticated /* && not user */ => render_page(page).await, // Ok(Response::new(Full::new(Bytes::from("REDIRECT TO LOGIN PAGE")))),
      Some(page) => render_page(page).await,// call 
      None => {
        let strict_page = get_matching_routes(&path, get_pages(&router_pages, true),true);

        // println!("Strict pages {:?}", strict_page);

        let result_page = if !strict_page.is_empty() {
          strict_page
        } else {
          get_matching_routes(&path, get_pages(&router_pages, false), false)
        };

        // println!("{:?}", result_page);
        
        match result_page.iter().nth(0) {
          None => Ok(Response::new(Full::new(Bytes::from("NOT FOUND")))),
          Some(res) => render_page(pages.iter().find(|p| p._id == res._id).unwrap()).await
        }
      }
  }
}

// fn extract_extension(page: &CmsPage) -> &str {
//   match page.content_type.as_str() {
//     "text/javascript" => "js",
//     "text/html" => "hmtl",
//     "application/json" => "json",
//     _ => "html"
//   }
// }

async fn render_page(page: &CmsPage) -> Result<Response<Full<Bytes>>, Infallible> {

  println!("Page found {:?}", page);

  let url = format!("http://localhost:9000/__/?force_reloading=true");
  let Summary { pages } = read_cms_pages();

  let content = read_contents(&PathBuf::from("./my-first-cms/src").into_os_string().into_string().unwrap());

  let body_obj = CmsRequestRendering {
    pages,
    content,
    current_page: page._id.clone()
  };

  let body = Bytes::from(serde_json::to_string(&body_obj).unwrap());

  let req = Request::builder()
    .method(Method::POST)
    .uri(url)
    .header(header::HOST, "localhost:9000")
    .header(header::CONTENT_TYPE, "application/json")
    .body(Full::new(body))
    .unwrap();

  let host = req.uri().host().expect("uri has no host");
  let port = req.uri().port_u16().expect("uri has no port");
  let stream = TcpStream::connect(format!("{}:{}", host, port)).await.unwrap();
  let io = TokioIo::new(stream);

  let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();

  tokio::task::spawn(async move {
      if let Err(err) = conn.await {
          println!("Connection error: {:?}", err);
      }
  });

  let web_res = sender.send_request(req).await.unwrap();

  let whole_body = web_res.collect().await.unwrap().aggregate();

  let res = io::read_to_string(whole_body.reader()).unwrap();
  
  Ok(
    Response::builder()
      .header(header::CONTENT_TYPE, &page.content_type)
      .body(Full::new(Bytes::from(res)))
      .unwrap()
  )
}

pub async fn watching() -> io::Result<()> {
    let listener = TcpListener::bind(format!("0.0.0.0:3333")).await.unwrap();

    loop {
        let (stream, _) = listener.accept().await?;

        let io = TokioIo::new(stream);

        // Spawn a tokio task to serve multiple connections concurrently
        tokio::task::spawn(async move {
            // Finally, we bind the incoming connection to our `hello` service
            if let Err(err) = http1::Builder::new()
                // `service_fn` converts our function in a `Service`
                .serve_connection(io, service_fn(hello))
                .await
            {
                println!("Error serving connection: {:?}", err);
            }
        });
    }
}
