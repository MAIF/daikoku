use std::path::PathBuf;

use crate::{
    helpers::{bytes_to_vec_of_struct, get_daikoku_api},
    logging::{error::DaikokuResult, logger},
    models::folder::CmsFile,
    PullCommands,
};

use super::{
    enviroments::{
        get_daikokuignore, get_default_environment, read_cookie_from_environment, Environment,
    },
    projects::{self, create_api_folder, Api, ADMIN_API_ID},
};

pub(crate) async fn run(_commands: Option<PullCommands>) -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Pulling</> project"));
    logger::done();

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let cookie = read_cookie_from_environment(true)?;

    let project = projects::get_default_project()?;

    apis_synchronization(&environment, &host, &cookie, &project).await?;

    logger::success("synchronization done".to_string());

    Ok(())
}

async fn apis_synchronization(
    environment: &Environment,
    host: &String,
    cookie: &String,
    project: &projects::Project,
) -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Pulling</> apis"));

    let sources_path = PathBuf::from(project.path.clone()).join("src");

    let apis_informations: Vec<Api> = bytes_to_vec_of_struct::<Api>(
        get_daikoku_api(
            "/apis?fields=_id,_humanReadableId,header,description",
            &host,
            &environment,
            &cookie,
        )
        .await?,
    )?
    .into_iter()
    .filter(|api| api._id != ADMIN_API_ID)
    .collect();

    let created = create_api_folder(apis_informations, sources_path.clone())?;

    if created.is_empty() {
        logger::indent_println("nothing to pull".to_string());
    }

    logger::success(format!("<green>Pulling</> done"));

    Ok(())
}
