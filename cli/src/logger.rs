use once_cell::sync::Lazy;
use paris::Logger;

static mut LOADING_LOGGER: once_cell::sync::Lazy<Logger> = Lazy::new(|| Logger::new());
static mut LOADING_MESSAGE: once_cell::sync::Lazy<Option<String>> =
    Lazy::new(|| Some(String::new()));

pub fn println(str: String) {
    check_loading();
    let mut logger = Logger::new();
    logger.info(str.replace("\n", ""));
}

pub fn indent_println(str: String) {
    check_loading();
    let mut logger = Logger::new();
    logger.indent(1).info(str.replace("\n", ""));
}

pub fn check_loading() {
    unsafe {
        if (*LOADING_MESSAGE).is_some() {
            LOADING_LOGGER
                .done();

            if !(*LOADING_MESSAGE).as_ref().unwrap().is_empty() {
                LOADING_LOGGER.success(&(*LOADING_MESSAGE.as_ref().unwrap()));
            }
            *LOADING_MESSAGE = None;
        }
    }
}

pub fn log(_: String) {
    // let mut logger = Logger::new();
    // logger.log(str);
}

pub fn error(str: String) {
    check_loading();
    let mut logger = Logger::new();
    logger.error(str);
}

pub fn success(str: String) {
    unsafe {
        LOADING_LOGGER.done();
        *LOADING_MESSAGE = None;
    }
    let mut logger = Logger::new();
    logger.success(str);
}

pub fn loading(str: String) {
    check_loading();
    unsafe {
        LOADING_LOGGER.loading(&str);
        *LOADING_MESSAGE = Some(str);
    }
}
