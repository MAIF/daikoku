use std::{
    fs,
    path::{Path, PathBuf},
};

use async_recursion::async_recursion;

use crate::{
    logging::{
        error::{DaikokuCliError, DaikokuResult},
        logger,
    }, process, Commands
};

use std::io::Write;

const ZIP_CMS: &[u8] = include_bytes!("../../templates/empty.zip");

pub(crate) async fn run(
    template: Option<String>,
    name: String,
    path: Option<String>,
) -> DaikokuResult<()> {
    logger::loading("<yellow>Creating</> plugin ...".to_string());

    let manifest_dir = std::env::temp_dir();

    let template = template.unwrap_or("empty".to_string());

    let zip_bytes = match template.as_str() {
        _ => ZIP_CMS,
    };
    let zip_path = Path::new(&manifest_dir).join(format!("{}.zip", template));

    match std::path::Path::new(&zip_path).exists() {
        true => (),
        false => {
            logger::indent_println(format!(
                "turn template bytes to zip file, {}",
                &zip_path.to_string_lossy()
            ));
            match fs::File::create(&zip_path) {
                Ok(mut file) => match file.write_all(zip_bytes) {
                    Err(err) => return Err(DaikokuCliError::FileSystem(err.to_string())),
                    Ok(()) => (),
                },
                Err(e) => return Err(DaikokuCliError::FileSystem(e.to_string())),
            };
        }
    }

    logger::indent_println("<yellow>Unzipping</> the template ...".to_string());
    let zip_action = zip_extensions::read::zip_extract(&PathBuf::from(zip_path), &manifest_dir);

    match zip_action {
        Ok(()) => rename_plugin(template, name, path).await,
        Err(er) => Err(DaikokuCliError::FileSystem(er.to_string())),
    }
}

#[async_recursion]
async fn rename_plugin(template: String, name: String, path: Option<String>) -> DaikokuResult<()> {
    let complete_path = match &path {
        Some(p) => Path::new(p).join(&name),
        None => Path::new("./").join(&name),
    };

    let _ = match &path {
        Some(p) => fs::create_dir_all(p),
        None => Result::Ok(()),
    };

    let manifest_dir = std::env::temp_dir();

    logger::indent_println(format!(
        "<yellow>Write</> plugin from {} to {}",
        &Path::new(&manifest_dir)
            .join(format!("{}", template))
            .to_string_lossy(),
        &complete_path.to_string_lossy()
    ));

    match std::fs::rename(
        Path::new(&manifest_dir).join(format!("{}", template)),
        &complete_path,
    ) {
        Ok(()) => {
            process(Commands::Projects {
                command: crate::ProjectCommands::Add {
                    name: name,
                    path: complete_path.into_os_string().into_string().unwrap(),
                    overwrite: None,
                },
            })
            .await?;
            logger::println("<green>CMS created</>".to_string());
            Ok(())
        }
        Err(e) => Err(DaikokuCliError::CmsCreationFile(e.to_string())),
    }
}
