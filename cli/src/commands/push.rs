use std::path::PathBuf;

use bytes::Bytes;

use crate::{
    commands::cms::CmsPage,
    helpers::{bytes_to_vec_of_struct, daikoku_cms_api_get, daikoku_cms_api_post},
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    models::folder::{read_documentations, read_sources_and_daikoku_metadata, CmsFile},
};

use super::{
    cms::{self, Api},
    enviroments::{
        get_daikokuignore, get_default_environment, read_cookie_from_environment, Environment,
    },
};

pub(crate) async fn run(dry_run: Option<bool>, file_path: Option<String>) -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Pushing</> project"));
    logger::done();

    let environment = get_default_environment()?;

    let project = cms::get_default_project()?;

    let path = PathBuf::from(project.path.clone()).join("src");

    let mut local_pages = read_sources_and_daikoku_metadata(&path)?;

    let _ = synchronization(&mut local_pages).await?;

    logger::success("synchronization done".to_string());

    Ok(())
}

fn apply_daikoku_ignore(items: &mut Vec<CmsFile>) -> DaikokuResult<()> {
    let daikoku_ignore = get_daikokuignore()?;

    let rules: Vec<&String> = daikoku_ignore
        .iter()
        .filter(|line| !line.is_empty())
        .collect::<Vec<&String>>();

    if !rules.is_empty() {
        logger::println("Excluded files and folders".to_string());
    }

    items.retain(|file| {
        let retained = daikoku_ignore
            .iter()
            .filter(|line| !line.is_empty())
            .find(|&line| {
                line == &file.name || line == &file.path() || file.path().starts_with(line)
            })
            .is_none();

        if !retained {
            logger::println(file.name.to_string());
        }

        retained
    });

    Ok(())
}

async fn synchronization(body: &mut Vec<CmsFile>) -> DaikokuResult<()> {
    logger::loading("<yellow>Syncing</>".to_string());

    logger::info(format!("Synchronization of {:?} pages", body.len()));
    body.iter().for_each(|page| {
        logger::info(format!(
            "Synchronization of {:?} with path {:?}",
            page.name,
            page.path()
        ))
    });

    apply_daikoku_ignore(body)?;

    let body = Bytes::from(
        serde_json::to_string(&body)
            .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?,
    );

    daikoku_cms_api_post("/sync", body).await?;

    Ok(())
}
