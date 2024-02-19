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

use super::configuration::get_sources_root;
use super::watch::read_cms_pages;

pub(crate) fn run(
    name: String,
    extension: String,
    visible: Option<bool>,
    authenticated: Option<bool>,
    path: Option<String>,
    exact: Option<bool>,
    block: Option<bool>,
) -> DaikokuResult<()> {
    logger::loading("<yellow>Creating</> new source file ...".to_string());

    let source = SourceExtension::from_str(&extension.as_str()).unwrap();

    let mut folder_path = source.path();

    if let Some(true) = block {
        folder_path = "blocks".to_string();
    } else if path.is_none() {
        return Err(DaikokuCliError::Configuration("you need to specify a path to create a page".to_string()))
    }

    let mut summary = read_cms_pages();
    let already_present = summary.pages
        .iter()
        .find(|p| p.name == name && p.content_type == source.content_type())
        .is_some();

    match (already_present, get_sources_root()) {
        (_, None) => Err(DaikokuCliError::FileSystem(
            "missing root sources path".to_string(),
        )),
        (true, _) => Err(DaikokuCliError::FileSystem(
            "a source file of the same name and type already exists".to_string(),
        )),
        (_, Some(root_path)) => {
            let filepath = Path::new(&root_path)
                .join("src")
                .join(&folder_path)
                .join(format!("{}{}", &name, &source.ext()))
                .to_path_buf();

            logger::println(format!("<green>At path {:?}</>", &filepath).to_string());
            match fs::File::create(filepath) {
                Ok(_) => {
                    logger::println("<green>Source file created</>".to_string());
                    logger::println("<yellow>Starting</> patch the summary file".to_string());

                    match summary.add_new_file(
                        name,
                        visible,
                        authenticated,
                        path,
                        exact,
                        source.content_type()
                    ) {
                        Ok(_) => {
                            logger::println("<green>Summary has been patched</>".to_string());
                            Ok(())
                        },
                        Err(e) => Err(DaikokuCliError::FileSystem(format!(
                            "failed to create new source file : {}",
                            e.to_string()
                        )))
                    }
                }
                Err(e) => Err(DaikokuCliError::FileSystem(format!(
                    "failed to create new source file : {}",
                    e.to_string()
                ))),
            }
        }
    }
}
