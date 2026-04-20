use serde::Serialize;

#[derive(Serialize)]
pub struct BundledNotebook {
    pub filename: String,
    pub content: String,
}

const BUBBLE_SORT: &str = include_str!("../../notebooks/bubble-sort.tbk");
const BFS_GRAPH: &str = include_str!("../../notebooks/bfs-graph.tbk");
const PROJECTILE_MOTION: &str = include_str!("../../notebooks/projectile-motion.tbk");

#[tauri::command]
pub fn list_bundled_notebooks() -> Vec<BundledNotebook> {
    vec![
        BundledNotebook {
            filename: "bubble-sort.tbk".into(),
            content: BUBBLE_SORT.into(),
        },
        BundledNotebook {
            filename: "bfs-graph.tbk".into(),
            content: BFS_GRAPH.into(),
        },
        BundledNotebook {
            filename: "projectile-motion.tbk".into(),
            content: PROJECTILE_MOTION.into(),
        },
    ]
}
