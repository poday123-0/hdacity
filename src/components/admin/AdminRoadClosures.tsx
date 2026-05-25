import { useState, useMemo } from "react";
import { useRoadClosures, type RoadClosure } from "@/hooks/use-road-closures";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Check, X, Edit2, Trash2, Clock, MapPin, Construction } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const SEVERITY_LABEL: Record<string, { label: string; color: string }> = {
  closed: { label: "Closed", color: "bg-destructive text-destructive-foreground" },
  construction: { label: "Construction", color: "bg-amber-500 text-white" },
  accident: { label: "Accident", color: "bg-orange-600 text-white" },
  flood: { label: "Flood", color: "bg-sky-600 text-white" },
  caution: { label: "Caution", color: "bg-yellow-500 text-black" },
};

const AdminRoadClosures = () => {
  const { closures, pendingClosures, loading, removeClosure, updateClosure, approveClosure, rejectClosure } =
    useRoadClosures();

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [editing, setEditing] = useState<RoadClosure | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return closures.filter((c) => {
      if (severityFilter !== "all" && (c.severity || "closed") !== severityFilter) return false;
      if (!q) return true;
      return (
        (c.notes || "").toLowerCase().includes(q) ||
        (c.reporter_name || "").toLowerCase().includes(q) ||
        (c.reporter_phone || "").toLowerCase().includes(q)
      );
    });
  }, [closures, search, severityFilter]);

  const handleDelete = async (c: RoadClosure) => {
    if (!confirm("Deactivate this road closure? Drivers will no longer see it.")) return;
    try {
      await removeClosure(c.id);
      toast.success("Closure removed");
    } catch (e: any) {
      toast.error("Failed to remove: " + e.message);
    }
  };

  const handleApprove = async (c: RoadClosure) => {
    try {
      await approveClosure(c.id);
      toast.success("Closure approved");
    } catch (e: any) {
      toast.error("Approve failed: " + e.message);
    }
  };

  const handleReject = async (c: RoadClosure) => {
    try {
      await rejectClosure(c.id);
      toast.success("Closure rejected");
    } catch (e: any) {
      toast.error("Reject failed: " + e.message);
    }
  };

  const renderRow = (c: RoadClosure) => {
    const sev = SEVERITY_LABEL[c.severity || "closed"] || SEVERITY_LABEL.closed;
    const coord = c.coordinates?.[0];
    return (
      <tr key={c.id} className="border-b border-border hover:bg-muted/40 transition-colors">
        <td className="px-3 py-3 align-top">
          <Badge className={`${sev.color} text-[10px] px-2 py-0.5`}>{sev.label}</Badge>
          <div className="text-[10px] text-muted-foreground mt-1 capitalize">{c.closure_type}</div>
        </td>
        <td className="px-3 py-3 align-top max-w-[260px]">
          <div className="text-sm text-foreground break-words">{c.notes || <span className="italic text-muted-foreground">No notes</span>}</div>
          {coord && (
            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
              <a
                href={`https://www.google.com/maps?q=${coord.lat},${coord.lng}`}
                target="_blank"
                rel="noreferrer"
                className="ml-1 text-primary underline"
              >
                Map
              </a>
            </div>
          )}
        </td>
        <td className="px-3 py-3 align-top">
          <div className="text-xs text-foreground">
            {c.reporter_name || (c.reported_by_type === "dispatch" ? "Dispatch" : "—")}
          </div>
          {c.reporter_phone && (
            <div className="text-[10px] text-muted-foreground">{c.reporter_phone}</div>
          )}
          <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">{c.reported_by_type}</div>
        </td>
        <td className="px-3 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
          {format(new Date(c.created_at), "MMM d, HH:mm")}
        </td>
        <td className="px-3 py-3 align-top text-xs whitespace-nowrap">
          {c.expires_at ? (
            <span className="text-foreground">{format(new Date(c.expires_at), "MMM d, HH:mm")}</span>
          ) : (
            <span className="text-muted-foreground italic">No expiry</span>
          )}
        </td>
        <td className="px-3 py-3 align-top">
          {c.status === "pending" ? (
            <Badge className="bg-amber-500/20 text-amber-600 border border-amber-500/40">Pending</Badge>
          ) : (
            <Badge className="bg-emerald-500/20 text-emerald-600 border border-emerald-500/40">Active</Badge>
          )}
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-1 flex-wrap">
            {c.status === "pending" && (
              <>
                <Button size="sm" variant="default" className="h-7 px-2 gap-1" onClick={() => handleApprove(c)}>
                  <Check className="w-3.5 h-3.5" /> Approve
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => handleReject(c)}>
                  <X className="w-3.5 h-3.5" /> Reject
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setEditing(c)} title="Edit">
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(c)} title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Construction className="w-5 h-5 text-primary" /> Road Closures
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage closures reported by drivers and dispatch. Drivers see warnings while navigating near active closures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {closures.length} active
          </Badge>
          {pendingClosures.length > 0 && (
            <Badge className="bg-amber-500 text-white text-xs">{pendingClosures.length} pending</Badge>
          )}
        </div>
      </div>

      {/* Pending review section */}
      {pendingClosures.length > 0 && (
        <div className="border border-amber-500/40 bg-amber-500/5 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-amber-500/10 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Pending driver reports — review & approve
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-left text-[10px] uppercase text-muted-foreground">
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Notes / Location</th>
                  <th className="px-3 py-2">Reporter</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Expires</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>{pendingClosures.map(renderRow)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search notes, reporter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="construction">Construction</SelectItem>
            <SelectItem value="accident">Accident</SelectItem>
            <SelectItem value="flood">Flood</SelectItem>
            <SelectItem value="caution">Caution</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active closures table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] uppercase text-muted-foreground">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Notes / Location</th>
                <th className="px-3 py-2">Reporter</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Expires</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                    No road closures match the filters.
                  </td>
                </tr>
              ) : (
                filtered.map(renderRow)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit dialog */}
      <EditClosureDialog
        closure={editing}
        onClose={() => setEditing(null)}
        onSave={async (updates) => {
          if (!editing) return;
          try {
            await updateClosure(editing.id, updates);
            toast.success("Closure updated");
            setEditing(null);
          } catch (e: any) {
            toast.error("Update failed: " + e.message);
          }
        }}
      />
    </div>
  );
};

