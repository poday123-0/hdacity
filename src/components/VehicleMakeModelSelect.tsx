import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, ChevronDown, X, Car } from "lucide-react";

interface Props {
  make: string;
  model: string;
  onMakeChange: (make: string) => void;
  onModelChange: (model: string) => void;
  inputClassName?: string;
}

interface MakeData {
  id: string;
  name: string;
}

interface ModelData {
  id: string;
  make_id: string;
  name: string;
}

const VehicleMakeModelSelect = ({ make, model, onMakeChange, onModelChange, inputClassName }: Props) => {
  const [makes, setMakes] = useState<MakeData[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);
  const [makeSearch, setMakeSearch] = useState(make);
  const [modelSearch, setModelSearch] = useState(model);
  const [showMakeDropdown, setShowMakeDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [selectedMakeId, setSelectedMakeId] = useState<string | null>(null);
  const makeRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const [makesRes, modelsRes] = await Promise.all([
        supabase.from("vehicle_makes").select("id, name").eq("is_active", true).order("name"),
        supabase.from("vehicle_models").select("id, make_id, name").eq("is_active", true).order("name"),
      ]);
      setMakes((makesRes.data as MakeData[]) || []);
      setModels((modelsRes.data as ModelData[]) || []);

      // If make is pre-filled, find its ID
      if (make && makesRes.data) {
        const found = makesRes.data.find((m: any) => m.name.toLowerCase() === make.toLowerCase());
        if (found) setSelectedMakeId(found.id);
      }
    };
    load();
  }, []);

  // Keep search fields in sync with props
  useEffect(() => { setMakeSearch(make); }, [make]);
  useEffect(() => { setModelSearch(model); }, [model]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (makeRef.current && !makeRef.current.contains(e.target as Node)) setShowMakeDropdown(false);
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setShowModelDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredMakes = makes.filter((m) =>
    m.name.toLowerCase().includes(makeSearch.toLowerCase())
  );

  const availableModels = selectedMakeId
    ? models.filter((m) => m.make_id === selectedMakeId)
    : models;

  const filteredModels = availableModels.filter((m) =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const inputCls = inputClassName || "w-full px-3 py-3 bg-surface rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  const selectMake = (m: MakeData) => {
    onMakeChange(m.name);
    setMakeSearch(m.name);
    setSelectedMakeId(m.id);
    setShowMakeDropdown(false);
    // Reset model when make changes
    onModelChange("");
    setModelSearch("");
  };

  const selectModel = (m: ModelData) => {
    onModelChange(m.name);
    setModelSearch(m.name);
    setShowModelDropdown(false);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Make */}
      <div ref={makeRef} className="relative">
        <label className="text-xs text-muted-foreground font-medium">Make</label>
        <div className="relative mt-1">
          <input
            value={makeSearch}
            onChange={(e) => {
              setMakeSearch(e.target.value);
              onMakeChange(e.target.value);
              setShowMakeDropdown(true);
              if (!e.target.value) setSelectedMakeId(null);
            }}
            onFocus={() => setShowMakeDropdown(true)}
            placeholder="Search make..."
            className={inputCls}
          />
          {makeSearch && (
            <button
              onClick={() => {
                setMakeSearch("");
                onMakeChange("");
                setSelectedMakeId(null);
                onModelChange("");
                setModelSearch("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted flex items-center justify-center"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {showMakeDropdown && filteredMakes.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
            {filteredMakes.map((m) => (
              <button
                key={m.id}
                onClick={() => selectMake(m)}
                className={`w-full text-left px-3 py-2.5 text-xs font-medium hover:bg-surface transition-colors ${
                  selectedMakeId === m.id ? "text-primary bg-primary/5" : "text-foreground"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Model */}
      <div ref={modelRef} className="relative">
        <label className="text-xs text-muted-foreground font-medium">Model</label>
        <div className="relative mt-1">
          <input
            value={modelSearch}
            onChange={(e) => {
              setModelSearch(e.target.value);
              onModelChange(e.target.value);
              setShowModelDropdown(true);
            }}
            onFocus={() => setShowModelDropdown(true)}
            placeholder={selectedMakeId ? "Search model..." : "Select make first"}
            className={inputCls}
          />
          {modelSearch && (
            <button
              onClick={() => {
                setModelSearch("");
                onModelChange("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted flex items-center justify-center"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {showModelDropdown && filteredModels.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
            {filteredModels.map((m) => (
              <button
                key={m.id}
                onClick={() => selectModel(m)}
                className="w-full text-left px-3 py-2.5 text-xs font-medium text-foreground hover:bg-surface transition-colors"
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleMakeModelSelect;
