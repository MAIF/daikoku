use std::any::Any;
use std::collections::HashMap;
use std::io;
use std::convert::Infallible;
use std::path::PathBuf;

use http_body_util::Full;
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;

use std::fs;

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
  last_published_date: u64
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Summary {
  pages: Vec<CmsPage>
}

fn read_cms_pages() -> Summary {
  let content = fs::read_to_string(PathBuf::from("./my-first-cms/src/summary.json")).unwrap();
  let Summary { pages } =serde_json::from_str(&content).unwrap();

  Summary { pages: pages.into_iter().filter(|page| page.path.is_some()).collect() }
}

fn get_matching_routes(path: &String, cms_paths: Vec<(String, CmsPage)>, strict_mode: bool) -> Vec<CmsPage> {

  let paths = path      
    .replace("/_", "")
    .split("/")
    .filter(|p| !p.is_empty())
    .collect::<Vec<&str>>();

  if paths.is_empty() {
    vec![]
  } else {
    let mut matched = false;

    let init: Vec<(Vec<String>, CmsPage)> = cms_paths
      .into_iter()
      .map(|r| {
        let path = r.0.replace("/_/", "").split("/").map(|s| s.to_string()).collect::<Vec<String>>();
        let page = r.1;

        let path_suffix = (if page.exact {
          "" 
        } else {
          "*"
        }).to_string();

        path.push(path_suffix);
        (path, page)
      })
      .collect::<Vec<(Vec<String>, CmsPage)>>();

    paths
      .into_iter()
      .fold(init, |acc: Vec<(Vec<String>, CmsPage)>, path| {

        if acc.is_empty() || matched {
          acc
        } else {
          let matching_routes: Vec<(Vec<String>, CmsPage)> = acc.into_iter().filter(|p|
            !p.0.is_empty() && (p.0.into_iter().nth(0).unwrap() == path || p.0.into_iter().nth(0).unwrap() == "*")
          ).collect();
          if !matching_routes.is_empty() {
            matching_routes
            .into_iter()
            .map(|p| (p.0.into_iter().skip(1).collect(), p.1))
            .collect()
          } else {
            let matching_route = acc.into_iter().find(|p| p.0.is_empty());
            if matching_route.is_some() && !strict_mode {
              matched = true;
              let mut results = Vec::new();
              results.push(matching_route.unwrap());
              results
            } else {
              Vec::new()
            }
          }
        }
      })
      .into_iter()
      .map(|f| f.1)
      .collect()
  }
}

async fn hello(req: Request<hyper::body::Incoming>) -> Result<Response<Full<Bytes>>, Infallible> {

  let path = req.uri().path().to_string();

  let Summary { pages } = read_cms_pages();

  let option_page = (&pages).into_iter().find(|page| page.path.as_ref().unwrap() == &path);

  match option_page {
    Some(page) if page.visible => Ok(Response::new(Full::new(Bytes::from("NOT FOUND")))),
    Some(page) if page.authenticated /* && not user */ => Ok(Response::new(Full::new(Bytes::from("REDIRECT TO LOGIN PAGE")))),
    Some(page) => {
      println!("{:?}", page);
      Ok(Response::new(Full::new(Bytes::from("J'AI LA PAGE"))))
    },// call 
    None => {
      let strict_page = get_matching_routes(&path,
        (&pages)
          .into_iter()
          .filter(|p| p.exact && p.path.is_some())
          .map(|p| (p.path.unwrap(), p))
          .collect(),
        true
      );

      let page = if !strict_page.is_empty() {
        strict_page
      } else {
        get_matching_routes(&path,
            (&pages)
              .into_iter()
              .filter(|p| !p.exact && p.path.is_some())
              .map(|p| (p.path.unwrap(), p))
              .collect(),
              false
        )
      };
      println!("{:?}", page);
      Ok(Response::new(Full::new(Bytes::from("J'AI LA PAGE"))))
    }
  }
  // Ok(Response::new(Full::new(Bytes::from(path))))
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