const EditClosureDialog = ({
  closure,
  onClose,
  onSave,
}: {
  closure: RoadClosure | null;
  onClose: () => void;
  onSave: (updates: { notes: string; severity: string; expires_at: string | null }) => Promise<void>;
}) => {
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState("closed");
  const [expiresHours, setExpiresHours] = useState<string>("");

  useMemo(() => {
    if (closure) {
      setNotes(closure.notes || "");
      setSeverity(closure.severity || "closed");
      if (closure.expires_at) {
        const ms = new Date(closure.expires_at).getTime() - Date.now();
        setExpiresHours(ms > 0 ? Math.max(1, Math.round(ms / 3600000)).toString() : "");
      } else {
        setExpiresHours("");
      }
    }
  }, [closure]);

  if (!closure) return null;

  return (
    <Dialog open={!!closure} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-4 h-4" /> Edit Road Closure
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="construction">Construction</SelectItem>
                <SelectItem value="accident">Accident</SelectItem>
                <SelectItem value="flood">Flood</SelectItem>
                <SelectItem value="caution">Caution</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Describe the closure / reason / detour…"
            />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Clock className="w-3 h-3" /> Expires in (hours from now) — leave empty for no expiry
            </Label>
            <Input
              type="number"
              min={0}
              value={expiresHours}
              onChange={(e) => setExpiresHours(e.target.value)}
              placeholder="e.g. 24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const hrs = parseFloat(expiresHours);
              const expires_at =
                Number.isFinite(hrs) && hrs > 0
                  ? new Date(Date.now() + hrs * 3600000).toISOString()
                  : null;
              await onSave({ notes, severity, expires_at });
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminRoadClosures;
