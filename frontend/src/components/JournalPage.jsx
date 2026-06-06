import { useCallback, useEffect, useRef, useState } from "react";
import { deleteJournalEntry, fetchJournalEntry, saveJournalEntry, thumbUrl, toggleJournalMedia } from "../api.js";

const fmtDate = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

const COLORS = [
  "#e2e8f0", "#f9a8d4", "#f4a96b", "#86efac",
  "#67e8f9", "#a5b4fc", "#fde68a", "#fca5a5",
];

export default function JournalPage({ date, onClose, onStatsChange }) {
  const [entry, setEntry]   = useState(null);
  const [title, setTitle]   = useState("");
  const [color, setColor]   = useState("#e2e8f0");
  const bodyRef   = useRef(null);
  const titleRef  = useRef("");
  const saveTimer = useRef(null);
  const entryRef  = useRef(null);

  useEffect(() => { titleRef.current = title; }, [title]);

  useEffect(() => {
    fetchJournalEntry(date)
      .then(e => {
        setEntry(e);
        entryRef.current = e;
        setTitle(e.title || "");
        titleRef.current = e.title || "";
        if (bodyRef.current) bodyRef.current.innerHTML = e.body || "";
      })
      .catch(() => {});
  }, [date]);

  const isBlank = () => {
    const noTitle = !titleRef.current?.trim();
    const noBody  = !bodyRef.current?.innerText?.trim();
    const noMedia = (entryRef.current?.media?.length ?? 0) === 0;
    return noTitle && noBody && noMedia;
  };

  const handleClose = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (isBlank()) {
      try { await deleteJournalEntry(date); onStatsChange?.(); } catch { /* ignore */ }
    }
    onClose();
  }, [date, onClose, onStatsChange]);

  const handleDelete = async () => {
    clearTimeout(saveTimer.current);
    try { await deleteJournalEntry(date); onStatsChange?.(); } catch { /* ignore */ }
    onClose();
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveJournalEntry(date, {
        title: titleRef.current,
        body: bodyRef.current?.innerHTML || "",
      })
        .then(onStatsChange)
        .catch(() => {});
    }, 700);
  }, [date, onStatsChange]);

  const exec = (cmd, value = null) => {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, value);
  };

  const removeMedia = async (mediaId) => {
    await toggleJournalMedia(date, mediaId);
    setEntry(prev => {
      const updated = { ...prev, media: prev.media.filter(m => m.id !== mediaId) };
      entryRef.current = updated;
      return updated;
    });
    onStatsChange?.();
  };

  if (!entry) return null;

  return (
    <div className="journal-page-backdrop" onClick={handleClose}>
      <div className="journal-page" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="journal-page-header">
          <span className="journal-page-date">{fmtDate(date)}</span>
          <div className="journal-header-actions">
            <button className="journal-delete-btn" onClick={handleDelete} title="Delete entry">🗑</button>
            <button className="overlay-close" onClick={handleClose} aria-label="Close">×</button>
          </div>
        </div>

        {/* ── Two-column body ── */}
        <div className="journal-page-body">

          {/* Left 65%: images */}
          <div className="journal-images">
            {entry.media.length === 0 ? (
              <p className="journal-empty-hint">
                Open a photo and click the journal icon <span className="journal-inline-icon">📖</span> to add it here.
              </p>
            ) : (
              <div className="journal-collage">
                {entry.media.map(m => (
                  <div key={m.id} className="journal-collage-item">
                    <img src={thumbUrl(m.id)} alt={m.filename} loading="lazy" />
                    <button
                      className="journal-remove-btn"
                      onClick={() => removeMedia(m.id)}
                      aria-label="Remove from journal"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right 35%: text */}
          <div className="journal-text-panel">
            <input
              className="journal-title-input"
              placeholder="Title…"
              value={title}
              onChange={e => { setTitle(e.target.value); scheduleSave(); }}
            />

            {/* Formatting toolbar */}
            <div className="journal-toolbar">
              <button className="journal-tool-btn bold"
                onMouseDown={e => { e.preventDefault(); exec("bold"); }}
                title="Bold">B</button>
              <button className="journal-tool-btn italic"
                onMouseDown={e => { e.preventDefault(); exec("italic"); }}
                title="Italic">I</button>
              <button className="journal-tool-btn underline"
                onMouseDown={e => { e.preventDefault(); exec("underline"); }}
                title="Underline">U</button>
              <div className="journal-tool-sep" />
              <div className="journal-color-swatches">
                {COLORS.map(c => (
                  <button
                    key={c}
                    className={`journal-swatch${color === c ? " active" : ""}`}
                    style={{ background: c }}
                    onMouseDown={e => {
                      e.preventDefault();
                      setColor(c);
                      exec("foreColor", c);
                      scheduleSave();
                    }}
                    title={c}
                  />
                ))}
              </div>
              <div className="journal-tool-sep" />
              <button className="journal-tool-btn"
                onMouseDown={e => { e.preventDefault(); exec("removeFormat"); }}
                title="Clear formatting">✕</button>
            </div>

            {/* Editable body */}
            <div
              ref={bodyRef}
              className="journal-body"
              contentEditable
              suppressContentEditableWarning
              onInput={scheduleSave}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
