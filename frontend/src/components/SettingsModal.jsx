import { useEffect, useRef, useState } from "react";
import UnlocatedPanel from "./UnlocatedPanel.jsx";
import {
  browseDir,
  deleteMedia,
  faceThumbUrl,
  fetchCorruptMedia,
  fetchDuplicateStats,
  fetchDuplicates,
  fetchFaceStats,
  fetchPersonFaces,
  mergePeople,
  renamePerson,
  resetFaceData,
  saveSettings,
  resetIndex,
  triggerFaceRecluster,
  thumbUrl,
} from "../api.js";

const LAYER_LABELS = {
  labels:    "Place labels",
  roads:     "Roads & paths",
  buildings: "Buildings",
  transport: "Rail & transit",
  nature:    "Water & land",
};

const REPO_URL = "https://github.com/the-filthy-count/Mneme";

function badge(n) {
  return n > 999 ? "999+" : String(n);
}

// ── About tab ───────────────────────────────────────────────────────────────

function AboutTab() {
  return (
    <div className="about-tab">
      <div className="about-logo-wrap">
        <img src="/logo2.webp" alt="Mneme" className="about-logo" />
        <p className="about-tagline">your life, remembered</p>
      </div>
      <p className="about-desc">
        A self-hosted photo and video library. Browse your memories on an
        interactive map, filter by face, date, or place, and keep a journal
        tied to the days that mattered.
      </p>
      <div className="about-stack">
        <div className="about-stack-col">
          <h4>Backend</h4>
          <ul>
            <li>FastAPI · Uvicorn</li>
            <li>SQLAlchemy · SQLite</li>
            <li>Pillow · pillow-heif</li>
            <li>face_recognition (dlib)</li>
            <li>scikit-learn</li>
            <li>reverse_geocoder · pycountry</li>
          </ul>
        </div>
        <div className="about-stack-col">
          <h4>Frontend</h4>
          <ul>
            <li>React 18 · Vite</li>
            <li>Leaflet · react-leaflet</li>
            <li>MapLibre GL</li>
            <li>Photo Sphere Viewer</li>
            <li>VersaTiles · Esri · NASA tiles</li>
          </ul>
        </div>
      </div>
      <a
        className="about-repo-link"
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        github.com/the-filthy-count/Mneme
      </a>
    </div>
  );
}

// ── People tab ─────────────────────────────────────────────────────────────

