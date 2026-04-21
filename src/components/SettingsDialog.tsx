import { useCallback, useEffect, useState } from "react";
import {
  getSettings,
  setSettings,
  startTeachingServer,
  stopTeachingServer,
  teachingServerStatus,
  type ServerStatus,
  type Settings,
} from "../lib/settings";
import { pingTeacher } from "../lib/teaching-api";

type Props = {
  open: boolean;
  onClose: () => void;
};

type ProbeResult =
  | { state: "idle" }
  | { state: "pinging" }
  | { state: "ok"; name: string; version: string }
  | { state: "error"; message: string };

export default function SettingsDialog({ open, onClose }: Props) {
  const [settings, setLocalSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult>({ state: "idle" });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setProbe({ state: "idle" });
    getSettings()
      .then(setLocalSettings)
      .catch((e) => setError(String(e)));
    teachingServerStatus()
      .then(setStatus)
      .catch(() => {
        // status failure is non-fatal — the server just isn't running
        setStatus({ running: false });
      });
  }, [open]);

  const onSave = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await setSettings(settings);
    } catch (e) {
      setError(`Save settings failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const onToggleServer = useCallback(async () => {
    if (!settings) return;
    setError(null);
    try {
      if (status?.running) {
        await stopTeachingServer();
        setStatus({ running: false });
        setLocalSettings({
          ...settings,
          teaching_server: { ...settings.teaching_server, enabled: false },
        });
      } else {
        const s = await startTeachingServer(
          settings.teaching_server.bind_address,
          settings.teaching_server.port,
        );
        setStatus(s);
        const updated: Settings = {
          ...settings,
          teaching_server: { ...settings.teaching_server, enabled: true },
        };
        setLocalSettings(updated);
        // Persist the "enabled" flip so restart preserves intent.
        await setSettings(updated);
      }
    } catch (e) {
      setError(`Server toggle failed: ${String(e)}`);
    }
  }, [settings, status]);

  const onProbeTeacher = useCallback(async () => {
    if (!settings?.teacher_url) return;
    setProbe({ state: "pinging" });
    try {
      const ping = await pingTeacher(settings.teacher_url);
      setProbe({ state: "ok", name: ping.name, version: ping.version });
    } catch (e) {
      setProbe({
        state: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [settings]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-full max-h-[85vh] overflow-hidden rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold">Settings</h2>
            <p className="text-xs text-zinc-500">
              Stored at <code className="font-mono">~/Teachbook/settings.json</code>.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 space-y-6">
          {error && (
            <div className="rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-3 py-2 text-xs font-mono">
              {error}
            </div>
          )}

          {settings === null ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : (
            <>
              {/* --- Teaching server (teacher mode) --- */}
              <section>
                <h3 className="text-sm font-semibold mb-1">Teaching server</h3>
                <p className="text-xs text-zinc-500 mb-3">
                  Enable to publish locked notebooks over HTTP so student
                  Teachbook clients on the same network can fetch them.
                </p>

                <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          "inline-block w-2 h-2 rounded-full " +
                          (status?.running
                            ? "bg-emerald-500 animate-pulse"
                            : "bg-zinc-400")
                        }
                      />
                      <span className="text-sm font-medium">
                        {status?.running ? "Running" : "Stopped"}
                      </span>
                      {status?.address && (
                        <span className="text-xs font-mono text-zinc-500">
                          {status.address}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={onToggleServer}
                      className={
                        "rounded px-3 py-1 text-sm " +
                        (status?.running
                          ? "bg-rose-600 text-white hover:bg-rose-700"
                          : "bg-emerald-600 text-white hover:bg-emerald-700")
                      }
                    >
                      {status?.running ? "Stop server" : "Start server"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs">
                      <span className="block mb-1 text-zinc-600 dark:text-zinc-400">
                        Bind address
                      </span>
                      <input
                        type="text"
                        disabled={status?.running}
                        value={settings.teaching_server.bind_address}
                        onChange={(e) =>
                          setLocalSettings({
                            ...settings,
                            teaching_server: {
                              ...settings.teaching_server,
                              bind_address: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm font-mono disabled:opacity-60"
                      />
                      <span className="block mt-1 text-[10px] text-zinc-500">
                        <code className="font-mono">0.0.0.0</code> for LAN;{" "}
                        <code className="font-mono">127.0.0.1</code> for loopback.
                      </span>
                    </label>
                    <label className="text-xs">
                      <span className="block mb-1 text-zinc-600 dark:text-zinc-400">
                        Port
                      </span>
                      <input
                        type="number"
                        min={1024}
                        max={65535}
                        disabled={status?.running}
                        value={settings.teaching_server.port}
                        onChange={(e) =>
                          setLocalSettings({
                            ...settings,
                            teaching_server: {
                              ...settings.teaching_server,
                              port: parseInt(e.target.value, 10) || 7480,
                            },
                          })
                        }
                        className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm font-mono disabled:opacity-60"
                      />
                    </label>
                  </div>

                  <div className="text-[11px] text-amber-700 dark:text-amber-400 border-t border-amber-200 dark:border-amber-900 pt-2">
                    ⚠️ No authentication in this MVP. Anyone on the network who
                    knows the URL can read your locked notebooks and post
                    submissions. Recommended only for a trusted classroom LAN.
                  </div>
                </div>
              </section>

              {/* --- Teacher URL (student mode) --- */}
              <section>
                <h3 className="text-sm font-semibold mb-1">Connect to a teacher</h3>
                <p className="text-xs text-zinc-500 mb-3">
                  Point Teachbook at a teacher&apos;s server to see their
                  assigned quizzes in the Examples library.
                </p>

                <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-3 space-y-3">
                  <label className="text-xs block">
                    <span className="block mb-1 text-zinc-600 dark:text-zinc-400">
                      Teacher URL
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="http://192.168.1.10:7480"
                        value={settings.teacher_url ?? ""}
                        onChange={(e) => {
                          setProbe({ state: "idle" });
                          setLocalSettings({
                            ...settings,
                            teacher_url: e.target.value.trim() || undefined,
                          });
                        }}
                        className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm font-mono"
                      />
                      <button
                        onClick={onProbeTeacher}
                        disabled={!settings.teacher_url || probe.state === "pinging"}
                        className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs disabled:opacity-40"
                      >
                        {probe.state === "pinging" ? "Pinging…" : "Test"}
                      </button>
                    </div>
                    {probe.state === "ok" && (
                      <span className="block mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                        ✓ Reached {probe.name} v{probe.version}
                      </span>
                    )}
                    {probe.state === "error" && (
                      <span className="block mt-1 text-[11px] text-rose-700 dark:text-rose-400">
                        ✗ {probe.message}
                      </span>
                    )}
                  </label>

                  <label className="text-xs block">
                    <span className="block mb-1 text-zinc-600 dark:text-zinc-400">
                      Your name (sent with submissions)
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. alice"
                      value={settings.student_name ?? ""}
                      onChange={(e) =>
                        setLocalSettings({
                          ...settings,
                          student_name: e.target.value || undefined,
                        })
                      }
                      className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm"
                    />
                    <span className="block mt-1 text-[10px] text-zinc-500">
                      Free-form label. No authentication — the server accepts
                      whatever name you type.
                    </span>
                  </label>
                </div>
              </section>
            </>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              await onSave();
              if (!error) onClose();
            }}
            disabled={saving || settings === null}
            className="rounded bg-blue-600 text-white px-3 py-1 text-sm hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
