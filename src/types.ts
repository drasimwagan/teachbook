export type GridPrimitive = {
  type: "grid";
  values: (string | number)[];
  highlight?: number[];
  /** Stable id for React keying (optional). Not used for tween since the grid
   *  composes many cells; identity is managed per-cell via positional keys. */
  id?: string;
  /** Left edge of the grid in viewBox space. Default: centered horizontally. */
  x?: number;
  /** Top edge of the grid in viewBox space. Default: vertically centered. */
  y?: number;
  /** Cell edge size in pixels. Default 60. Use smaller values (e.g. 36) when
   *  multiple grids need to coexist in one scene. */
  cellSize?: number;
  /** Optional label rendered above the grid (e.g. "left", "result"). */
  label?: string;
};

export type ShapePrimitive = {
  type: "shape";
  shape: "circle" | "rect" | "polygon";
  /** Stable id across steps → enables position tweening. */
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  fill?: string;
  stroke?: string;
};

export type ArrowPrimitive = {
  type: "arrow";
  id?: string;
  from: [number, number];
  to: [number, number];
  label?: string;
};

export type LabelPrimitive = {
  type: "label";
  id?: string;
  x: number;
  y: number;
  text: string;
  latex?: boolean;
};

export type AxesPrimitive = {
  type: "axes";
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type PlotPrimitive = {
  type: "plot";
  points: [number, number][];
  label?: string;
};

export type GraphNode = {
  id: string;
  x: number;
  y: number;
  label?: string;
  /** Fill color override. Default depends on `highlight`. */
  fill?: string;
  /** Visual emphasis (e.g. "currently active"). Yellow ring + bold label. */
  highlight?: boolean;
};

/** Simple undirected unweighted edge. */
export type GraphEdgeTuple = [string, string];

/** Rich edge with weight, highlight, and direction overrides. */
export type GraphEdgeObject = {
  from: string;
  to: string;
  weight?: number | string;
  /** Emphasize this edge (e.g. "currently being relaxed"). */
  highlight?: boolean;
  /** Per-edge directed flag; overrides graph-level `directed`. */
  directed?: boolean;
};

export type GraphEdge = GraphEdgeTuple | GraphEdgeObject;

export type GraphPrimitive = {
  type: "graph";
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** If true, all edges without a per-edge override are drawn as arrows. */
  directed?: boolean;
};

export type MatrixPrimitive = {
  type: "matrix";
  /** rows[r][c] — rectangular, all rows same length. */
  rows: (string | number)[][];
  x?: number;
  y?: number;
  cellSize?: number;
  /** (row, col) pairs to highlight. */
  highlight?: [number, number][];
  rowLabels?: string[];
  colLabels?: string[];
  /** Caption above the matrix. */
  label?: string;
};

export type PluginPrimitive = {
  type: `plugin:${string}`;
  [key: string]: unknown;
};

export type ScenePrimitive =
  | GridPrimitive
  | ShapePrimitive
  | ArrowPrimitive
  | LabelPrimitive
  | AxesPrimitive
  | PlotPrimitive
  | GraphPrimitive
  | MatrixPrimitive
  | PluginPrimitive;

export type Scene = { primitives: ScenePrimitive[] };

export type Step = {
  narration: string;
  scene: Scene;
  /**
   * Lines of the cell's code block to highlight for this step, 1-indexed and
   * inclusive on both ends. Relative to the code block, not the source file.
   * Undefined means no code highlight for this step.
   */
  codeLines?: [number, number];
  /**
   * 1-indexed inclusive source-file line range of the scene fence block.
   * Internal (not serialized). Used to cross-highlight the authoring editor.
   */
  sourceLine?: number;
  sourceEndLine?: number;
};

export type QuizItemMcq = {
  kind: "mcq";
  question: string;
  options: string[];
  /** 0-based index into `options`. Author-marked correct choice. */
  correctIndex: number;
  explanation?: string;
};

export type QuizItemTrueFalse = {
  kind: "truefalse";
  question: string;
  correct: boolean;
  explanation?: string;
};

export type QuizItemNumeric = {
  kind: "numeric";
  question: string;
  value: number;
  /** Absolute tolerance for correctness. Default 0. */
  tolerance?: number;
  explanation?: string;
};

export type QuizItemShort = {
  kind: "short";
  question: string;
  /** Model answer / grading rubric. Sent to Claude for grading. */
  rubric: string;
};

export type QuizItem =
  | QuizItemMcq
  | QuizItemTrueFalse
  | QuizItemNumeric
  | QuizItemShort;

export type Cell = {
  kind: "concept" | "quiz";
  prose: string;
  code?: string;
  codeLang?: string;
  steps: Step[];
  /** Legacy single-question fields (backward compat with v0.1 notebooks).
   *  New notebooks should populate `quizItems` instead. */
  question?: string;
  rubric?: string;
  /** Structured quiz items. When present, the test-mode renderer branches
   *  per-kind and grades deterministically for mcq/truefalse/numeric. */
  quizItems?: QuizItem[];
};

export type NotebookMetadata = {
  title: string;
  subject: string;
  author?: string;
  version: string;
  /** Optional free-form tags (e.g. ["intro", "sorting", "assignment"]).
   *  Populated from YAML frontmatter. Used by the Examples filter. */
  tags?: string[];
  /** Soft lock: when true, the app hides answer-revealing UI (Edit mode,
   *  the "Show expected answer" details in Read view). Intended for
   *  teacher-pushed quizzes where the student shouldn't inadvertently
   *  see rubrics or `[x]`-marked options. NOT a security boundary — a
   *  student with shell access can still read the `.tbk` file directly. */
  locked?: boolean;
};

export type Notebook = {
  metadata: NotebookMetadata;
  cells: Cell[];
  totalSteps: number;
  source: string;
};
