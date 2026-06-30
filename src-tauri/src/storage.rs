use std::{
    env,
    path::{Path, PathBuf},
};

pub const PORTABLE_STORAGE_DIRNAME: &str = "RHODES OBS COMMANDER3373 Data";
pub const DEV_STORAGE_DIRNAME: &str = "user-data";

#[derive(Debug, Clone)]
pub struct StorageContext {
    pub app_root: PathBuf,
    pub exec_path: PathBuf,
    pub is_packaged: bool,
    pub portable_executable_dir: Option<String>,
    pub portable_executable_file: Option<String>,
    pub override_state_dir: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageTarget {
    pub storage_dir: PathBuf,
    pub state_dir: PathBuf,
}

impl StorageContext {
    pub fn from_runtime(app_root: PathBuf, is_packaged: bool) -> Self {
        Self {
            app_root,
            exec_path: env::current_exe().unwrap_or_else(|_| PathBuf::from(".")),
            is_packaged,
            portable_executable_dir: env::var("PORTABLE_EXECUTABLE_DIR").ok(),
            portable_executable_file: env::var("PORTABLE_EXECUTABLE_FILE").ok(),
            override_state_dir: env::var("ARKNIGHTS_STATE_DIR").ok(),
        }
    }
}

fn clean_path(value: &Option<String>) -> Option<PathBuf> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn portable_executable_dir(context: &StorageContext) -> Option<PathBuf> {
    if let Some(path) = clean_path(&context.portable_executable_dir) {
        return Some(path);
    }
    if let Some(path) = clean_path(&context.portable_executable_file) {
        return path.parent().map(Path::to_path_buf);
    }
    let exec_dir = context.exec_path.parent()?.to_path_buf();
    if exec_dir
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("win-unpacked"))
    {
        return exec_dir.parent().map(Path::to_path_buf);
    }
    Some(exec_dir)
}

pub fn portable_storage_dir(context: &StorageContext) -> PathBuf {
    let base = if context.is_packaged {
        portable_executable_dir(context).unwrap_or_else(|| context.app_root.clone())
    } else {
        context.app_root.clone()
    };
    base.join(if context.is_packaged {
        PORTABLE_STORAGE_DIRNAME
    } else {
        DEV_STORAGE_DIRNAME
    })
}

pub fn storage_target(context: &StorageContext) -> StorageTarget {
    let storage_dir = portable_storage_dir(context);
    let state_dir =
        clean_path(&context.override_state_dir).unwrap_or_else(|| storage_dir.join("state"));
    StorageTarget {
        storage_dir,
        state_dir,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context(exec_path: &str, is_packaged: bool) -> StorageContext {
        StorageContext {
            app_root: PathBuf::from("O:/Arknights_Rogue_OBSTool"),
            exec_path: PathBuf::from(exec_path),
            is_packaged,
            portable_executable_dir: None,
            portable_executable_file: None,
            override_state_dir: None,
        }
    }

    #[test]
    fn packaged_portable_storage_sits_beside_executable() {
        let context = context("D:/Apps/RHODES/RHODES OBS COMMANDER3373.exe", true);
        assert_eq!(
            portable_storage_dir(&context),
            PathBuf::from("D:/Apps/RHODES").join(PORTABLE_STORAGE_DIRNAME)
        );
    }

    #[test]
    fn packaged_portable_storage_follows_original_portable_file() {
        let mut context = context(
            "C:/Users/owner/AppData/Local/Temp/.mount/RHODES OBS COMMANDER3373.exe",
            true,
        );
        context.portable_executable_file =
            Some("E:/Tools/RHODES OBS COMMANDER3373-0.1.0-x64.exe".into());
        assert_eq!(
            portable_storage_dir(&context),
            PathBuf::from("E:/Tools").join(PORTABLE_STORAGE_DIRNAME)
        );
    }

    #[test]
    fn packaged_portable_storage_treats_win_unpacked_as_build_output() {
        let context = context(
            "O:/Arknights_Rogue_OBSTool/dist/win-unpacked/RHODES OBS COMMANDER3373.exe",
            true,
        );
        assert_eq!(
            portable_storage_dir(&context),
            PathBuf::from("O:/Arknights_Rogue_OBSTool/dist").join(PORTABLE_STORAGE_DIRNAME)
        );
    }

    #[test]
    fn development_storage_stays_inside_project_user_data() {
        let context = context("C:/Electron/electron.exe", false);
        assert_eq!(
            portable_storage_dir(&context),
            PathBuf::from("O:/Arknights_Rogue_OBSTool").join(DEV_STORAGE_DIRNAME)
        );
    }

    #[test]
    fn explicit_state_dir_overrides_portable_state() {
        let mut context = context("D:/Apps/RHODES/RHODES OBS COMMANDER3373.exe", true);
        context.override_state_dir = Some("O:/Arknights_Rogue_OBSTool/data".into());
        assert_eq!(
            storage_target(&context).state_dir,
            PathBuf::from("O:/Arknights_Rogue_OBSTool/data")
        );
    }
}
