use serde::Serialize;

#[derive(Serialize)]
pub struct BundledNotebook {
    pub filename: String,
    pub content: String,
}

const BUBBLE_SORT: &str = include_str!("../../notebooks/bubble-sort.tbk");
const BFS_GRAPH: &str = include_str!("../../notebooks/bfs-graph.tbk");
const PROJECTILE_MOTION: &str = include_str!("../../notebooks/projectile-motion.tbk");
const BINARY_SEARCH: &str = include_str!("../../notebooks/binary-search.tbk");
const MERGE_SORT: &str = include_str!("../../notebooks/merge-sort.tbk");
const SHM: &str = include_str!("../../notebooks/simple-harmonic-motion.tbk");
const MITOSIS: &str = include_str!("../../notebooks/mitosis.tbk");
const RC_CIRCUIT: &str = include_str!("../../notebooks/rc-circuit.tbk");

#[tauri::command]
pub fn list_bundled_notebooks() -> Vec<BundledNotebook> {
    vec![
        // Algorithms — simple → complex
        BundledNotebook {
            filename: "binary-search.tbk".into(),
            content: BINARY_SEARCH.into(),
        },
        BundledNotebook {
            filename: "bubble-sort.tbk".into(),
            content: BUBBLE_SORT.into(),
        },
        BundledNotebook {
            filename: "merge-sort.tbk".into(),
            content: MERGE_SORT.into(),
        },
        BundledNotebook {
            filename: "bfs-graph.tbk".into(),
            content: BFS_GRAPH.into(),
        },
        // Physics
        BundledNotebook {
            filename: "projectile-motion.tbk".into(),
            content: PROJECTILE_MOTION.into(),
        },
        BundledNotebook {
            filename: "simple-harmonic-motion.tbk".into(),
            content: SHM.into(),
        },
        // Biology
        BundledNotebook {
            filename: "mitosis.tbk".into(),
            content: MITOSIS.into(),
        },
        // Electronics
        BundledNotebook {
            filename: "rc-circuit.tbk".into(),
            content: RC_CIRCUIT.into(),
        },
    ]
}