function PeopleTab({ people, faceScan, onPeopleChanged, onPersonFilter, personFilter, onClose, onStartFacePoll }) {
  const [faceStats, setFaceStats] = useState(null);
  const [selected, setSelected] = useState(null);
  const [faces, setFaces] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [merging, setMerging] = useState(false);
  const [localPeople, setLocalPeople] = useState(people);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const nameRef = useRef(null);

  useEffect(() => { setLocalPeople(people); }, [people]);

  useEffect(() => {
    fetchFaceStats().then(setFaceStats).catch(() => {});
  }, [people]);

  useEffect(() => {
    if (!selected) return;
    setFaces(null);
    fetchPersonFaces(selected.id).then(setFaces).catch(() => setFaces([]));
  }, [selected?.id]);

  useEffect(() => {
    if (renaming) nameRef.current?.focus();
  }, [renaming]);

  const faceScanning = faceScan?.state === "scanning" || faceScan?.state === "clustering";
  const facePct = faceStats
    ? Math.round((faceStats.scanned_images / Math.max(faceStats.total_images, 1)) * 100)
    : null;

  const startRename = () => { setNameInput(selected.name); setRenaming(true); };

  const commitRename = async () => {
    if (!nameInput.trim() || !selected) { setRenaming(false); return; }
    try {
      const updated = await renamePerson(selected.id, nameInput.trim());
      setSelected((p) => ({ ...p, name: updated.name }));
      setLocalPeople((prev) => prev.map((p) => p.id === updated.id ? { ...p, name: updated.name } : p));
      onPeopleChanged?.();
    } catch { /* ignore */ }
    setRenaming(false);
  };

  const handleMergeTarget = async (target) => {
    if (!selected || target.id === selected.id) return;
    setMerging(false);
    try {
      await mergePeople(target.id, selected.id);
      setLocalPeople((prev) =>
        prev
          .filter((p) => p.id !== selected.id)
          .map((p) => p.id === target.id ? { ...p, face_count: p.face_count + selected.face_count } : p)
      );
      setSelected(null);
      onPeopleChanged?.();
    } catch { /* ignore */ }
  };

  const handleRecluster = async () => {
    try {
      await triggerFaceRecluster();
      onStartFacePoll?.();
    } catch { /* ignore */ }
  };

  const handleResetFaces = async () => {
    if (!window.confirm("Delete all face data? People, face crops, and scan history will be removed. The next library scan will re-analyse everything.")) return;
    try {
      await resetFaceData();
      setLocalPeople([]);
      setSelected(null);
      setFaceStats(null);
      onPeopleChanged?.();
    } catch { /* ignore */ }
  };

  const filterAndClose = (id) => {
    onPersonFilter(id);
    if (id != null) onClose();
  };

  const toggleCardSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleMergeSelected = async () => {
    const ids = [...selectedIds];
    if (ids.length < 2) return;
    const sorted = ids
      .map(id => localPeople.find(p => p.id === id))
      .filter(Boolean)
      .sort((a, b) => b.face_count - a.face_count);
    const target = sorted[0];
    const sources = sorted.slice(1);
    try {
      for (const src of sources) await mergePeople(target.id, src.id);
      const gainedFaces = sources.reduce((sum, s) => sum + (localPeople.find(p => p.id === s.id)?.face_count ?? 0), 0);
      setLocalPeople(prev =>
        prev
          .filter(p => !sources.some(s => s.id === p.id))
          .map(p => p.id === target.id ? { ...p, face_count: p.face_count + gainedFaces } : p)
      );
      setSelectedIds(new Set());
      setSelectMode(false);
      onPeopleChanged?.();
    } catch { /* ignore */ }
  };

  if (merging && selected) {
    return (
      <div className="people-tab">
        <div className="people-tab-header">
          <button className="back-crumb" onClick={() => setMerging(false)}>&lt; back</button>
          <p className="merge-hint">Select a person to merge <strong>{selected.name}</strong> into:</p>
        </div>
        <div className="people-grid">
          {localPeople.filter((p) => p.id !== selected.id).map((p) => (
            <button key={p.id} className="person-card" onClick={() => handleMergeTarget(p)}>
              <div className="person-avatar">
                {p.cover_thumb ? <img src={faceThumbUrl(p.cover_thumb)} alt={p.name} /> : <div className="person-avatar-placeholder" />}
              </div>
              <span className="person-name">{p.name}</span>
              <span className="person-count">{p.face_count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="people-tab">
        <div className="people-tab-header">
          <button className="back-crumb" onClick={() => { setSelected(null); setRenaming(false); }}>&lt; all people</button>
          <h3 className="person-detail-name">{selected.name}</h3>
        </div>
        <div className="person-detail-actions">
          {renaming ? (
            <div className="person-rename-form">
              <input
                ref={nameRef}
                className="person-rename-input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(false); }}
              />
              <button className="mini-btn" onClick={commitRename}>Save</button>
              <button className="mini-btn" onClick={() => setRenaming(false)}>Cancel</button>
            </div>
          ) : (
            <>
              <button className="mini-btn" onClick={startRename}>Rename</button>
              <button className="mini-btn" onClick={() => setMerging(true)}>Merge into…</button>
              <button
                className={`mini-btn${personFilter === selected.id ? " active" : ""}`}
                onClick={() => filterAndClose(personFilter === selected.id ? null : selected.id)}
              >
                {personFilter === selected.id ? "Clear map filter" : "Filter map"}
              </button>
            </>
          )}
        </div>
        {faces === null ? (
          <p className="muted-sm">Loading…</p>
        ) : faces.length === 0 ? (
          <p className="muted-sm">No face crops available.</p>
        ) : (
          <div className="face-grid">
            {faces.map((f) => (
              <div key={f.id} className="face-thumb-btn">
                {f.thumb_name
                  ? <img src={faceThumbUrl(f.thumb_name)} alt="" loading="lazy" />
                  : <img src={thumbUrl(f.media_id)} alt="" loading="lazy" />}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="people-tab">
      {faceStats && (
        <div className="face-stats-block">
          <div className="face-stats-row">
            <span className="face-stats-label">Images analysed</span>
            <span className="face-stats-value">{facePct != null ? `${facePct}%` : "—"}</span>
          </div>
          <div className="face-stats-progress-bar">
            <div className="face-stats-progress-fill" style={{ width: `${facePct ?? 0}%` }} />
          </div>
          <div className="face-stats-row">
            <span className="face-stats-label">Faces found</span>
            <span className="face-stats-value">{faceStats.total_faces.toLocaleString()}</span>
          </div>
          <div className="face-stats-row">
            <span className="face-stats-label">People identified</span>
            <span className="face-stats-value">{faceStats.total_people.toLocaleString()}</span>
          </div>
        </div>
      )}

      {faceScanning && (
        <div className="face-scan-running">
          <span className="face-scan-label">
            {faceScan.state === "clustering" ? "Clustering…" : `Analysing faces… ${faceScan.total ? Math.round(faceScan.processed / faceScan.total * 100) : 0}%`}
          </span>
          <div className="progress" style={{ marginTop: 4 }}>
            <div className="progress-bar" style={{
              width: faceScan.state === "clustering" ? "100%" :
                faceScan.total ? `${Math.round(faceScan.processed / faceScan.total * 100)}%` : "0%"
            }} />
          </div>
        </div>
      )}

      <div className="people-tab-actions">
        <button className="mini-btn" onClick={handleRecluster} disabled={faceScanning}>
          {faceScan?.state === "clustering" ? "Clustering…" : "Re-cluster"}
        </button>
        {localPeople.length > 0 && (
          <button
            className={`mini-btn${selectMode ? " active" : ""}`}
            onClick={() => { setSelectMode(s => !s); setSelectedIds(new Set()); }}
          >
            {selectMode ? "cancel" : "select to merge"}
          </button>
        )}
        {selectMode && selectedIds.size >= 2 && (
          <button className="mini-btn" onClick={handleMergeSelected}>
            Merge {selectedIds.size}
          </button>
        )}
        <button className="danger-btn" onClick={handleResetFaces} style={{ marginLeft: "auto" }}>
          Reset face data
        </button>
      </div>

      {localPeople.length === 0 ? (
        <p className="muted-sm">No people identified yet. Faces are analysed automatically after each library scan.</p>
      ) : (
        <div className="people-grid">
          {[...localPeople].sort((a, b) => b.face_count - a.face_count).map((p) => (
            <button
              key={p.id}
              className={`person-card${selectMode && selectedIds.has(p.id) ? " person-card-selected" : ""}${!selectMode && personFilter === p.id ? " person-card-active" : ""}`}
              onClick={() => selectMode ? toggleCardSelect(p.id) : setSelected(p)}
            >
              <div className="person-avatar">
                {p.cover_thumb ? <img src={faceThumbUrl(p.cover_thumb)} alt={p.name} /> : <div className="person-avatar-placeholder" />}
              </div>
              <span className="person-name">{p.name}</span>
              <span className="person-count">{p.face_count.toLocaleString()} faces</span>
              {!selectMode && personFilter === p.id && <span className="people-filter-badge">on map</span>}
              {selectMode && (
                <span className={`person-select-check${selectedIds.has(p.id) ? " checked" : ""}`}>
                  {selectedIds.has(p.id) ? "✓" : ""}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Duplicates tab ─────────────────────────────────────────────────────────

function formatBytes(n) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function DupLightbox({ item, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="dup-lightbox-backdrop" onClick={onClose}>
      <div className="dup-lightbox" onClick={(e) => e.stopPropagation()}>
        <img src={thumbUrl(item.id)} alt={item.filename} />
        <p className="dup-lightbox-name">{item.filename}</p>
        <p className="dup-lightbox-path">{item.path}</p>
        <button className="overlay-close" onClick={onClose}>×</button>
      </div>
    </div>
  );
}

const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>
);

function DupGroup({ group, onDeleted }) {
  const [keepSet, setKeepSet] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const toggle = (i) => setKeepSet(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const handleDelete = async () => {
    if (keepSet.size === 0) return;
    setDeleting(true);
    try {
      const toDelete = group.filter((_, i) => !keepSet.has(i));
      await Promise.all(toDelete.map((item) => deleteMedia(item.id)));
      onDeleted();
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const anySelected = keepSet.size > 0;
  const toDeleteCount = anySelected ? group.length - keepSet.size : 0;

  return (
    <>
      {lightbox && <DupLightbox item={lightbox} onClose={() => setLightbox(null)} />}
      <div className="dup-group">
        <div className="dup-items-row">
          {group.map((item, i) => {
            const isKeep  = keepSet.has(i);
            const isCross = anySelected && !isKeep;
            return (
              <div
                key={item.id}
                className={`dup-item${isKeep ? " dup-keep" : isCross ? " dup-cross" : ""}`}
                onClick={() => toggle(i)}
              >
                <div className="dup-thumb-wrap">
                  {item.thumb_name
                    ? <img src={thumbUrl(item.id)} alt={item.filename} className="dup-thumb" />
                    : <div className="dup-thumb dup-thumb-placeholder" />}
                  {isKeep  && <span className="dup-badge dup-badge-keep">✓</span>}
                  {isCross && <span className="dup-badge dup-badge-cross">✕</span>}
                  <button
                    className="dup-enlarge-btn"
                    title="Enlarge"
                    onClick={(e) => { e.stopPropagation(); setLightbox(item); }}
                  >⤢</button>
                </div>
                <div className="dup-item-info">
                  <span className="dup-filename" title={item.filename}>{item.filename}</span>
                  <span className="dup-meta">{item.taken_at?.slice(0, 10) || "—"}</span>
                  <span className="dup-meta">{formatBytes(item.size_bytes)}</span>
                  <span className="dup-path" title={item.path}>{item.path}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="dup-actions-col">
          <button
            className="danger-icon-btn"
            disabled={toDeleteCount === 0 || deleting}
            onClick={handleDelete}
            title={toDeleteCount === 0 ? "tick the photos to keep first" : `delete ${toDeleteCount} photo${toDeleteCount !== 1 ? "s" : ""}`}
          >
            {deleting ? "…" : <IconTrash />}
          </button>
        </div>
      </div>
    </>
  );
}

function DuplicatesTab() {
  const [stats, setStats] = useState(null);
  const [groups, setGroups] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 15;

  useEffect(() => {
    fetchDuplicateStats().then(setStats).catch(() => {});
    loadGroups(0, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function loadGroups(p, reset = false) {
    setLoading(true);
    fetchDuplicates(p, LIMIT)
      .then((data) => {
        setGroups((prev) => (reset ? data : [...prev, ...data]));
        setHasMore(data.length === LIMIT);
        setPage(p);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const hashPct = stats?.total ? Math.floor((stats.hashed / stats.total) * 100) : 0;

  return (
    <div className="duplicates-tab">
      {stats && (
        <div className="face-stats-block">
          <div className="face-stats-row">
            <span className="face-stats-label">Files hashed</span>
            <span className="face-stats-value">
              {stats.hashed.toLocaleString()} / {stats.total.toLocaleString()} ({hashPct}%)
            </span>
          </div>
          <div className="progress" style={{ margin: "4px 0 8px" }}>
            <div className="progress-bar" style={{ width: `${hashPct}%` }} />
          </div>
          <div className="face-stats-row">
            <span className="face-stats-label">Duplicate groups</span>
            <span className="face-stats-value">{stats.groups.toLocaleString()}</span>
          </div>
          <div className="face-stats-row">
            <span className="face-stats-label">Duplicate items</span>
            <span className="face-stats-value">{stats.dup_items.toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="dup-groups">
        {groups.length === 0 && !loading && (
          <p className="muted-sm">No duplicates found yet.</p>
        )}
        {groups.map((group, gi) => (
          <DupGroup
            key={gi}
            group={group}
            onDeleted={() => setGroups((prev) => prev.filter((_, i) => i !== gi))}
          />
        ))}
        {hasMore && (
          <button className="mini-btn" style={{ margin: "12px auto", display: "block" }}
            onClick={() => loadGroups(page + 1)} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Corrupt media tab ───────────────────────────────────────────────────────

function CorruptTab() {
  const [items, setItems] = useState(null);
  const [deleting, setDeleting] = useState(new Set());

  useEffect(() => {
    fetchCorruptMedia().then(setItems).catch(() => setItems([]));
  }, []);

  const remove = async (id) => {
    setDeleting((s) => new Set([...s, id]));
    try {
      await deleteMedia(id);
      setItems((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setDeleting((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const deleteAll = async () => {
    if (!window.confirm(`Delete all ${items.length} corrupt/unreadable files from disk?`)) return;
    for (const item of items) await remove(item.id).catch(() => {});
  };

  if (items === null) return <div className="duplicates-tab"><p className="muted-sm">Loading…</p></div>;

  return (
    <div className="duplicates-tab">
      <div className="face-stats-block">
        <div className="face-stats-row">
          <span className="face-stats-label">Unreadable files</span>
          <span className="face-stats-value">{items.length.toLocaleString()}</span>
        </div>
      </div>
      {items.length > 0 && (
        <p className="muted-sm">
          These files could not be thumbnailed — likely corrupt, unsupported, or unreadable.
          Deleting them removes them from disk permanently.
        </p>
      )}
      {items.length > 1 && (
        <button className="danger-btn" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6 }} onClick={deleteAll}>
          <IconTrash /> delete all
        </button>
      )}
      <div className="corrupt-list">
        {items.length === 0 && <p className="muted-sm">No unreadable files found.</p>}
        {items.map((m) => (
          <div key={m.id} className="corrupt-row">
            <div className="corrupt-info">
              <span className="dup-filename">{m.filename}</span>
              <span className="dup-meta">{m.media_type} · {m.taken_at?.slice(0, 10) || "no date"} · {formatBytes(m.size_bytes)}</span>
              <span className="dup-path" title={m.path}>{m.path}</span>
            </div>
            <button
              className="danger-icon-btn"
              disabled={deleting.has(m.id)}
              onClick={() => remove(m.id)}
              title="delete this file"
            >
              {deleting.has(m.id) ? "…" : <IconTrash />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

const COLOR_SLOTS = [
  { key: "water",     label: "Water",        hint: "#4a90d9" },
  { key: "land",      label: "Land / Parks", hint: "#7cb87a" },
  { key: "buildings", label: "Buildings",    hint: "#c8b99a" },
  { key: "roads",     label: "Roads",        hint: "#f0ece6" },
  { key: "labels",    label: "Labels",       hint: "#333333" },
];

export default function SettingsModal({
  open,
  initialTab,
  onClose,
  mapStyles,
  settings,
  onSaved,
  onReset,
  layerVisibility,
  onLayerVisibility,
  colorOverrides,
  onColorOverrides,
  people,
  faceScan,
  onPeopleChanged,
  onPersonFilter,
  personFilter,
  onStartFacePoll,
  unlocatedGroups,
  onUnlocatedPlace,
  onUnlocatedPreview,
  unlocatedTypeFilter,
  onUnlocatedTypeFilter,
  unlocatedSuggestedOnly,
  onUnlocatedSuggestedOnly,
  onUnlocatedAutoPlace,
}) {
  const [activeTab, setActiveTab] = useState(initialTab || "about");
  const [style, setStyle] = useState(settings?.map_style || "");
  const [roots, setRoots] = useState(settings?.scan_roots || []);
  const [intervalHours, setIntervalHours] = useState(settings?.scan_interval_hours ?? 24);
  const [protomapsKey, setProtomapsKey] = useState(settings?.protomaps_key || "");
  const [maptilerKey, setMaptilerKey] = useState(settings?.maptiler_key || "");
  const [customMaps, setCustomMaps] = useState(settings?.custom_maps || []);
  const [newMapLabel, setNewMapLabel] = useState("");
  const [newMapUrl, setNewMapUrl] = useState("");
  const [browser, setBrowser] = useState({ path: null, parent: null, dirs: [] });
  const [manualPath, setManualPath] = useState("");
  const [rescan, setRescan] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dupGroupCount, setDupGroupCount] = useState(null);
  const [corruptCount, setCorruptCount] = useState(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab || "about");
      setStyle(settings?.map_style || "");
      setRoots(settings?.scan_roots || []);
      setIntervalHours(settings?.scan_interval_hours ?? 24);
      setProtomapsKey(settings?.protomaps_key || "");
      setMaptilerKey(settings?.maptiler_key || "");
      setCustomMaps(settings?.custom_maps || []);
      setNewMapLabel("");
      setNewMapUrl("");
      fetchDuplicateStats().then((s) => setDupGroupCount(s.groups)).catch(() => {});
      fetchCorruptMedia().then((items) => setCorruptCount(items.length)).catch(() => {});
      setManualPath("");
      setError(null);
      load(settings?.scan_roots?.[0] || null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = (path) =>
    browseDir(path).then(setBrowser).catch((e) => setError(String(e)));

  if (!open) return null;

  const addRoot = (path) =>
    setRoots((prev) => (prev.includes(path) ? prev : [...prev, path]));
  const removeRoot = (path) => setRoots((prev) => prev.filter((r) => r !== path));

  const onResetClick = async () => {
    if (!window.confirm(
      "Reset the index? This deletes all indexed photos and thumbnails " +
      "(your original files are never touched). You can scan again afterwards."
    )) return;
    setError(null);
    try {
      await resetIndex();
      onReset?.();
      onClose();
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ""));
    }
  };

  const addCustomMap = () => {
    if (!newMapLabel.trim() || !newMapUrl.trim()) return;
    const id = "custom-" + Math.random().toString(36).slice(2, 8);
    setCustomMaps((prev) => [...prev, { id, label: newMapLabel.trim(), url: newMapUrl.trim() }]);
    setNewMapLabel("");
    setNewMapUrl("");
  };

  const removeCustomMap = (id) => setCustomMaps((prev) => prev.filter((m) => m.id !== id));

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveSettings({ map_style: style, scan_roots: roots, scan_interval_hours: intervalHours, protomaps_key: protomapsKey, maptiler_key: maptilerKey, custom_maps: customMaps, color_overrides: colorOverrides || {} });
      onSaved(saved, rescan);
      onClose();
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings-tab-bar">
          <button
            className="settings-save-tab-btn"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            className={`settings-tab-btn${activeTab === "about" ? " active" : ""}`}
            onClick={() => setActiveTab("about")}
          >
            About
          </button>
          <button
            className={`settings-tab-btn${activeTab === "corrupt" ? " active" : ""}`}
            onClick={() => setActiveTab("corrupt")}
          >
            Corrupt
            {corruptCount > 0 && <span className="settings-tab-badge">{badge(corruptCount)}</span>}
          </button>
          <button
            className={`settings-tab-btn${activeTab === "duplicates" ? " active" : ""}`}
            onClick={() => setActiveTab("duplicates")}
          >
            Duplicates
            {dupGroupCount > 0 && <span className="settings-tab-badge">{badge(dupGroupCount)}</span>}
          </button>
          <button
            className={`settings-tab-btn${activeTab === "unlocated" ? " active" : ""}`}
            onClick={() => setActiveTab("unlocated")}
          >
            No location
            {unlocatedGroups?.length > 0 && (
              <span className="settings-tab-badge">{badge(unlocatedGroups.length)}</span>
            )}
          </button>
          <button
            className={`settings-tab-btn${activeTab === "people" ? " active" : ""}`}
            onClick={() => setActiveTab("people")}
          >
            People {people?.length > 0 && <span className="settings-tab-badge">{badge(people.length)}</span>}
          </button>
          <button
            className={`settings-tab-btn${activeTab === "maps" ? " active" : ""}`}
            onClick={() => setActiveTab("maps")}
          >
            Maps
          </button>
          <button
            className={`settings-tab-btn${activeTab === "settings" ? " active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            Settings
          </button>
        </div>
        <button className="overlay-close" onClick={onClose} aria-label="Close">×</button>

        <div className="settings-body">
        {error && <p className="scan-note error" style={{ marginTop: 0, marginBottom: 12 }}>{error}</p>}
        {activeTab === "about" ? (
          <AboutTab />
        ) : activeTab === "people" ? (
          <PeopleTab
            people={people || []}
            faceScan={faceScan}
            onPeopleChanged={onPeopleChanged}
            onPersonFilter={onPersonFilter}
            personFilter={personFilter}
            onClose={onClose}
            onStartFacePoll={onStartFacePoll}
          />
        ) : activeTab === "duplicates" ? (
          <DuplicatesTab />
        ) : activeTab === "corrupt" ? (
          <CorruptTab />
        ) : activeTab === "unlocated" ? (
          <UnlocatedPanel
            embedded
            suppressEscape
            groups={unlocatedGroups || []}
            onPlace={onUnlocatedPlace}
            onClose={onClose}
            onPreview={onUnlocatedPreview}
            typeFilter={unlocatedTypeFilter || ["image", "video", "pano"]}
            onTypeFilter={onUnlocatedTypeFilter}
            suggestedOnly={unlocatedSuggestedOnly || false}
            onSuggestedOnly={onUnlocatedSuggestedOnly}
            onAutoPlace={onUnlocatedAutoPlace}
          />
        ) : activeTab === "maps" ? (
          <>
            <div className="osm-attribution">
              <img src="/openstreetmap.webp" alt="OpenStreetMap" className="osm-attribution-logo" />
              <span>Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</span>
            </div>

            <section>
              <h3>Map style</h3>
              {[
                { group: "Vector", types: ["vector"] },
                { group: "Raster", types: ["raster"] },
              ].map(({ group, types }) => {
                const grouped = mapStyles.filter((s) => types.includes(s.type));
                if (!grouped.length) return null;
                return (
                  <div key={group} className="style-group">
                    <p className="style-group-label">{group}</p>
                    <div className="style-grid">
                      {grouped.map((s) => (
                        <label key={s.id} className={`style-opt ${style === s.id ? "sel" : ""}`}>
                          <input type="radio" name="style" checked={style === s.id} onChange={() => setStyle(s.id)} />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>

            {mapStyles.find((s) => s.id === style)?.type === "vector" && (
              <section>
                <h3>Map layers</h3>
                <p className="muted-sm">Toggle which details are drawn on vector map styles.</p>
                <div className="layer-toggles">
                  {Object.entries(LAYER_LABELS).map(([key, label]) => (
                    <label key={key} className="layer-toggle-row">
                      <input
                        type="checkbox"
                        checked={layerVisibility?.[key] !== false}
                        onChange={(e) => onLayerVisibility?.({ ...layerVisibility, [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </section>
            )}

            {mapStyles.find((s) => s.id === style)?.type === "vector" && (
              <section>
                <h3>Colors</h3>
                <p className="muted-sm">Override layer colors on vector styles. Check a slot to enable, then pick a color.</p>
                <div className="color-overrides-grid">
                  {COLOR_SLOTS.map(({ key, label, hint }) => {
                    const active = key in (colorOverrides || {});
                    return (
                      <div key={key} className={`color-override-row${active ? " active" : ""}`}>
                        <label className="color-override-check">
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(e) => {
                              const next = { ...(colorOverrides || {}) };
                              if (e.target.checked) next[key] = hint;
                              else delete next[key];
                              onColorOverrides?.(next);
                            }}
                          />
                        </label>
                        <span className="color-override-label">{label}</span>
                        <input
                          type="color"
                          className="color-override-swatch"
                          value={(colorOverrides || {})[key] || hint}
                          disabled={!active}
                          onChange={(e) => onColorOverrides?.({ ...(colorOverrides || {}), [key]: e.target.value })}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h3>Map providers</h3>
              <div className="settings-field">
                <label className="settings-label">
                  <img src="/protomaps.webp" alt="Protomaps" className="settings-provider-logo" />
                  API key
                </label>
                <input
                  className="settings-input"
                  type="password"
                  placeholder="Unlock Protomaps vector styles"
                  value={protomapsKey}
                  onChange={(e) => setProtomapsKey(e.target.value)}
                />
              </div>
              <div className="settings-field">
                <label className="settings-label">
                  <img src="/maptiler.webp" alt="MapTiler" className="settings-provider-logo" />
                  API key
                </label>
                <input
                  className="settings-input"
                  type="password"
                  placeholder="Unlock MapTiler vector styles"
                  value={maptilerKey}
                  onChange={(e) => setMaptilerKey(e.target.value)}
                />
              </div>
            </section>

            <section>
              <h3>Custom styles</h3>
              <p className="muted-sm">Add any Mapbox-compatible style URL — MapTiler custom maps, self-hosted styles, etc.</p>
              <div className="custom-map-add">
                <input
                  className="settings-input"
                  placeholder="Name"
                  value={newMapLabel}
                  onChange={(e) => setNewMapLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCustomMap(); }}
                />
                <input
                  className="settings-input custom-map-url-input"
                  placeholder="https://…/style.json?key=…"
                  value={newMapUrl}
                  onChange={(e) => setNewMapUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCustomMap(); }}
                />
                <button className="mini-btn" onClick={addCustomMap}>Add</button>
              </div>
              {customMaps.length > 0 && (
                <ul className="custom-map-list">
                  {customMaps.map((m) => (
                    <li key={m.id} className="custom-map-item">
                      <span className="custom-map-item-label">{m.label}</span>
                      <span className="custom-map-item-url">{m.url}</span>
                      <button className="mini-btn" onClick={() => removeCustomMap(m.id)}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <>
            <section>
              <h3>Library directories</h3>
              <p className="muted-sm">
                Folders Mneme indexes. Browse your mounted library below and add the
                folders you want to include.
              </p>
              <ul className="root-list">
                {roots.length === 0 && <li className="muted-sm">No directories selected.</li>}
                {roots.map((r) => (
                  <li key={r}>
                    <span className="root-path">{r}</span>
                    <button className="mini-btn" onClick={() => removeRoot(r)}>Remove</button>
                  </li>
                ))}
              </ul>

              <div className="browser">
                <div className="browser-bar">
                  <button
                    className="mini-btn"
                    disabled={browser.parent === null}
                    onClick={() => load(browser.parent)}
                  >
                    ↑ Up
                  </button>
                  <div className="crumbs">
                    {(() => {
                      const parts = (browser.path || "/").split("/").filter(Boolean);
                      const crumbs = [{ name: "🖥 root", path: "/" }];
                      let acc = "";
                      for (const part of parts) {
                        acc += "/" + part;
                        crumbs.push({ name: part, path: acc });
                      }
                      return crumbs.map((c, i) => (
                        <span key={c.path} className="crumb-wrap">
                          {i > 0 && <span className="crumb-sep">/</span>}
                          <button className="crumb" onClick={() => load(c.path)}>
                            {c.name}
                          </button>
                        </span>
                      ));
                    })()}
                  </div>
                  <button className="mini-btn" onClick={() => addRoot(browser.path)}>
                    + Add
                  </button>
                </div>
                <ul className="dir-list">
                  {browser.dirs.length === 0 && (
                    <li className="muted-sm">
                      No subfolders here — use "↑ Up" to browse, or add a path below.
                    </li>
                  )}
                  {browser.dirs.map((d) => (
                    <li key={d.path}>
                      <button className="dir-open" onClick={() => load(d.path)}>📁 {d.name}</button>
                      <button className="mini-btn" onClick={() => addRoot(d.path)}>Add</button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="path-add">
                <input
                  type="text"
                  placeholder="/media/… add a folder by path"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualPath.trim()) {
                      addRoot(manualPath.trim());
                      setManualPath("");
                    }
                  }}
                />
                <button
                  className="mini-btn"
                  onClick={() => { if (manualPath.trim()) { addRoot(manualPath.trim()); setManualPath(""); } }}
                >
                  Add path
                </button>
              </div>
            </section>

            <section>
              <h3>Auto-scan interval</h3>
              <div className="interval-row">
                <select
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(Number(e.target.value))}
                >
                  <option value={0}>Disabled</option>
                  <option value={1}>Every hour</option>
                  <option value={6}>Every 6 hours</option>
                  <option value={12}>Every 12 hours</option>
                  <option value={24}>Every 24 hours</option>
                  <option value={48}>Every 48 hours</option>
                  <option value={168}>Every week</option>
                </select>
                <p className="muted-sm">
                  {intervalHours > 0
                    ? "Mneme will automatically scan your library in the background."
                    : "Automatic scanning is disabled. Scan manually to index new files."}
                </p>
                <label className="rescan-toggle">
                  <input type="checkbox" checked={rescan} onChange={(e) => setRescan(e.target.checked)} />
                  Re-scan after saving
                </label>
              </div>
            </section>

            <section>
              <h3>Index</h3>
              <div className="danger-row">
                <p className="muted-sm">
                  Clear all indexed photos and thumbnails. Your original files are
                  never touched — re-scan to rebuild.
                </p>
                <button className="danger-btn" onClick={onResetClick}>
                  Reset index
                </button>
              </div>
            </section>

          </>
        )}
        </div>
      </div>
    </div>
  );
}
