import { useEffect, useRef, useState } from "react";
import { fetchAlbums, saveAlbumLabel, thumbUrl } from "../api.js";

const IconStar = ({ filled }) => (
  <svg width="14" height="14" viewBox="0 0 24 24"
       fill={filled ? "currentColor" : "none"}
       stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const IconLocationDot = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 384 512" fill="currentColor">
    <path d="M215.7 499.2C267 435 384 270.7 384 192 384 86 298 0 192 0S0 86 0 192c0 78.7 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/>
  </svg>
);

const IconX = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconPencil = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);


function formatAlbumKey(albumKey) {
  const [y, m, d] = albumKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    weekday: dt.toLocaleDateString(undefined, { weekday: "long" }),
    date: dt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }),
  };
}

export default function ClusterPopup({ cluster, types, favourite, tags, personId, onAlbumSelect, onAlbumFavourite, onStartReposition, onRemoveLocation, onClose }) {
  const [albums, setAlbums] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editTags, setEditTags] = useState([]);
  const [editTagInput, setEditTagInput] = useState("");
  const editRef = useRef(null);

  useEffect(() => {
    if (!cluster) return;
    setAlbums(null);
    setSelectedYear(null);
    setEditingKey(null);
    fetchAlbums(cluster.cluster_key, { types, favourite, tags, personId }).then(setAlbums).catch(() => setAlbums([]));
  }, [cluster?.cluster_key, types, favourite, tags, personId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (editingKey) { setEditingKey(null); return; }
      if (selectedYear) { setSelectedYear(null); return; }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingKey, selectedYear, onClose]);

  useEffect(() => {
    if (editingKey) editRef.current?.focus();
  }, [editingKey]);

  if (!cluster) return null;

  const place = [cluster.place, cluster.region, cluster.country].filter(Boolean).join(", ");

  const years = albums
    ? [...new Set(albums.map((a) => a.album_key.slice(0, 4)))].sort()
    : [];
  const multiYear = years.length > 1;

  const visibleAlbums =
    albums && (!multiYear || selectedYear)
      ? selectedYear
        ? albums.filter((a) => a.album_key.startsWith(selectedYear))
        : albums
      : null;

  const yearCards = multiYear
    ? years.map((y) => {
        const ya = albums.filter((a) => a.album_key.startsWith(y));
        return { year: y, count: ya.reduce((s, a) => s + a.count, 0), cover_id: ya[0]?.cover_id };
      })
    : null;

  const startEdit = (album) => {
    setEditingKey(album.album_key);
    setEditLabel(album.custom_label || "");
    setEditTags(album.custom_tags || []);
    setEditTagInput("");
  };

  const addEditTag = (raw) => {
    const t = raw.trim().toLowerCase();
    if (!t || editTags.includes(t)) { setEditTagInput(""); return; }
    setEditTags((prev) => [...prev, t]);
    setEditTagInput("");
  };

  const toggleAlbumFav = async (e, album) => {
    e.stopPropagation();
    const allFav = album.favourite_count >= album.count;
    const newFav = !allFav;
    setAlbums((prev) =>
      prev.map((a) =>
        a.album_key === album.album_key
          ? { ...a, favourite_count: newFav ? a.count : 0 }
          : a
      )
    );
    await onAlbumFavourite?.(cluster.cluster_key, album.album_key, newFav);
  };

  const commitEdit = async (album) => {
    const newLabel = editLabel.trim() || null;
    const newTags = editTags.length > 0 ? editTags : null;
    await saveAlbumLabel(cluster.cluster_key, album.album_key, { label: newLabel, tags: newTags }).catch(() => {});
    setAlbums((prev) =>
      prev.map((a) =>
        a.album_key === album.album_key
          ? { ...a, custom_label: newLabel, custom_tags: newTags }
          : a
      )
    );
    setEditingKey(null);
  };

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="cluster-popup" onClick={(e) => e.stopPropagation()}>
        <div className="cluster-popup-header">
          <div>
            {multiYear && selectedYear && (
              <button className="back-crumb" onClick={() => setSelectedYear(null)}>
                &lt; {place || "all years"}
              </button>
            )}
            <h2 className="cluster-popup-title">{place || "Unknown location"}</h2>
            <p className="cluster-popup-sub">
              {cluster.count} photo{cluster.count !== 1 ? "s" : ""}
              {selectedYear ? ` · ${selectedYear}` : ""}
            </p>
          </div>
          <button className="overlay-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="cluster-popup-scroll">
        {albums === null ? (
          <p className="cluster-popup-loading">Loading…</p>
        ) : albums.length === 0 ? (
          <p className="cluster-popup-loading">No albums found.</p>
        ) : multiYear && !selectedYear ? (
          <div className="album-grid">
            {yearCards.map(({ year, count, cover_id }) => (
              <button key={year} className="album-card" onClick={() => setSelectedYear(year)}>
                <div className="album-cover">
                  {cover_id
                    ? <img src={thumbUrl(cover_id)} alt="" loading="lazy" />
                    : <div className="album-no-cover" />}
                </div>
                <div className="album-label">{year}</div>
                <div className="album-count">{count.toLocaleString()} photo{count !== 1 ? "s" : ""}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="album-grid">
            {visibleAlbums.map((album) => (
              <div key={album.album_key} className="album-card-wrap">
                <button className="album-card" onClick={() => onAlbumSelect(album)}>
                  <div className="album-cover">
                    {album.cover_id
                      ? <img src={thumbUrl(album.cover_id)} alt="" loading="lazy" />
                      : <div className="album-no-cover" />}
                  </div>
                  <div className="album-label">
                    {album.custom_label ? (
                      <span className="album-weekday">{album.custom_label}</span>
                    ) : (() => {
                      const { weekday, date } = formatAlbumKey(album.album_key);
                      return (<>
                        <span className="album-date">{date}</span>
                        <span className="album-weekday">{weekday}</span>
                      </>);
                    })()}
                  </div>
                  <div className="album-count">{album.count.toLocaleString()} photo{album.count !== 1 ? "s" : ""}</div>
                  {(album.place || album.region) && (
                    <div className="album-location-chip">{[album.place, album.region].filter(Boolean).join(", ")}</div>
                  )}
                  {album.custom_tags && album.custom_tags.length > 0 && (
                    <div className="album-tag-pills">
                      {album.custom_tags.map((t) => (
                        <span key={t} className="album-tag-pill">{t}</span>
                      ))}
                    </div>
                  )}
                </button>

                <div className="album-card-actions">
                  <button
                    className={`album-action-btn${album.favourite_count >= album.count ? " fav-on" : ""}`}
                    onClick={(e) => toggleAlbumFav(e, album)}
                    title={album.favourite_count >= album.count ? "Unfavourite album" : "Favourite album"}
                  >
                    <IconStar filled={album.favourite_count >= album.count} />
                  </button>
                  <button
                    className="album-action-btn"
                    title="Move to a different location"
                    onClick={(e) => { e.stopPropagation(); onStartReposition?.(album); }}
                  ><IconLocationDot /></button>
                  {album.location_manual && (
                    <button
                      className="album-action-btn remove-btn"
                      title="Remove custom location"
                      onClick={(e) => { e.stopPropagation(); onRemoveLocation?.(album); }}
                    ><IconX /></button>
                  )}
                  <button
                    className="album-action-btn"
                    title="Rename / tag album"
                    onClick={() => startEdit(album)}
                  ><IconPencil /></button>
                </div>

                {editingKey === album.album_key ? (
                  <div className="album-label-form">
                    <input
                      ref={editRef}
                      className="album-label-input"
                      value={editLabel}
                      placeholder={album.label}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(album);
                        if (e.key === "Escape") setEditingKey(null);
                      }}
                    />
                    <div className="album-tag-editor" onClick={(e) => e.stopPropagation()}>
                      {editTags.map((t) => (
                        <span key={t} className="album-tag-pill editing">
                          {t}
                          <button
                            className="tag-remove"
                            onClick={() => setEditTags((prev) => prev.filter((x) => x !== t))}
                            aria-label={`Remove tag ${t}`}
                          >×</button>
                        </span>
                      ))}
                      <input
                        className="album-tag-input"
                        placeholder="add tag…"
                        value={editTagInput}
                        onChange={(e) => setEditTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addEditTag(editTagInput); }
                          if (e.key === "Escape") setEditingKey(null);
                          if (e.key === "Backspace" && !editTagInput && editTags.length > 0) {
                            setEditTags((prev) => prev.slice(0, -1));
                          }
                        }}
                        onBlur={() => editTagInput.trim() && addEditTag(editTagInput)}
                      />
                    </div>
                    <div className="album-form-actions">
                      <button className="mini-btn" onClick={() => commitEdit(album)}>save</button>
                      <button className="mini-btn" onClick={() => setEditingKey(null)}>cancel</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
