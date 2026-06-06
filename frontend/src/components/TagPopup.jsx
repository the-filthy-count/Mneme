import { useEffect, useRef, useState } from "react";

export default function TagPopup({ tags, selected, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = tags.filter((t) =>
    t.tag.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (tag) => {
    if (selected.includes(tag)) {
      onSelect(selected.filter((t) => t !== tag));
    } else {
      onSelect([...selected, tag]);
    }
  };

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="tag-popup" onClick={(e) => e.stopPropagation()}>
        <div className="cluster-popup-header">
          <div>
            <h2 className="cluster-popup-title">filter by tag</h2>
            <p className="cluster-popup-sub">
              {tags.length} tag{tags.length !== 1 ? "s" : ""}
              {selected.length > 0 ? ` · ${selected.length} selected` : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {selected.length > 0 && (
              <button className="mini-btn" onClick={() => onSelect([])}>clear all</button>
            )}
            <button className="overlay-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="tag-active-pills">
            {selected.map((t) => (
              <span key={t} className="tag-active-pill" onClick={() => toggle(t)}>
                {t} ×
              </span>
            ))}
          </div>
        )}

        <div className="tag-search-wrap">
          <input
            ref={inputRef}
            className="tag-search"
            type="text"
            placeholder="search tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="tag-list">
          {filtered.length === 0 ? (
            <p className="cluster-popup-loading">no tags match</p>
          ) : (
            filtered.map(({ tag, count }) => (
              <button
                key={tag}
                className={`tag-list-item${selected.includes(tag) ? " active" : ""}`}
                onClick={() => toggle(tag)}
              >
                <span className="tag-list-name">{tag}</span>
                <span className="tag-list-count">{count}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
