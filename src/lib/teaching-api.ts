// Client-side HTTP helpers for talking to a teacher's teaching server.
// The server's shape is defined in src-tauri/src/teaching_server.rs.

export type TeacherQuizMeta = {
  id: string;
  title: string;
  subject: string;
  tags: string[];
};

export type ServerPing = {
  name: string;
  version: string;
  role: string;
};

function trim(url: string): string {
  return url.replace(/\/+$/, "");
}

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = (body as { error?: string }).error ?? "";
    } catch {
      // non-JSON body
    }
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

export async function pingTeacher(url: string): Promise<ServerPing> {
  const res = await fetch(`${trim(url)}/api/ping`);
  return (await jsonOrThrow(res)) as ServerPing;
}

export async function listTeacherQuizzes(
  url: string,
): Promise<TeacherQuizMeta[]> {
  const res = await fetch(`${trim(url)}/api/quizzes`);
  return (await jsonOrThrow(res)) as TeacherQuizMeta[];
}

export async function fetchTeacherQuiz(
  url: string,
  id: string,
): Promise<string> {
  const res = await fetch(`${trim(url)}/api/quizzes/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
}

export async function submitToTeacher(
  url: string,
  progress: unknown,
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${trim(url)}/api/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(progress),
  });
  return (await jsonOrThrow(res)) as { ok: boolean; id: string };
}

export type QuizPush = {
  id: string;
  notebook_id: string;
  notebook_title: string;
  message?: string | null;
  pushed_at: string;
};

export async function listPushesFromTeacher(
  url: string,
  since?: string,
): Promise<QuizPush[]> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  const res = await fetch(`${trim(url)}/api/pushes${qs}`);
  return (await jsonOrThrow(res)) as QuizPush[];
}

