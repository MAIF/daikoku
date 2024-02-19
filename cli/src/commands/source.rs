use std::fs;
use std::path::Path;
use std::str::FromStr;

use crate::logging::error::DaikokuCliError;
use crate::logging::error::DaikokuResult;
use crate::logging::logger;
use crate::models::folder::Ext;
use crate::models::folder::FilePath;
use crate::models::folder::SourceExtension;
use crate::models::folder::ToContentType;
use crate::models::folder::FOLDER_NAMES;
use crate::SourceCommands;

// use super::configuration::get_sources_root;
use super::watch::read_cms_pages;

pub(crate) fn run(command: SourceCommands) -> DaikokuResult<()> {
    match command {
        SourceCommands::New {
            name,
            extension,
            visible,
            authenticated,
            path,
            exact,
            block,
            overwrite,
        } => new_file(
            name,
            extension,
            visible,
            authenticated,
            path,
            exact,
            block,
            overwrite.unwrap_or(false),
        ),
        SourceCommands::Delete {
            id,
            name,
            extension,
        } => remove_file(id, name, extension),
    }
}

fn remove_file(
    id: Option<String>,
    name: Option<String>,
    extension: Option<String>,
) -> DaikokuResult<()> {
    Ok(())
    // logger::loading("<yellow>Deleting</> file ...".to_string());

    // let mut contents = read_cms_pages();

    // if let Some(page) = contents.pages.iter().find(|p| match (&id, &name, &extension) {
    //     (Some(file_id), _, _) => &p._id == file_id,
    //     (_, Some(filename), Some(file_extension)) => {
    //         &p.name == filename
    //             && p.content_type
    //                 == SourceExtension::from_str(&file_extension)
    //                     .unwrap()
    //                     .content_type()
    //     }
    //     (_, _, _) => false,
    // }) {
    //     let root_path = get_sources_root().unwrap(); // TOOD - handle error
    //     let source = SourceExtension::from_str(page.content_type.as_str()).unwrap();
    //     let filepath = search_filepath(
    //         &root_path,
    //         &source.path(),
    //         &format!("{}{}", &page.name, &source.ext()),
    //     )?;

    //     match fs::remove_file(&filepath) {
    //         Ok(()) => {
    //             logger::loading("<green>File deleted successfully".to_string());
    //             match contents.remove_file(id, name, extension) {
    //                 Ok(_) => {
    //                     logger::println("<green>CMS updated</>".to_string());
    //                     Ok(())
    //                 }
    //                 Err(e) => Err(e),
    //             }
    //         }
    //         Err(e) => Err(DaikokuCliError::FileSystem(e.to_string())),
    //     }
    // } else {
    //     Err(DaikokuCliError::FileSystem("page not found".to_string()))
    // }
}

fn search_filepath(
    root_path: &String,
    expected_folder: &String,
    filename: &String,
) -> DaikokuResult<std::path::PathBuf> {
    let expected_path = Path::new(&root_path)
        .join("src")
        .join(&expected_folder)
        .join(&filename)
        .to_path_buf();
    if expected_path.exists() {
        Ok(expected_path)
    } else {
        let folder = FOLDER_NAMES.iter().find(|p| {
            Path::new(&root_path)
                .join("src")
                .join(&p)
                .join(&filename)
                .to_path_buf()
                .exists()
        });

        match folder {
            Some(path) => Ok(Path::new(&root_path)
                .join("src")
                .join(&path)
                .join(&filename)
                .to_path_buf()),
            None => Err(DaikokuCliError::FileSystem(
                "failed to find file in all directories".to_string(),
            )),
        }
    }
}

fn new_file(
    name: String,
    extension: String,
    visible: Option<bool>,
    authenticated: Option<bool>,
    path: Option<String>,
    exact: Option<bool>,
    block: Option<bool>,
    overwrite: bool,
) -> DaikokuResult<()> {
    Ok(())
    // logger::loading("<yellow>Creating</> new source file ...".to_string());

    // let source = SourceExtension::from_str(&extension.as_str()).unwrap();

    // let mut folder_path = source.path();

    // if let Some(true) = block {
    //     folder_path = "blocks".to_string();
    // } else if path.is_none() {
    //     return Err(DaikokuCliError::Configuration(
    //         "you need to specify a exposition path to create a page".to_string(),
    //     ));
    // }

    // let mut summary = read_cms_pages();
    // let already_present = summary.contains_page(&name, &source.content_type());

    // match (already_present, get_sources_root()) {
    //     (_, None) => Err(DaikokuCliError::FileSystem(
    //         "missing root sources path".to_string(),
    //     )),
    //     (true, _) if !overwrite => Err(DaikokuCliError::FileSystem(
    //         "a source file of the same name and type already exists".to_string(),
    //     )),
    //     (_, Some(root_path)) => {
    //         let filepath = Path::new(&root_path)
    //             .join("src")
    //             .join(&folder_path)
    //             .join(format!("{}{}", &name, &source.ext()))
    //             .to_path_buf();

    //         logger::println(format!("<green>At path {:?}</>", &filepath).to_string());
    //         match fs::File::create(filepath) {
    //             Ok(_) => {
    //                 logger::println("<green>Source file created</>".to_string());
    //                 logger::println("<yellow>Starting</> patch the summary file".to_string());

    //                 let _ = summary.add_new_file(
    //                     name,
    //                     visible,
    //                     authenticated,
    //                     path,
    //                     exact,
    //                     &source.content_type(),
    //                     overwrite,
    //                 )?;

    //                 logger::println("<green>Summary has been patched</>".to_string());
    //                 Ok(())
    //             }
    //             Err(e) => Err(DaikokuCliError::FileSystem(format!(
    //                 "failed to create new source file : {}",
    //                 e.to_string()
    //             ))),
    //         }
    //     }
    // }
}
