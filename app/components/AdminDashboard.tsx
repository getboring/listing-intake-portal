import { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  UserPlus,
  FileJson,
  UploadCloud,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  AlertCircle,
  Home,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Skeleton } from "./ui/skeleton";
import { Separator } from "./ui/separator";
import { Label } from "./ui/label";
import { Dialog, DialogActions } from "./ui/dialog";

const API_BASE = import.meta.env.VITE_API_BASE || "";

interface Intake {
  id: string;
  sellerEmail: string;
  status: string;
  currentStage: string;
  completionPercent: number;
  readinessScore: number;
  createdAt: string;
}

interface ListResponse {
  data: Intake[];
  nextCursor?: string;
}

export function AdminDashboard() {
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    type: "approve" | "block" | "revision" | "assign" | null;
    intakeId: string;
    value: string;
  }>({ type: null, intakeId: "", value: "" });

  async function loadList(after?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "20");
      if (after) qs.set("after", after);
      const res = await fetch(`${API_BASE}/admin/intakes?${qs.toString()}`);
      const json = (await res.json()) as ListResponse;
      setIntakes(json.data || []);
      setNextCursor(json.nextCursor || null);
    } catch (e) {
      setError("Failed to load intakes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  const filtered = intakes.filter(
    (i) =>
      i.sellerEmail?.toLowerCase().includes(query.toLowerCase()) ||
      i.status?.toLowerCase().includes(query.toLowerCase()) ||
      i.id?.toLowerCase().includes(query.toLowerCase())
  );

  async function apiAction(id: string, actionPath: string, body?: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/intakes/${id}${actionPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json()) as { success?: boolean; errors?: string[] };
      if (!json.success) {
        setError(json.errors?.join(", ") || "Action failed");
      }
      await loadList(cursor);
    } catch (e) {
      setError("Action failed");
    } finally {
      setLoading(false);
    }
  }

  function openModal(type: "approve" | "block" | "revision" | "assign", id: string) {
    setModal({ type, intakeId: id, value: "" });
  }

  function closeModal() {
    setModal({ type: null, intakeId: "", value: "" });
  }

  function modalTitle() {
    switch (modal.type) {
      case "approve":
        return "Approve Intake";
      case "block":
        return "Block Intake";
      case "revision":
        return "Request Revision";
      case "assign":
        return "Assign Coordinator";
      default:
        return "";
    }
  }

  function modalDescription() {
    switch (modal.type) {
      case "approve":
        return "Approve this intake to move it forward.";
      case "block":
        return "Provide a reason for blocking this intake.";
      case "revision":
        return "Describe what the seller needs to correct.";
      case "assign":
        return "Enter the coordinator ID to assign.";
      default:
        return "";
    }
  }

  const total = intakes.length;
  const submitted = intakes.filter((i) => i.status === "submitted").length;
  const underReview = intakes.filter((i) => i.status === "under_review").length;
  const approved = intakes.filter((i) => i.status === "approved").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50 p-4 pb-24 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Manage listing intakes and review submissions.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadList(cursor)} disabled={loading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-3xl">{total}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={total ? 100 : 0} className="h-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Submitted</CardDescription>
              <CardTitle className="text-3xl">{submitted}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={total ? (submitted / total) * 100 : 0} className="h-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Under Review</CardDescription>
              <CardTitle className="text-3xl">{underReview}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={total ? (underReview / total) * 100 : 0} className="h-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Approved</CardDescription>
              <CardTitle className="text-3xl">{approved}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={total ? (approved / total) * 100 : 0} className="h-2" />
            </CardContent>
          </Card>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="border-0 shadow-xl shadow-black/5">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Intakes</CardTitle>
                <CardDescription>Review and manage seller submissions.</CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email, status, or ID..."
                  className="pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && intakes.length === 0 ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">ID</th>
                      <th className="px-4 py-3 text-left font-medium">Email</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium">Progress</th>
                      <th className="px-4 py-3 text-left font-medium">Readiness</th>
                      <th className="px-4 py-3 text-left font-medium">Created</th>
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((i) => (
                      <tr key={i.id} className="bg-white hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{i.id.slice(0, 8)}</td>
                        <td className="px-4 py-3">{i.sellerEmail}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              i.status === "approved"
                                ? "default"
                                : i.status === "submitted"
                                ? "secondary"
                                : i.status === "under_review"
                                ? "outline"
                                : "destructive"
                            }
                          >
                            {i.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Progress value={i.completionPercent} className="h-2 w-20" />
                            <span className="text-xs text-muted-foreground">{i.completionPercent}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Progress value={i.readinessScore} className="h-2 w-20" />
                            <span className="text-xs text-muted-foreground">{i.readinessScore}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(i.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {i.status === "submitted" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Start Review"
                                  onClick={() => apiAction(i.id, "/start-review", {})}
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Request Revision"
                                  onClick={() => openModal("revision", i.id)}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {i.status === "under_review" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Approve"
                                  onClick={() => openModal("approve", i.id)}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Block"
                                  onClick={() => openModal("block", i.id)}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Request Revision"
                                  onClick={() => openModal("revision", i.id)}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              title="Assign Coordinator"
                              onClick={() => openModal("assign", i.id)}
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              title="Export RESO"
                              onClick={() => apiAction(i.id, "/export/reso", {})}
                            >
                              <FileJson className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              title="Push to MLS"
                              onClick={() => apiAction(i.id, "/mls/push", {})}
                            >
                              <UploadCloud className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          No intakes found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setCursor(null);
                  loadList(null);
                }}
                disabled={!cursor || loading}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">{filtered.length} shown</span>
              <Button
                variant="outline"
                onClick={() => {
                  if (nextCursor) {
                    setCursor(nextCursor);
                    loadList(nextCursor);
                  }
                }}
                disabled={!nextCursor || loading}
              >
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          MLS credentials are configured securely via environment variables.
        </p>
      </div>

      <Dialog open={modal.type !== null} onClose={closeModal} title={modalTitle()} description={modalDescription()}>
        <div className="space-y-3">
          {modal.type === "approve" && (
            <>
              <Label>Notes (optional)</Label>
              <textarea
                className="flex min-h-[5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={modal.value}
                onChange={(e) => setModal((m) => ({ ...m, value: e.target.value }))}
                placeholder="Any notes for the seller..."
              />
              <DialogActions>
                <Button variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    apiAction(modal.intakeId, "/approve", modal.value.trim() ? { notes: modal.value.trim() } : {});
                    closeModal();
                  }}
                >
                  Approve
                </Button>
              </DialogActions>
            </>
          )}
          {modal.type === "block" && (
            <>
              <Label>Reason</Label>
              <textarea
                className="flex min-h-[5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={modal.value}
                onChange={(e) => setModal((m) => ({ ...m, value: e.target.value }))}
                placeholder="Why is this intake being blocked?"
              />
              <DialogActions>
                <Button variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!modal.value.trim()}
                  onClick={() => {
                    apiAction(modal.intakeId, "/block", { reason: modal.value.trim() });
                    closeModal();
                  }}
                >
                  Block
                </Button>
              </DialogActions>
            </>
          )}
          {modal.type === "revision" && (
            <>
              <Label>Revision Notes</Label>
              <textarea
                className="flex min-h-[5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={modal.value}
                onChange={(e) => setModal((m) => ({ ...m, value: e.target.value }))}
                placeholder="What needs to be corrected or added?"
              />
              <DialogActions>
                <Button variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  disabled={!modal.value.trim()}
                  onClick={() => {
                    apiAction(modal.intakeId, "/request-revision", { notes: modal.value.trim() });
                    closeModal();
                  }}
                >
                  Request Revision
                </Button>
              </DialogActions>
            </>
          )}
          {modal.type === "assign" && (
            <>
              <Label>Coordinator ID</Label>
              <Input
                value={modal.value}
                onChange={(e) => setModal((m) => ({ ...m, value: e.target.value }))}
                placeholder="coordinator-123"
              />
              <DialogActions>
                <Button variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  disabled={!modal.value.trim()}
                  onClick={() => {
                    apiAction(modal.intakeId, "/assign-coordinator", { coordinatorId: modal.value.trim() });
                    closeModal();
                  }}
                >
                  Assign
                </Button>
              </DialogActions>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(" ");
}
