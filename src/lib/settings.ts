import { invoke } from "@tauri-apps/api/core";

export type TeachingServerConfig = {
  enabled: boolean;
  port: number;
  bind_address: string;
};

export type Settings = {
  teaching_server: TeachingServerConfig;
  teacher_url?: string;
  student_name?: string;
};

export const DEFAULT_SETTINGS: Settings = {
  teaching_server: {
    enabled: false,
    port: 7480,
    bind_address: "0.0.0.0",
  },
};

export async function getSettings(): Promise<Settings> {
  const raw = await invoke<Settings>("get_settings");
  // Guard against missing fields from an older settings.json.
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    teaching_server: {
      ...DEFAULT_SETTINGS.teaching_server,
      ...(raw?.teaching_server ?? {}),
    },
  };
}

export async function setSettings(s: Settings): Promise<void> {
  await invoke("set_settings", { settings: s });
}

export type ServerStatus = {
  running: boolean;
  address?: string | null;
};

export async function startTeachingServer(
  bindAddress: string,
  port: number,
): Promise<ServerStatus> {
  return invoke<ServerStatus>("start_teaching_server", {
    bindAddress,
    port,
  });
}

export async function stopTeachingServer(): Promise<void> {
  await invoke("stop_teaching_server");
}

export async function teachingServerStatus(): Promise<ServerStatus> {
  return invoke<ServerStatus>("teaching_server_status");
}
