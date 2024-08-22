use std::path::PathBuf;

use bytes::Bytes;

use crate::{
    helpers::post_daikoku_api,
    interactive::prompt,
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    models::folder::{read_documentations, read_sources_and_daikoku_metadata, CmsFile},
};

use super::{
    enviroments::{
        get_daikokuignore, get_default_environment, read_cookie_from_environment, Environment,
    },
    projects,
};

pub(crate) async fn run() -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Syncing</> project"));
    logger::done();

    logger::info("What kind of synchronization ? Only write the identifier.".to_string());
    logger::info("ID - Description".to_string());
    logger::info(" 1 - Global".to_string());
    logger::info(" 2 - Documentation page".to_string());
    logger::info(" 3 - API page".to_string());
    logger::info(" 4 - Mail page".to_string());

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let cookie = read_cookie_from_environment(true)?;

    let project = projects::get_default_project()?;

    let identifier = prompt()?;

    match identifier.trim() {
        "1" => synchronization(None, &environment, &host, &cookie, &project).await?,
        "2" => documentations_synchronization(&environment, &host, &cookie, &project).await?,
        "3" => {
            synchronization(
                Some("apis".to_string()),
                &environment,
                &host,
                &cookie,
                &project,
            )
            .await?
        }
        "4" => {
            synchronization(
                Some("mails".to_string()),
                &environment,
                &host,
                &cookie,
                &project,
            )
            .await?
        }
        _ => {
            return Err(DaikokuCliError::ParsingError(
                "Invalid identifier".to_string(),
            ))
        }
    }

    logger::success("synchronization done".to_string());

    Ok(())
}

// async fn global_synchronization(
//     environment: &Environment,
//     host: &String,
//     cookie: &String,
//     project: &projects::Project,
// ) -> DaikokuResult<()> {
//     logger::loading(format!("<yellow>Syncing</> project"));

//     let mut body = read_sources_and_daikoku_metadata(&PathBuf::from(&project.path))?;

//     apply_daikoku_ignore(&mut body)?;

//     let body = Bytes::from(
//         serde_json::to_string(&body)
//             .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?,
//     );

//     post_daikoku_api("/cms/sync", &host, &environment, &cookie, body).await?;

//     Ok(())
// }

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

async fn synchronization(
    folder: Option<String>,
    environment: &Environment,
    host: &String,
    cookie: &String,
    project: &projects::Project,
) -> DaikokuResult<()> {
    logger::loading(format!(
        "<yellow>Syncing</> {:#?}",
        folder.clone().unwrap_or("global".to_string())
    ));

    let mut path = PathBuf::from(project.path.clone()).join("src");

    if let Some(folder) = folder {
        path = path.join(folder);
    }

    let mut body = read_sources_and_daikoku_metadata(&path)?;

    logger::info(format!("Synchronization of {:?} pages", body.len()));
    body.iter().for_each(|page| {
        logger::info(format!(
            "Synchronization of {:?} with path {:?}",
            page.name,
            page.path()
        ))
    });

    apply_daikoku_ignore(&mut body)?;

    let body = Bytes::from(
        serde_json::to_string(&body)
            .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?,
    );

    post_daikoku_api("/cms/sync", &host, &environment, &cookie, body).await?;

    Ok(())
}

async fn documentations_synchronization(
    environment: &Environment,
    host: &String,
    cookie: &String,
    project: &projects::Project,
) -> DaikokuResult<()> {
    logger::loading("<yellow>Syncing</> documentations pages".to_string());

    let path = PathBuf::from(project.path.clone()).join("src").join("apis");

    let mut body = read_documentations(&path)?;

    logger::info(format!("Synchronization of {:?} pages", body.len()));
    body.iter().for_each(|page| {
        logger::info(format!(
            "Synchronization of {:?} with path {:?}",
            page.name,
            page.path()
        ))
    });

    apply_daikoku_ignore(&mut body)?;

    let body = Bytes::from(
        serde_json::to_string(&body)
            .map_err(|err| DaikokuCliError::ParsingError(err.to_string()))?,
    );

    post_daikoku_api("/cms/sync", &host, &environment, &cookie, body).await?;

    Ok(())
}
