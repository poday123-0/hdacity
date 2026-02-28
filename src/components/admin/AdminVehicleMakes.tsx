import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Plus, Pencil, Trash2, X, ChevronDown, ChevronUp, Upload, FileUp, Loader2, Car, Download } from "lucide-react";
import * as XLSX from "xlsx";

interface Make {
  id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface Model {
  id: string;
  make_id: string;
  name: string;
  is_active: boolean;
}

const AdminVehicleMakes = () => {
  const [makes, setMakes] = useState<Make[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedMake, setExpandedMake] = useState<string | null>(null);

  // Make form
  const [showMakeForm, setShowMakeForm] = useState(false);
  const [editingMakeId, setEditingMakeId] = useState<string | null>(null);
  const [makeName, setMakeName] = useState("");

  // Model form
  const [showModelForm, setShowModelForm] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelName, setModelName] = useState("");

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [makesRes, modelsRes] = await Promise.all([
      supabase.from("vehicle_makes").select("*").order("name"),
      supabase.from("vehicle_models").select("*").order("name"),
    ]);
    setMakes((makesRes.data as Make[]) || []);
    setModels((modelsRes.data as Model[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filteredMakes = makes.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const getModelsForMake = (makeId: string) =>
    models.filter((m) => m.make_id === makeId);

  // Make CRUD
  const saveMake = async () => {
    if (!makeName.trim()) return;
    if (editingMakeId) {
      await supabase.from("vehicle_makes").update({ name: makeName.trim() }).eq("id", editingMakeId);
      toast({ title: "Make updated" });
    } else {
      const { error } = await supabase.from("vehicle_makes").insert({ name: makeName.trim() });
      if (error?.code === "23505") {
        toast({ title: "Already exists", variant: "destructive" });
        return;
      }
      toast({ title: "Make added" });
    }
    setMakeName("");
    setEditingMakeId(null);
    setShowMakeForm(false);
    fetchAll();
  };

  const deleteMake = async (id: string) => {
    if (!confirm("Delete this make and all its models?")) return;
    await supabase.from("vehicle_makes").delete().eq("id", id);
    toast({ title: "Make deleted" });
    fetchAll();
  };

  // Model CRUD
  const saveModel = async (makeId: string) => {
    if (!modelName.trim()) return;
    if (editingModelId) {
      await supabase.from("vehicle_models").update({ name: modelName.trim() }).eq("id", editingModelId);
      toast({ title: "Model updated" });
    } else {
      const { error } = await supabase.from("vehicle_models").insert({ make_id: makeId, name: modelName.trim() });
      if (error?.code === "23505") {
        toast({ title: "Model already exists for this make", variant: "destructive" });
        return;
      }
      toast({ title: "Model added" });
    }
    setModelName("");
    setEditingModelId(null);
    setShowModelForm(null);
    fetchAll();
  };

  const deleteModel = async (id: string) => {
    await supabase.from("vehicle_models").delete().eq("id", id);
    toast({ title: "Model deleted" });
    fetchAll();
  };

  // Parse rows from CSV text or XLSX workbook
  const parseFileToRows = async (file: File): Promise<string[][]> => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      const text = await file.text();
      return text.split("\n").map(l => l.trim()).filter(Boolean).map(l =>
        l.split(",").map(p => p.trim().replace(/^"|"$/g, ""))
      );
    }
    // XLS / XLSX
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    return rows.map(r => r.map(c => String(c).trim()));
  };

  const handleFileImport = async (file: File) => {
    setImporting(true);
    try {
      const rows = await parseFileToRows(file);
      if (rows.length < 2) {
        toast({ title: "No data rows found", variant: "destructive" });
        setImporting(false);
        return;
      }

      // Detect header
      const firstRow = rows[0].map(c => c.toLowerCase());
      const startIdx = firstRow.includes("make") || firstRow.includes("model") ? 1 : 0;

      let addedMakes = 0;
      let addedModels = 0;
      const makeCache: Record<string, string> = {};

      // Collect unique makes
      const uniqueMakes = new Set<string>();
      for (let i = startIdx; i < rows.length; i++) {
        if (rows[i][0]) uniqueMakes.add(rows[i][0]);
      }

      // Insert makes
      for (const name of uniqueMakes) {
        const existing = makes.find(m => m.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          makeCache[name.toLowerCase()] = existing.id;
        } else {
          const { data } = await supabase.from("vehicle_makes").insert({ name }).select("id").single();
          if (data) {
            makeCache[name.toLowerCase()] = data.id;
            addedMakes++;
          }
        }
      }

      // Insert models
      for (let i = startIdx; i < rows.length; i++) {
        const mk = rows[i][0];
        const mdl = rows[i][1];
        if (!mk || !mdl) continue;
        const makeId = makeCache[mk.toLowerCase()];
        if (!makeId) continue;
        const existingModel = models.find(m => m.make_id === makeId && m.name.toLowerCase() === mdl.toLowerCase());
        if (!existingModel) {
          const { error } = await supabase.from("vehicle_models").insert({ make_id: makeId, name: mdl });
          if (!error) addedModels++;
        }
      }

      toast({ title: "Import complete", description: `Added ${addedMakes} makes, ${addedModels} models` });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      setShowImport(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 bg-surface rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary border border-border";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Vehicle Makes & Models</h1>
          <p className="text-sm text-muted-foreground">{makes.length} makes, {models.length} models</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-xl text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <FileUp className="w-3.5 h-3.5" />
            Import
          </button>
          <button
            onClick={() => { setMakeName(""); setEditingMakeId(null); setShowMakeForm(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Make
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search makes..."
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setShowImport(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Import Makes & Models</h3>
              <button onClick={() => setShowImport(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Upload a <strong>CSV</strong> or <strong>Excel (.xlsx / .xls)</strong> file with two columns: <strong>Make</strong> and <strong>Model</strong>.
              Existing makes & models will be skipped.
            </p>

            <div className="bg-surface rounded-xl p-3 text-xs text-muted-foreground font-mono space-y-0.5">
              <p className="font-bold text-foreground text-[10px] uppercase tracking-wider mb-1">Expected format:</p>
              <p>Make,Model</p>
              <p>Toyota,Corolla</p>
              <p>Toyota,Camry</p>
              <p>Honda,Civic</p>
              <p>Honda,Accord</p>
            </div>

            {/* Download sample */}
            <a
              href="/sample-vehicle-makes.csv"
              download
              className="w-full flex items-center justify-center gap-2 bg-surface border border-border text-foreground font-semibold py-2.5 rounded-xl text-xs hover:bg-muted transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Sample CSV
            </a>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileImport(file);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? "Importing..." : "Select CSV or Excel File"}
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Make Form */}
      {showMakeForm && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-foreground">{editingMakeId ? "Edit Make" : "New Make"}</p>
          <input
            value={makeName}
            onChange={(e) => setMakeName(e.target.value)}
            placeholder="e.g. Toyota"
            className={inputCls}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && saveMake()}
          />
          <div className="flex gap-2">
            <button onClick={saveMake} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold">
              {editingMakeId ? "Update" : "Add Make"}
            </button>
            <button onClick={() => { setShowMakeForm(false); setEditingMakeId(null); }} className="px-4 py-2 bg-surface text-muted-foreground rounded-xl text-xs font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Makes List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filteredMakes.length === 0 ? (
        <div className="text-center py-12">
          <Car className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No makes found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMakes.map((make) => {
            const makeModels = getModelsForMake(make.id);
            const isExpanded = expandedMake === make.id;

            return (
              <div key={make.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Make header */}
                <button
                  onClick={() => setExpandedMake(isExpanded ? null : make.id)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-surface/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Car className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-foreground">{make.name}</p>
                      <p className="text-[10px] text-muted-foreground">{makeModels.length} model{makeModels.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMakeName(make.name);
                        setEditingMakeId(make.id);
                        setShowMakeForm(true);
                      }}
                      className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMake(make.id); }}
                      className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {/* Models list */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-2 bg-surface/30">
                    {/* Header showing parent make */}
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      <Car className="w-3 h-3" />
                      Models for {make.name}
                    </div>

                    {makeModels.length === 0 && (
                      <p className="text-xs text-muted-foreground/60 px-3 py-2">No models yet — add one below</p>
                    )}

                    {makeModels.map((mdl) => (
                      <div key={mdl.id} className="flex items-center justify-between py-2 px-3 bg-card rounded-xl">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground">{mdl.name}</span>
                          <span className="text-[9px] text-muted-foreground bg-surface px-1.5 py-0.5 rounded-md">{make.name}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              setModelName(mdl.name);
                              setEditingModelId(mdl.id);
                              setShowModelForm(make.id);
                            }}
                            className="w-6 h-6 rounded-md bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => deleteModel(mdl.id)}
                            className="w-6 h-6 rounded-md bg-surface flex items-center justify-center text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add/Edit model form */}
                    {showModelForm === make.id ? (
                      <div className="space-y-2 bg-card border border-border rounded-xl p-3">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {editingModelId ? "Edit" : "Add"} Model for <span className="text-primary">{make.name}</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            value={modelName}
                            onChange={(e) => setModelName(e.target.value)}
                            placeholder="e.g. Corolla"
                            className="flex-1 px-3 py-2 bg-surface border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && saveModel(make.id)}
                          />
                          <button onClick={() => saveModel(make.id)} className="px-3 py-2 bg-primary text-primary-foreground rounded-xl text-[10px] font-bold">
                            {editingModelId ? "Update" : "Add"}
                          </button>
                          <button onClick={() => { setShowModelForm(null); setEditingModelId(null); setModelName(""); }} className="px-2 py-2 bg-surface text-muted-foreground rounded-xl text-[10px] font-bold">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setModelName(""); setEditingModelId(null); setShowModelForm(make.id); }}
                        className="flex items-center gap-1.5 text-[11px] text-primary font-semibold px-3 py-2 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors w-full justify-center"
                      >
                        <Plus className="w-3 h-3" />
                        Add Model to {make.name}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminVehicleMakes;
