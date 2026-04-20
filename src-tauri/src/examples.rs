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
const DIJKSTRA: &str = include_str!("../../notebooks/dijkstra.tbk");
const LCS_DP: &str = include_str!("../../notebooks/lcs-dp.tbk");
const METHANE_COMBUSTION: &str = include_str!("../../notebooks/methane-combustion.tbk");
const PERCEPTRON: &str = include_str!("../../notebooks/perceptron-forward.tbk");
const CONVOLUTION: &str = include_str!("../../notebooks/convolution.tbk");
const QUBIT_GATES: &str = include_str!("../../notebooks/qubit-gates.tbk");
const RC_CIRCUIT_SCHEMATIC: &str = include_str!("../../notebooks/rc-circuit-schematic.tbk");

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
        BundledNotebook {
            filename: "dijkstra.tbk".into(),
            content: DIJKSTRA.into(),
        },
        BundledNotebook {
            filename: "lcs-dp.tbk".into(),
            content: LCS_DP.into(),
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
        // Chemistry (uses molecule plugin)
        BundledNotebook {
            filename: "methane-combustion.tbk".into(),
            content: METHANE_COMBUSTION.into(),
        },
        // Machine learning (uses nn + heatmap plugins)
        BundledNotebook {
            filename: "perceptron-forward.tbk".into(),
            content: PERCEPTRON.into(),
        },
        BundledNotebook {
            filename: "convolution.tbk".into(),
            content: CONVOLUTION.into(),
        },
        // Quantum mechanics (uses bloch plugin)
        BundledNotebook {
            filename: "qubit-gates.tbk".into(),
            content: QUBIT_GATES.into(),
        },
        // Electronics (rc-circuit-schematic.tbk uses the circuit plugin)
        BundledNotebook {
            filename: "rc-circuit-schematic.tbk".into(),
            content: RC_CIRCUIT_SCHEMATIC.into(),
        },
        BundledNotebook {
            filename: "rc-circuit.tbk".into(),
            content: RC_CIRCUIT.into(),
        },
    ]
}
