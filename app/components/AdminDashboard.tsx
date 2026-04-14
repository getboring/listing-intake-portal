import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

type IntakeSummary = {
  id: string;
  intakeNumber?: string;
  status: string;
  currentStage: string;
  completionPercent: number;
  readinessScore: number;
  property?: { street1?: string; city?: string; state?: string };
  client?: { displayName?: string };
  assignedAgent?: { firstName?: string; lastName?: string };
  assignedCoordinatorId?: string;
};

export function AdminDashboard() {
  const [intakes, setIntakes] = useState<IntakeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  async function loadIntakes() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/intakes`);
      const data = (await res.json()) as IntakeSummary[];
      setIntakes(Array.isArray(data) ? data : []);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIntakes();
  }, []);

  async function apiAction(id: string, path: string, body?: unknown, method = "POST") {
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`${API_BASE}/admin/intakes/${id}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as { success?: boolean; errors?: string[]; mlsListingKey?: string };
      alert(data.success ? (data.mlsListingKey ? `Success: MLS Key ${data.mlsListingKey}` : "Success") : `Error: ${data.errors?.join(", ") || "Unknown"}`);
      await loadIntakes();
    } catch (e) {
      alert(`Error: ${String(e)}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function startReview(id: string) {
    await apiAction(id, "/start-review", {});
  }

  async function approve(id: string) {
    const notes = window.prompt("Approval notes (optional):") || undefined;
    await apiAction(id, "/approve", notes ? { notes } : {});
  }

  async function block(id: string) {
    const reason = window.prompt("Reason for blocking?");
    if (!reason) return;
    await apiAction(id, "/block", { reason });
  }

  async function requestRevision(id: string) {
    const notes = window.prompt("Revision notes:");
    if (!notes) return;
    await apiAction(id, "/request-revision", { notes });
  }

  async function assignCoordinator(id: string) {
    const coordinatorId = window.prompt("Coordinator ID:");
    if (!coordinatorId) return;
    await apiAction(id, "/assign", { coordinatorId });
  }

  async function exportRESO(id: string) {
    try {
      const res = await fetch(`${API_BASE}/admin/intakes/${id}/export/reso`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `intake-${id}-reso.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export failed: ${String(e)}`);
    }
  }

  async function pushMLS(id: string) {
    const baseUrl = window.prompt("MLS Base URL:");
    if (!baseUrl) return;
    const clientId = window.prompt("Client ID:");
    if (!clientId) return;
    const clientSecret = window.prompt("Client Secret:");
    if (!clientSecret) return;
    const tokenEndpoint = window.prompt("Token Endpoint:") || "";
    await apiAction(id, "/mls/push", {
      baseUrl,
      resourceName: "Property",
      auth: { clientId, clientSecret, tokenEndpoint },
    });
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "#c00" }}>{error}</p>;

  return (
    <div style={{ maxWidth: 1400, margin: "2rem auto", fontFamily: "system-ui, sans-serif", padding: "0 1rem" }}>
      <h1>Admin Dashboard</h1>
      <button type="button" onClick={loadIntakes} style={{ marginBottom: 16 }}>Refresh</button>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th>ID</th>
              <th>Address</th>
              <th>Client</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Completion</th>
              <th>Readiness</th>
              <th>Agent</th>
              <th>Coordinator</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {intakes.map((i) => (
              <tr key={i.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{i.intakeNumber || i.id.slice(0, 8)}</td>
                <td>{i.property ? `${i.property.street1 || ""}, ${i.property.city || ""}, ${i.property.state || ""}` : "—"}</td>
                <td>{i.client?.displayName || "—"}</td>
                <td>{i.status}</td>
                <td>{i.currentStage}</td>
                <td>{i.completionPercent}%</td>
                <td>{i.readinessScore}</td>
                <td>{i.assignedAgent ? `${i.assignedAgent.firstName || ""} ${i.assignedAgent.lastName || ""}` : "—"}</td>
                <td>{i.assignedCoordinatorId ? i.assignedCoordinatorId.slice(0, 8) : "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {i.status === "submitted" && (
                      <button type="button" disabled={actionLoading[i.id]} onClick={() => startReview(i.id)}>Start Review</button>
                    )}
                    {(i.status === "under_review" || i.status === "blocked") && (
                      <>
                        <button type="button" disabled={actionLoading[i.id]} onClick={() => approve(i.id)}>Approve</button>
                        <button type="button" disabled={actionLoading[i.id]} onClick={() => block(i.id)}>Block</button>
                        <button type="button" disabled={actionLoading[i.id]} onClick={() => requestRevision(i.id)}>Request Revision</button>
                      </>
                    )}
                    <button type="button" disabled={actionLoading[i.id]} onClick={() => assignCoordinator(i.id)}>Assign</button>
                    <button type="button" disabled={actionLoading[i.id]} onClick={() => exportRESO(i.id)}>Export RESO</button>
                    <button type="button" disabled={actionLoading[i.id]} onClick={() => pushMLS(i.id)}>Push MLS</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
