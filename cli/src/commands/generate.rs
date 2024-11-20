use std::{collections::HashMap, path::PathBuf, str::FromStr};

use uuid::Uuid;

use crate::{
    commands::cms::create_path_and_file,
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    models::folder::SourceExtension,
    GenerateCommands,
};

use super::cms::get_default_project;

pub(crate) async fn run(command: GenerateCommands) -> DaikokuResult<()> {
    match command {
        GenerateCommands::Documentation {
            filename,
            title,
            desc,
        } => generate_documentation_page(filename, title, desc).await,
    }
}

fn exists(filename: &String) -> DaikokuResult<()> {
    let project = get_default_project()?;

    let file_path = PathBuf::from(&project.path).join(filename);

    if file_path.exists() {
        return Err(DaikokuCliError::CmsCreationFile(
            "A file with the same name already exists".to_string(),
        ));
    }

    Ok(())
}

async fn generate_documentation_page(
    filename: String,
    title: String,
    desc: String,
) -> DaikokuResult<()> {
    logger::loading("<yellow>Generating</> new documentation".to_string());

    exists(&filename)?;

    let project = get_default_project()?;

    logger::done();

    let documentations_path = PathBuf::from_str(&project.path)
        .unwrap()
        .join("src")
        .join("documentations");

    let page_path = documentations_path
        .clone()
        .join(format!("{}.html", filename));

    if page_path.exists() {
        return Err(DaikokuCliError::FileSystem(
            "Documentation page alread exitsts in your project".to_string(),
        ));
    }

    let mut metadata = HashMap::new();
    metadata.insert("title".to_string(), title);
    metadata.insert("description".to_string(), desc);
    metadata.insert("id".to_string(), Uuid::new_v4().to_string());

    create_path_and_file(
        page_path,
        format!("Documentation of the {} page", filename),
        filename.to_string(),
        metadata,
        SourceExtension::HTML,
    )?;

    logger::success("generation done".to_string());

    Ok(())
}
