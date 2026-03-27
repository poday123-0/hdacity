import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Trash2, Eye, X, Download, FolderOpen, Image, FileAudio, File, RefreshCw, User, HardDrive } from "lucide-react";
import { deleteStorageFile, parseStorageUrl } from "@/lib/storage-utils";

interface StorageFile {
  name: string;
  id: string;
  created_at: string;
  metadata: any;
  bucket: string;
  fullPath: string;
  publicUrl: string;
  size: number;
}

interface FileOwnerInfo {
  name: string;
  phone: string;
  type: string;
}

const BUCKETS = ["driver-documents", "notification-sounds", "vehicle-images"];

const formatSize = (bytes: number) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "")) return Image;
  if (["mp3", "wav", "ogg", "m4a"].includes(ext || "")) return FileAudio;
  return File;
};

const AdminStorage = () => {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedBucket, setSelectedBucket] = useState("all");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileOwners, setFileOwners] = useState<Record<string, FileOwnerInfo>>({});
  const [totalSize, setTotalSize] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchFiles = async () => {
    setLoading(true);
    const allFiles: StorageFile[] = [];
    const bucketsToFetch = selectedBucket === "all" ? BUCKETS : [selectedBucket];

    for (const bucket of bucketsToFetch) {
      try {
        // List root folders first
        const { data: rootItems } = await supabase.storage.from(bucket).list("", { limit: 500 });
        if (!rootItems) continue;

        for (const item of rootItems) {
          if (item.id) {
            // It's a file at root level
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(item.name);
            allFiles.push({
              name: item.name,
              id: item.id,
              created_at: item.created_at,
              metadata: item.metadata,
              bucket,
              fullPath: item.name,
              publicUrl: urlData.publicUrl,
              size: item.metadata?.size || 0,
            });
          } else {
            // It's a folder, list its contents recursively (one level deep)
            const { data: subItems } = await supabase.storage.from(bucket).list(item.name, { limit: 500 });
            if (subItems) {
              for (const sub of subItems) {
                if (sub.id) {
                  const path = `${item.name}/${sub.name}`;
                  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
                  allFiles.push({
                    name: sub.name,
                    id: sub.id,
                    created_at: sub.created_at,
                    metadata: sub.metadata,
                    bucket,
                    fullPath: path,
                    publicUrl: urlData.publicUrl,
                    size: sub.metadata?.size || 0,
                  });
                } else {
                  // Second-level folder
                  const { data: subSubItems } = await supabase.storage.from(bucket).list(`${item.name}/${sub.name}`, { limit: 500 });
                  if (subSubItems) {
                    for (const ss of subSubItems) {
                      if (ss.id) {
                        const path = `${item.name}/${sub.name}/${ss.name}`;
                        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
                        allFiles.push({
                          name: ss.name,
                          id: ss.id,
                          created_at: ss.created_at,
                          metadata: ss.metadata,
                          bucket,
                          fullPath: path,
                          publicUrl: urlData.publicUrl,
                          size: ss.metadata?.size || 0,
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(`Error listing bucket ${bucket}:`, e);
      }
    }

    allFiles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setFiles(allFiles);
    setTotalSize(allFiles.reduce((sum, f) => sum + (f.size || 0), 0));

    // Try to map driver-documents files to profiles
    const driverDocFiles = allFiles.filter(f => f.bucket === "driver-documents" && f.fullPath.includes("driver-docs/"));
    const driverIds = [...new Set(driverDocFiles.map(f => {
      const parts = f.fullPath.split("/");
      return parts.length >= 2 ? parts[1] : null;
    }).filter(Boolean))];

    if (driverIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, phone_number, user_type").in("id", driverIds.slice(0, 50));
      const ownerMap: Record<string, FileOwnerInfo> = {};
      profiles?.forEach(p => {
        ownerMap[p.id] = { name: `${p.first_name} ${p.last_name}`, phone: p.phone_number, type: p.user_type };
      });
      setFileOwners(ownerMap);
    }

    setLoading(false);
  };

  useEffect(() => { fetchFiles(); }, [selectedBucket]);

  const getOwnerForFile = (file: StorageFile): FileOwnerInfo | null => {
    if (file.bucket !== "driver-documents") return null;
    const parts = file.fullPath.split("/");
    if (parts.length >= 2 && parts[0] === "driver-docs") {
      return fileOwners[parts[1]] || null;
    }
    return null;
  };

  const deleteFile = async (file: StorageFile) => {
    if (!confirm(`Delete "${file.name}" from ${file.bucket}? This cannot be undone.`)) return;
    const { error } = await supabase.storage.from(file.bucket).remove([file.fullPath]);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setFiles(prev => prev.filter(f => f.id !== file.id));
    toast({ title: "File deleted from storage" });
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} file(s)? This cannot be undone.`)) return;
    const toDelete = files.filter(f => selected.has(f.id));
    // Group by bucket
    const byBucket: Record<string, string[]> = {};
    toDelete.forEach(f => {
      if (!byBucket[f.bucket]) byBucket[f.bucket] = [];
      byBucket[f.bucket].push(f.fullPath);
    });
    for (const [bucket, paths] of Object.entries(byBucket)) {
      await supabase.storage.from(bucket).remove(paths);
    }
    setFiles(prev => prev.filter(f => !selected.has(f.id)));
    setSelected(new Set());
    toast({ title: `${toDelete.length} file(s) deleted` });
  };

  const isImage = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "");
  };

  const filteredFiles = files.filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    const owner = getOwnerForFile(f);
    return f.name.toLowerCase().includes(q) || f.fullPath.toLowerCase().includes(q) || f.bucket.toLowerCase().includes(q) || owner?.name.toLowerCase().includes(q) || owner?.phone.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Storage Browser</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {files.length} files · {formatSize(totalSize)} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={bulkDelete} className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-xl text-sm font-semibold">
              <Trash2 className="w-4 h-4" /> Delete {selected.size}
            </button>
          )}
          <button onClick={fetchFiles} className="p-2 bg-card border border-border rounded-xl text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files, owners..." className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <select value={selectedBucket} onChange={e => setSelectedBucket(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground">
          <option value="all">All Buckets</option>
          {BUCKETS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* File list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No files found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFiles.map(file => {
            const FileIcon = getFileIcon(file.name);
            const owner = getOwnerForFile(file);
            const isImg = isImage(file.name);

            return (
              <div key={file.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(file.id)}
                  onChange={() => setSelected(prev => {
                    const next = new Set(prev);
                    next.has(file.id) ? next.delete(file.id) : next.add(file.id);
                    return next;
                  })}
                  className="w-4 h-4 rounded border-border text-primary"
                />

                {/* Thumbnail / Icon */}
                <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
                  {isImg ? (
                    <img src={file.publicUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <FileIcon className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">{file.bucket}</span>
                    <span>{formatSize(file.size)}</span>
                    <span>{new Date(file.created_at).toLocaleDateString()}</span>
                  </div>
                  {owner && (
                    <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span>{owner.name} · {owner.phone}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isImg && (
                    <button onClick={() => setPreviewUrl(file.publicUrl)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted">
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  <a href={file.publicUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted">
                    <Download className="w-4 h-4" />
                  </a>
                  <button onClick={() => deleteFile(file)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-[9999] bg-foreground/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-3xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewUrl(null)} className="absolute -top-10 right-0 text-white hover:text-primary">
              <X className="w-6 h-6" />
            </button>
            <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-[85vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStorage;
