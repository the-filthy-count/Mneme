import { useEffect, useState } from "react";
import { fetchUnlocatedItems, fetchUnlocatedSuggestions, thumbUrl } from "../api.js";

function GroupRow({ group, onPlace, onPreview }) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const expand = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (items !== null) return;
    setLoadingDetail(true);
    const [its, suggs] = await Promise.all([
      fetchUnlocatedItems(group.date).catch(() => []),
      fetchUnlocatedSuggestions(group.date).catch(() => []),
    ]);
    setItems(its);
    setSuggestions(suggs);
    setLoadingDetail(false);
  };

  const dirs = items
    ? [...new Set(items.map((it) => it.path.substring(0, it.path.lastIndexOf("/"))))]
    : [];

  const previewItems = items?.slice(0, 80) ?? [];

  const typeTags = [
    group.images > 0 && `${group.images} photo${group.images !== 1 ? "s" : ""}`,
    group.videos > 0 && `${group.videos} video${group.videos !== 1 ? "s" : ""}`,
    group.panos  > 0 && `${group.panos} 360°`,
  ].filter(Boolean);

  return (
    <div className={`unlocated-row${expanded ? " expanded" : ""}`}>
      <div className="unlocated-row-header" onClick={expand}>
        <div className="unlocated-thumb">
          {group.cover_id
            ? <img src={thumbUrl(group.cover_id)} alt="" loading="lazy" />
            : <div className="unlocated-no-thumb" />}
        </div>
        <div className="unlocated-info">
          <span className="unlocated-label">{group.label}</span>
          <span className="unlocated-count">
            {typeTags.join(" · ")}
            {group.has_suggestion && <span className="unlocated-sugg-dot" title="has location suggestion"> ●</span>}
          </span>
        </div>
        <button className="unlocated-expand" aria-label={expanded ? "Collapse" : "Expand"}>
          {expanded ? "▲" : "▼"}
        </button>
        <button
          className="place-btn"
          onClick={(e) => { e.stopPropagation(); onPlace(group); }}
        >
          place on map
        </button>
      </div>

      {expanded && (
        <div className="unlocated-detail">
          {loadingDetail ? (
            <p className="unlocated-loading">loading…</p>
          ) : (
            <>
              {previewItems.length > 0 && (
                <div className="unlocated-thumbs-row">
                  {previewItems.map((it) => (
                    <img
                      key={it.id}
                      src={thumbUrl(it.id)}
                      alt={it.filename}
                      loading="lazy"
                      className="unlocated-mini-thumb"
                      onClick={() => onPreview(items, items.indexOf(it))}
                      title={it.filename}
                    />
                  ))}
                  {items.length > previewItems.length && (
                    <button className="unlocated-more-btn" onClick={() => onPreview(items, 0)}>
                      +{items.length - previewItems.length} more
                    </button>
                  )}
                </div>
              )}

              {dirs.length > 0 && (
                <div className="unlocated-paths">
                  {dirs.map((d) => (
                    <span key={d} className="unlocated-path">{d}</span>
                  ))}
                </div>
              )}

              {suggestions !== null && suggestions.length > 0 && (
                <div className="unlocated-suggestions">
                  <span className="unlocated-sugg-label">suggested locations</span>
                  {suggestions.map((s, i) => (
                    <button key={i} className="unlocated-sugg-btn" onClick={() => onPlace(group, s)}>
                      <span className="sugg-source">{s.source === "same_day" ? "same day" : "same folder"}</span>
                      <span className="sugg-place">{s.source_label}</span>
                    </button>
                  ))}
                </div>
              )}

              {suggestions !== null && suggestions.length === 0 && (
                <p className="unlocated-no-sugg">no location suggestions — click the map to place manually</p>
              )}

              <button className="unlocated-gallery-btn" onClick={() => onPreview(items, 0)}>
                view in gallery ({items?.length ?? 0})
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const ALL_TYPES = ["image", "video", "pano"];

export default function UnlocatedPanel({
  groups, onPlace, onClose, onPreview,
  typeFilter, onTypeFilter, suggestedOnly, onSuggestedOnly,
  onAutoPlace, suppressEscape, embedded,
}) {
  const [autoPlacing, setAutoPlacing] = useState(false);

  useEffect(() => {
    if (suppressEscape || embedded) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, suppressEscape, embedded]);

  const handleAutoPlace = async () => {
    setAutoPlacing(true);
    try { await onAutoPlace?.(); } finally { setAutoPlacing(false); }
  };

  if (!groups) return null;

  const toggleType = (t) => {
    onTypeFilter((prev) => {
      if (prev.includes(t)) {
        const next = prev.filter((x) => x !== t);
        return next.length === 0 ? ALL_TYPES : next;
      }
      return [...prev, t];
    });
  };

  const visible = groups.filter((g) => {
    const typeMatch =
      (typeFilter.includes("image") && g.images > 0) ||
      (typeFilter.includes("video") && g.videos > 0) ||
      (typeFilter.includes("pano")  && g.panos  > 0);
    return typeMatch && (!suggestedOnly || g.has_suggestion);
  });

  const total = groups.reduce((s, g) => s + g.count, 0);
  const hasSuggestions = groups.some((g) => g.has_suggestion);

  const inner = (
    <>
      {!embedded && (
        <div className="cluster-popup-header">
          <div>
            <h2 className="cluster-popup-title">unlocated media</h2>
            <p className="cluster-popup-sub">
              {total.toLocaleString()} items without GPS — {visible.length} of {groups.length} groups shown
            </p>
          </div>
          <button className="overlay-close" onClick={onClose} aria-label="Close">×</button>
        </div>
      )}

      <div className="unlocated-filters">
          <div className="unlocated-type-pills">
            {[
              { key: "image", label: "photos" },
              { key: "video", label: "videos" },
              { key: "pano",  label: "360°" },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`unlocated-type-pill${typeFilter.includes(key) ? " active" : ""}`}
                onClick={() => toggleType(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="unlocated-sugg-row">
            <label className="unlocated-sugg-toggle">
              <input
                type="checkbox"
                checked={suggestedOnly}
                onChange={(e) => onSuggestedOnly(e.target.checked)}
              />
              suggested matches only
            </label>
            {hasSuggestions && (
              <button
                className="auto-place-btn"
                onClick={handleAutoPlace}
                disabled={autoPlacing}
                title="Auto-place all groups that have a same-day location match"
              >
                {autoPlacing ? "placing…" : "auto-place all"}
              </button>
            )}
          </div>
        </div>

      <div className="cluster-popup-scroll">
        {visible.length === 0 ? (
          <p className="cluster-popup-loading">no groups match the current filters.</p>
        ) : (
          <div className="unlocated-list">
            {visible.map((g) => (
              <GroupRow
                key={g.date}
                group={g}
                onPlace={onPlace}
                onPreview={onPreview}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (embedded) return inner;

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="cluster-popup" onClick={(e) => e.stopPropagation()}>
        {inner}
      </div>
    </div>
  );
}
