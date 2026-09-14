import { useEffect, useState } from "react";
import { useEditor } from "../editor/store";
import { Modal } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { api, apiConfigured } from "../auth/client";
const resources = [
  "users",
  "projects",
  "templates",
  "effects",
  "filters",
  "stickers",
  "audio_assets",
  "render_jobs",
  "settings",
];
export function AdminModal() {
  const s = useEditor();
  const [resource, setResource] = useState("users"),
    [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setError("");
    void api("/admin/" + resource)
      .then((r) => setRows(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [resource]);
  return (
    <Modal
      open={s.modal === "admin"}
      onClose={() => s.set({ modal: null })}
      title="Administration"
      description="Access requires a verified account with the server-side admin role."
      wide
    >
      <div className="modal-body">
        {!apiConfigured ? (
          <p className="dependency-note">
            Connect the Node API and Supabase authentication to use
            administration. Local projects stay private to this browser.
          </p>
        ) : (
          <>
            <div className="tabs">
              {resources.map((r) => (
                <button
                  key={r}
                  className={r === resource ? "active" : ""}
                  onClick={() => setResource(r)}
                >
                  {r.replace("_", " ")}
                </button>
              ))}
            </div>
            {loading ? (
              <p>Checking access…</p>
            ) : error ? (
              <p className="error-message">{error}</p>
            ) : (
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Record</th>
                      <th>Details</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={String(r.id ?? i)}>
                        <td>{String(r.name ?? r.email ?? r.id ?? i)}</td>
                        <td>
                          <pre>{JSON.stringify(r, null, 2)}</pre>
                        </td>
                        <td>
                          {!["users", "projects", "render_jobs"].includes(
                            resource,
                          ) && (
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await api("/admin/" + resource + "/" + r.id, {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      enabled: r.enabled === false,
                                    }),
                                  });
                                  setRows(
                                    rows.map((x) =>
                                      x.id === r.id
                                        ? { ...x, enabled: r.enabled === false }
                                        : x,
                                    ),
                                  );
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : "Update failed.",
                                  );
                                }
                              }}
                            >
                              {r.enabled === false ? "Enable" : "Disable"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && <p>No records yet.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
