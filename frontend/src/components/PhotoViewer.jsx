import { useEffect } from "react";
import { fileUrl } from "../api.js";

const fmtDate = (s) =>
  s ? new Date(s).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }) : "Unknown date";

export default function PhotoViewer({ item, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!item) return null;

  return (
    <div className="viewer-backdrop" onClick={onClose}>
      <div className="viewer" onClick={(e) => e.stopPropagation()}>
        <button className="viewer-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="viewer-media">
          {item.media_type === "video" ? (
            <video src={fileUrl(item.id)} controls autoPlay />
          ) : (
            <img src={fileUrl(item.id)} alt={item.filename} />
          )}
        </div>
        <div className="viewer-meta">
          <div className="viewer-filename">{item.filename}</div>
          <div className="viewer-detail">{fmtDate(item.taken_at)}</div>
          {item.place && (
            <div className="viewer-place">
              📍 {[item.place, item.region, item.country].filter(Boolean).join(", ")}
            </div>
          )}
          {item.lat != null && (
            <div className="viewer-detail">
              {item.lat.toFixed(5)}, {item.lon.toFixed(5)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
