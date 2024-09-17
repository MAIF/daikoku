use std::path::PathBuf;

use crate::{
    helpers::{bytes_to_vec_of_struct, daikoku_cms_api_get},
    logging::{error::DaikokuResult, logger},
    PullCommands,
};

use super::{
    cms::{self, create_api_folder, Api, EXCLUDE_API},
    enviroments::{get_default_environment, read_apikey_from_secrets, Environment},
};

pub(crate) async fn run(commands: PullCommands) -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Pulling</> apis"));
    logger::done();

    let environment = get_default_environment()?;

    let host = environment
        .server
        .replace("http://", "")
        .replace("https://", "");

    let apikey = read_apikey_from_secrets(true)?;

    let project = cms::get_default_project()?;

    match commands {
        PullCommands::Apis { id } => {
            apis_synchronization(&environment, &host, &apikey, &project, id).await?
        }
    };

    logger::success("synchronization done".to_string());

    Ok(())
}

async fn apis_synchronization(
    environment: &Environment,
    host: &String,
    apikey: &String,
    project: &cms::Project,
    api_id: Option<String>,
) -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Pulling</> apis"));

    let sources_path = PathBuf::from(project.path.clone()).join("src");

    let apis_informations: Vec<Api> = bytes_to_vec_of_struct::<Api>(
        daikoku_cms_api_get("/apis?fields=_id,_humanReadableId,header,description")
            .await?
            .response,
    )?
    .into_iter()
    .filter(|api| {
        !EXCLUDE_API.contains(&api._id.as_str())
            && api_id.clone().map(|id| api._id == id).unwrap_or(true)
    })
    .collect();

    let created = create_api_folder(apis_informations, sources_path.clone())?;

    if created.is_empty() {
        logger::indent_println("nothing to pull".to_string());
    }

    logger::success(format!("<green>Pulling</> done"));

    Ok(())
}
