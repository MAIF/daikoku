use std::path::PathBuf;

use bytes::Bytes;

use crate::{
    helpers::daikoku_cms_api_post,
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    models::folder::{read_sources_and_daikoku_metadata, CmsFile},
    utils::PathBufExt,
};

use super::{
    cms::{self},
    environments::get_daikokuignore,
};

pub(crate) async fn run(dry_run: Option<bool>, file_path: Option<String>) -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Pushing</> project"));
    logger::done();

    let project = cms::get_default_project()?;

    let path = PathBuf::from(project.path.clone()).join("src");

    let mut local_pages = read_sources_and_daikoku_metadata(&path)?;

    if let Some(specific_path) = file_path {
        local_pages.retain(|file| {
            file.path() == specific_path
                || path
                    .concat(&file.path())
                    .to_str()
                    .expect("Failed to convert path to string")
                    .starts_with(
                        path.concat(&specific_path)
                            .to_str()
                            .expect("Failed to convert path to string"),
                    )
        });

        if local_pages.len() == 0 {
            return Err(DaikokuCliError::FileSystem(format!(
                "file not found at path {}",
                specific_path
            )));
        }
    }

    let _ = synchronization(&mut local_pages, dry_run.unwrap_or(false)).await?;

    if dry_run.unwrap_or(false) {
        logger::success("[dry_run] synchronization done".to_string());
    } else {
        logger::success("synchronization done".to_string());
    }

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

async fn synchronization(body: &mut Vec<CmsFile>, dry_run: bool) -> DaikokuResult<()> {
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

    if !dry_run {
        daikoku_cms_api_post("/sync", body, true).await?;
    }

    Ok(())
}
