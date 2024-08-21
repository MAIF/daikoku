use std::{collections::HashMap, path::PathBuf, str::FromStr};

use crate::{
    commands::projects::create_path_and_file,
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    },
    models::folder::{read_sources, CmsFile, SourceExtension},
    GenerateCommands,
};

use super::projects::get_default_project;

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

    logger::info("\nThis is the apis list. Write the APIs number".to_string());

    let apis_path = PathBuf::from_str(&project.path)
        .unwrap()
        .join("src")
        .join("apis");

    let mut apis = read_sources(apis_path.clone())?;
    apis.dedup_by(|a, b| {
        a.path().replace("apis/", "").split("/").nth(0).unwrap()
            == b.path().replace("apis/", "").split("/").nth(0).unwrap()
    });

    logger::info("ID : Name".to_string());
    apis.iter().enumerate().for_each(|(index, api)| {
        let line = format!(
            "{} : {:?}",
            index,
            api.path().replace("apis/", "").split("/").nth(0).unwrap()
        );
        logger::info(line);
    });

    let mut input = String::new();
    std::io::stdin()
        .read_line(&mut input)
        .expect("Error reading input.");

    let index = input.trim().parse::<usize>().unwrap();

    let api_file: CmsFile = apis
        .into_iter()
        .nth(index)
        .ok_or(DaikokuCliError::FileSystem("wrong id".to_string()))?;

    let api_path = api_file.path().clone();
    let api_name = api_path.split("/").nth(1).unwrap();

    let documentations_path: PathBuf = apis_path.join(api_name).join("documentations");

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

    create_path_and_file(
        page_path,
        format!("Documentation of the {} page", api_name),
        api_name.to_string(),
        metadata,
        SourceExtension::HTML,
    )?;

    logger::success("generation done".to_string());

    Ok(())
}
