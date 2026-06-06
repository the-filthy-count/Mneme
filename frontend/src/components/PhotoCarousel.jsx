import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { checkJournalMedia, fileUrl, geocodeSearch, patchMedia, thumbUrl, toggleJournalMedia } from "../api.js";

const IconGrid = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </svg>
);

const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const IconFullscreen = ({ active }) => active ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
    <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
    <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
  </svg>
);

const PanoViewer = lazy(() => import("./PanoViewer.jsx"));

const IconStar = ({ filled, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
       fill={filled ? "currentColor" : "none"}
       stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const IconShare = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

const IconJournal = ({ active }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);

const IconEdit = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IconLocationDot = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 384 512" fill="currentColor">
    <path d="M215.7 499.2C267 435 384 270.7 384 192 384 86 298 0 192 0S0 86 0 192c0 78.7 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/>
  </svg>
);

const SHARE_PLATFORMS = [
  { id: "x",        label: "X",        color: "#000",    buildUrl: (u, t) => `https://x.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { id: "facebook", label: "Facebook", color: "#1877f2", buildUrl: (u)    => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: "reddit",   label: "Reddit",   color: "#ff4500", buildUrl: (u, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
  { id: "whatsapp", label: "WhatsApp", color: "#25d366", buildUrl: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { id: "telegram", label: "Telegram", color: "#229ed9", buildUrl: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
];

const fmtDate = (s) =>
  s
    ? new Date(s).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })
    : "Unknown date";

export default function PhotoCarousel({ items, initialIndex = 0, onClose, onBack, onItemUpdated, onOpenJournal, onStartRepositionMedia }) {
  const [gridMode, setGridMode] = useState(items.length > 1);
  const [idx, setIdx] = useState(initialIndex);
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inJournal, setInJournal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editLat, setEditLat] = useState("");
  const [editLon, setEditLon] = useState("");
  const [editSearch, setEditSearch] = useState("");
  const [editResults, setEditResults] = useState([]);
  const [editSearching, setEditSearching] = useState(false);
  const carouselRef = useRef(null);
  const saveTimer = useRef(null);
  const shareRef = useRef(null);
  const editSearchTimer = useRef(null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      carouselRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const item = items?.[idx];

  useEffect(() => {
    if (!item) return;
    setComment(item.comment || "");
    setTags(item.tags || []);
    setTagInput("");
    setInJournal(false);
    const date = item.taken_at?.slice(0, 10);
    if (date) {
      checkJournalMedia(date, item.id).then(r => setInJournal(r.in_journal)).catch(() => {});
    }
  }, [item?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { if (gridMode) { onBack ? onBack() : onClose(); } else if (items.length > 1) setGridMode(true); else onClose(); }
      if (!gridMode && e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (!gridMode && e.key === "ArrowRight") setIdx((i) => Math.min(items.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, items?.length, gridMode]);

  const save = useCallback(
    async (newComment, newTags) => {
      if (!item) return;
      setSaving(true);
      try {
        const updated = await patchMedia(item.id, {
          comment: newComment,
          tags: newTags,
        });
        onItemUpdated?.(updated);
      } finally {
        setSaving(false);
      }
    },
    [item, onItemUpdated]
  );

  const scheduleComment = (val) => {
    setComment(val);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(val, tags), 800);
  };

  const addTag = (raw) => {
    const t = raw.trim().toLowerCase();
    if (!t || tags.includes(t)) { setTagInput(""); return; }
    const next = [...tags, t];
    setTags(next);
    setTagInput("");
    save(comment, next);
  };

  const removeTag = (tag) => {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    save(comment, next);
  };

  const shareUrl = item ? `${window.location.origin}${fileUrl(item.id)}` : "";
  const shareTitle = item?.filename ?? "";

  const handleShare = async () => {
    if (!item) return;
    // Try native share with file blob (works on mobile/macOS)
    if (typeof navigator.canShare === "function") {
      try {
        const res = await fetch(fileUrl(item.id));
        const blob = await res.blob();
        const file = new File([blob], item.filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: item.filename });
          return;
        }
      } catch { /* fall through */ }
    }
    // Try URL-only native share (desktop Chrome, Edge)
    if (navigator.share) {
      try {
        await navigator.share({ title: item.filename, url: shareUrl });
        return;
      } catch { /* fall through */ }
    }
    // Fallback: show our own share panel
    setShareOpen((s) => !s);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  // Close share panel on outside click
  useEffect(() => {
    if (!shareOpen) return;
    const handler = (e) => {
      if (shareRef.current && !shareRef.current.contains(e.target)) setShareOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareOpen]);

  const toggleFavourite = async () => {
    if (!item) return;
    const updated = await patchMedia(item.id, { is_favourite: !item.is_favourite });
    onItemUpdated?.(updated);
  };

  const toggleJournal = async () => {
    if (!item?.taken_at) return;
    const date = item.taken_at.slice(0, 10);
    const result = await toggleJournalMedia(date, item.id);
    setInJournal(result.in_journal);
    onOpenJournal?.(date);
  };

  const openEdit = () => {
    if (!item) return;
    setEditDate(item.taken_at ? item.taken_at.slice(0, 16) : "");
    setEditLat(item.lat != null ? String(item.lat) : "");
    setEditLon(item.lon != null ? String(item.lon) : "");
    setEditSearch("");
    setEditResults([]);
    setEditMode(true);
  };

  const doEditSearch = (q) => {
    setEditSearch(q);
    clearTimeout(editSearchTimer.current);
    if (q.length < 2) { setEditResults([]); return; }
    editSearchTimer.current = setTimeout(async () => {
      setEditSearching(true);
      try { setEditResults(await geocodeSearch(q)); }
      catch { setEditResults([]); }
      finally { setEditSearching(false); }
    }, 400);
  };

  const saveEdit = async () => {
    if (!item) return;
    const patch = {};
    if (editDate) patch.taken_at = editDate;
    if (editLat !== "" && editLon !== "") {
      patch.lat = parseFloat(editLat);
      patch.lon = parseFloat(editLon);
    }
    const updated = await patchMedia(item.id, patch);
    onItemUpdated?.(updated);
    setEditMode(false);
  };

  if (!item && !gridMode) return null;

  if (gridMode) {
    return (
      <div className="overlay-backdrop" onClick={onBack || onClose}>
        <div className="carousel-grid-wrap" onClick={(e) => e.stopPropagation()}>
          <div className="carousel-topbar">
            {onBack
              ? <button className="carousel-back-btn" onClick={onBack}>&lt; back to album</button>
              : <span className="carousel-counter">{items.length} photos</span>}
            <button className="overlay-close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className="carousel-grid">
            {items.map((it, i) => (
              <div key={it.id} className="grid-item-wrap">
                <button
                  className="carousel-grid-thumb"
                  onClick={() => { setIdx(i); setGridMode(false); }}
                >
                  <div className="thumb-square">
                    <img src={thumbUrl(it.id)} alt={it.filename} loading="lazy" />
                    {it.media_type === "video" && <span className="grid-video-badge">▶</span>}
                    {it.projection === "equirectangular" && <span className="grid-pano-badge">360°</span>}
                  </div>
                </button>
                <div className="grid-item-actions">
                  <button
                    className={`grid-action-btn${it.is_favourite ? " fav-on" : ""}`}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const updated = await patchMedia(it.id, { is_favourite: !it.is_favourite });
                      onItemUpdated?.(updated);
                    }}
                    title={it.is_favourite ? "Remove from favourites" : "Add to favourites"}
                  >
                    <IconStar filled={it.is_favourite} size={13} />
                  </button>
                  {it.taken_at && (
                    <button
                      className="grid-action-btn"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const date = it.taken_at.slice(0, 10);
                        await toggleJournalMedia(date, it.id);
                        onOpenJournal?.(date);
                      }}
                      title="Add to journal"
                    >
                      <IconJournal active={false} />
                    </button>
                  )}
                  {onStartRepositionMedia && (
                    <button
                      className="grid-action-btn"
                      onClick={(e) => { e.stopPropagation(); onStartRepositionMedia(it); }}
                      title="Reposition on map"
                    >
                      <IconLocationDot size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="carousel" ref={carouselRef} onClick={(e) => e.stopPropagation()}>
        <div className="carousel-topbar">
          {onBack
            ? <button className="carousel-back-btn" onClick={() => setGridMode(true)}>&lt; back</button>
            : <span className="carousel-counter">{idx + 1} / {items.length}</span>}
          <div className="carousel-topbar-actions">
            <button
              className={`carousel-action-btn carousel-fav-btn${item.is_favourite ? " fav-on" : ""}`}
              onClick={toggleFavourite}
              title={item.is_favourite ? "Remove from favourites" : "Add to favourites"}
              aria-label="Toggle favourite"
            >
              <IconStar filled={item.is_favourite} />
            </button>
            {item.taken_at && (
              <button
                className={`carousel-action-btn${inJournal ? " journal-on" : ""}`}
                onClick={toggleJournal}
                title={inJournal ? "Remove from journal" : "Add to journal"}
                aria-label="Toggle journal"
              >
                <IconJournal active={inJournal} />
              </button>
            )}
            {items.length > 1 && (
              <button className="carousel-action-btn" onClick={() => setGridMode(true)} aria-label="All photos" title="All photos">
                <IconGrid />
              </button>
            )}
            <button className="carousel-action-btn" onClick={toggleFullscreen} aria-label="Toggle fullscreen" title="Fullscreen">
              <IconFullscreen active={isFullscreen} />
            </button>
            {onStartRepositionMedia && (
              <button
                className="carousel-action-btn"
                onClick={() => onStartRepositionMedia(item)}
                aria-label="Reposition on map"
                title="Reposition on map"
              >
                <IconLocationDot />
              </button>
            )}
            <button
              className={`carousel-action-btn${editMode ? " edit-active" : ""}`}
              onClick={editMode ? () => setEditMode(false) : openEdit}
              aria-label="Edit date/location"
              title="Edit date or location"
            >
              <IconEdit />
            </button>
            <a
              className="carousel-action-btn"
              href={fileUrl(item.id)}
              download={item.filename}
              onClick={(e) => e.stopPropagation()}
              title="Download"
              aria-label="Download"
            >
              <IconDownload />
            </a>
            <div className="share-wrap" ref={shareRef}>
              <button
                className={`carousel-action-btn${shareOpen ? " share-active" : ""}`}
                onClick={handleShare}
                title="Share"
                aria-label="Share"
              >
                <IconShare />
              </button>
              {shareOpen && (
                <div className="share-panel">
                  <button className="share-copy-btn" onClick={copyLink}>
                    {copied ? "✓ copied!" : "copy link"}
                  </button>
                  <div className="share-divider" />
                  {SHARE_PLATFORMS.map(({ id, label, color, buildUrl }) => (
                    <a
                      key={id}
                      className="share-platform-btn"
                      href={buildUrl(shareUrl, shareTitle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ "--platform-color": color }}
                      onClick={() => setShareOpen(false)}
                    >
                      {label}
                    </a>
                  ))}
                  <p className="share-note">platform links require a public URL</p>
                </div>
              )}
            </div>
            <button className="overlay-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        <div className="carousel-stage">
          <button
            className="carousel-nav carousel-prev"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            aria-label="Previous"
          >
            ‹
          </button>

          <div className="carousel-media">
            {item.projection === "equirectangular" ? (
              <Suspense fallback={<div className="pano-loading" />}>
                <PanoViewer item={item} />
              </Suspense>
            ) : item.media_type === "video" ? (
              <video key={item.id} src={fileUrl(item.id)} controls autoPlay />
            ) : (
              <img key={item.id} src={fileUrl(item.id)} alt={item.filename} />
            )}
          </div>

          <button
            className="carousel-nav carousel-next"
            onClick={() => setIdx((i) => Math.min(items.length - 1, i + 1))}
            disabled={idx === items.length - 1}
            aria-label="Next"
          >
            ›
          </button>
        </div>

        <div className="carousel-panel">
          {editMode ? (
            <div className="carousel-edit-form">
              <div className="edit-row">
                <label className="edit-label">Date &amp; time</label>
                <input
                  type="datetime-local"
                  className="edit-input"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="edit-row">
                <label className="edit-label">Location</label>
                <div className="edit-search-wrap">
                  <input
                    type="text"
                    className="edit-input"
                    placeholder="Search for a place…"
                    value={editSearch}
                    onChange={(e) => doEditSearch(e.target.value)}
                  />
                  {editSearching && <span className="edit-searching">Searching…</span>}
                  {editResults.length > 0 && (
                    <ul className="edit-place-results">
                      {editResults.map((r, i) => (
                        <li key={i}>
                          <button
                            className="edit-place-result"
                            onClick={() => {
                              setEditLat(String(r.lat));
                              setEditLon(String(r.lon));
                              setEditSearch(r.display_name);
                              setEditResults([]);
                            }}
                          >
                            {r.display_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="edit-row">
                <label className="edit-label">Lat / Lon</label>
                <div className="edit-coords">
                  <input
                    type="number"
                    step="any"
                    className="edit-input"
                    placeholder="Latitude"
                    value={editLat}
                    onChange={(e) => setEditLat(e.target.value)}
                  />
                  <input
                    type="number"
                    step="any"
                    className="edit-input"
                    placeholder="Longitude"
                    value={editLon}
                    onChange={(e) => setEditLon(e.target.value)}
                  />
                </div>
              </div>
              <div className="edit-actions">
                <button className="mini-btn" onClick={() => setEditMode(false)}>Cancel</button>
                <button className="scan-btn inline" onClick={saveEdit}>Save</button>
              </div>
            </div>
          ) : (
            <>
              <div className="carousel-meta">
                <span className="carousel-filename">
                  {item.filename}
                  {item.projection === "equirectangular" && (
                    <span className="pano-badge">360°</span>
                  )}
                </span>
                <span className="carousel-date">{fmtDate(item.taken_at)}</span>
                {item.place && (
                  <span className="carousel-place">
                    {[item.place, item.region, item.country].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>

              <div className="carousel-annotations">
                <div className="ann-tags">
                  {tags.map((t) => (
                    <span key={t} className="tag-pill">
                      {t}
                      <button className="tag-remove" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}>
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className="tag-input"
                    placeholder="Add tag…"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    onBlur={() => tagInput && addTag(tagInput)}
                  />
                </div>
                <textarea
                  className="ann-comment"
                  placeholder="Add a note…"
                  value={comment}
                  onChange={(e) => scheduleComment(e.target.value)}
                  rows={2}
                />
                {saving && <span className="ann-saving">Saving…</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
