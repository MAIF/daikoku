use std::{io::Write, path::PathBuf};

use crate::{
    helpers::{
        bytes_to_struct, bytes_to_vec_of_struct, daikoku_cms_api_get, raw_daikoku_cms_api_get,
    },
    logging::{error::DaikokuResult, logger},
    PullCommands,
};

use super::{
    cms::{
        self, create_api_folder, create_mail_folder, Api, CmsPage, IntlTranslationBody,
        TenantMailBody, EXCLUDE_API,
    },
    environments::{get_default_environment, read_apikey_from_secrets},
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

    let environment = get_default_environment()?;

    let apikey = read_apikey_from_secrets(true)?;

    let existing_pages = bytes_to_vec_of_struct::<CmsPage>(
        raw_daikoku_cms_api_get("/pages", &environment.server, &apikey)
            .await?
            .response,
    )?;

    let existing_emails_pages = existing_pages
        .iter()
        .filter(|v| v._id.contains("mails"))
        .collect::<Vec<&CmsPage>>();

    if existing_emails_pages.is_empty() {
        let root_mail_user_translations = bytes_to_struct::<IntlTranslationBody>(
            daikoku_cms_api_get("/translations/_mail?domain=tenant.mail.template")
                .await?
                .response,
        )?;

        let mail_user_template = bytes_to_struct::<IntlTranslationBody>(
            daikoku_cms_api_get("/translations/_mail?domain=mail")
                .await?
                .response,
        )?;

        create_mail_folder(root_mail_user_translations, sources_path.clone(), true)?;
        create_mail_folder(mail_user_template, sources_path.clone(), false)?;
    } else {
        existing_emails_pages.iter().for_each(|item| {
            let file_path = sources_path
                .clone()
                .join(item.path.clone().unwrap().replacen("/", "", 1))
                .join("page.html");

            let file = std::fs::OpenOptions::new()
                .write(true)
                .truncate(true)
                .open(file_path);

            if let Ok(mut email) = file {
                let _ = email.write_all(item.content.clone().as_bytes());

                let _ = email.flush();
            }
        });
    }

    logger::success(format!("<green>Pulling</> done"));

    Ok(())
}
