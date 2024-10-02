use std::path::PathBuf;

use crate::{
    helpers::{bytes_to_struct, bytes_to_vec_of_struct, daikoku_cms_api_get},
    logging::{error::DaikokuResult, logger},
    PullCommands,
};

use super::cms::{
    self, create_api_folder, create_mail_folder, create_mail_tenant, Api, IntlTranslationBody,
    TenantMailBody, EXCLUDE_API,
};

pub(crate) async fn run(commands: PullCommands) -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Pulling</> apis"));
    logger::done();

    let project = cms::get_default_project()?;

    match commands {
        PullCommands::Apis { id } => apis_synchronization(&project, id).await?,
        PullCommands::Mails {} => mails_synchronization(&project).await?,
    };

    logger::success("synchronization done".to_string());

    Ok(())
}

async fn apis_synchronization(project: &cms::Project, api_id: Option<String>) -> DaikokuResult<()> {
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

async fn mails_synchronization(project: &cms::Project) -> DaikokuResult<()> {
    logger::loading(format!("<yellow>Pulling</> apis"));

    let sources_path = PathBuf::from(project.path.clone()).join("src");

    let root_mail_tenant =
        bytes_to_struct::<TenantMailBody>(daikoku_cms_api_get("/tenants/default").await?.response)?;

    let root_mail_user_translations = bytes_to_struct::<IntlTranslationBody>(
        daikoku_cms_api_get("/translations/_mail?domain=tenant.mail.template")
            .await?
            .response,
    )?;

    create_mail_tenant(root_mail_tenant, sources_path.clone())?;
    create_mail_folder(root_mail_user_translations, sources_path.clone(), true)?;

    logger::success(format!("<green>Pulling</> done"));

    Ok(())
}
