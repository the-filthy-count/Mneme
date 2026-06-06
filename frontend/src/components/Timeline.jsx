import { useCallback, useMemo, useRef, useState, useEffect } from "react";

// Continuous timeline: a monthly histogram with two draggable handles that
// define the active [start, end] window. Emits the selected range upward.

const fmt = (d) =>
  d.toLocaleDateString(undefined, { year: "numeric", month: "short" });

// Format a Date as a naive "YYYY-MM-DDTHH:mm:ss" using its LOCAL components,
// matching how the backend stores/compares taken_at. Avoids the UTC shift from
// toISOString(), which would push boundary items out of the selected range.
const toNaive = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
};

export default function Timeline({ histogram, minDate, maxDate, onChange }) {
  const trackRef = useRef(null);
  const [range, setRange] = useState([0, 1]); // fractional [start, end]
  const dragging = useRef(null);

  const min = minDate ? new Date(minDate).getTime() : null;
  const max = maxDate ? new Date(maxDate).getTime() : null;
  const span = min != null && max != null ? Math.max(max - min, 1) : 1;

  const maxCount = useMemo(
    () => histogram.reduce((m, b) => Math.max(m, b.count), 1),
    [histogram]
  );

  const fracToDate = useCallback(
    (f) => (min == null ? null : new Date(min + f * span)),
    [min, span]
  );

  // Push range changes (as ISO datetimes) to the parent.
  useEffect(() => {
    if (min == null) return;
    const startD = fracToDate(range[0]);
    const endD = fracToDate(range[1]);
    onChange({
      start: startD ? toNaive(startD) : null,
      end: endD ? toNaive(endD) : null,
    });
  }, [range, min, fracToDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerMove = useCallback((e) => {
    if (!dragging.current || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setRange((prev) => {
      const next = [...prev];
      if (dragging.current === "start") next[0] = Math.min(f, prev[1] - 0.01);
      else next[1] = Math.max(f, prev[0] + 0.01);
      return next;
    });
  }, []);

  const stopDrag = useCallback(() => {
    dragging.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
  }, [onPointerMove]);

  const startDrag = (handle) => (e) => {
    e.preventDefault();
    dragging.current = handle;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
  };

  if (min == null || max == null) {
    return (
      <div className="timeline empty">
        No dated memories yet — run a scan to populate the timeline.
      </div>
    );
  }

  const startD = fracToDate(range[0]);
  const endD = fracToDate(range[1]);

  return (
    <div className="timeline">
      <div className="timeline-labels">
        <span>{startD && fmt(startD)}</span>
        <span
          className="timeline-title timeline-help"
          title="Drag the handles to filter by date range. Click a map marker to browse photos from that location. Click a place in the sidebar to fly there."
        >timeline</span>
        <span>{endD && fmt(endD)}</span>
      </div>
      <div className="timeline-track" ref={trackRef}>
        <div className="histogram">
          {histogram.map((b, i) => {
            const t = new Date(b.start).getTime();
            const f = (t - min) / span;
            const active = f >= range[0] && f <= range[1];
            return (
              <div
                key={i}
                className={`bar ${active ? "active" : ""}`}
                style={{
                  left: `${f * 100}%`,
                  height: `${(b.count / maxCount) * 100}%`,
                }}
                title={`${fmt(new Date(b.start))}: ${b.count}`}
              />
            );
          })}
        </div>
        <div
          className="selection"
          style={{
            left: `${range[0] * 100}%`,
            width: `${(range[1] - range[0]) * 100}%`,
          }}
        />
        <div
          className="handle"
          style={{ left: `${range[0] * 100}%` }}
          onPointerDown={startDrag("start")}
        />
        <div
          className="handle"
          style={{ left: `${range[1] * 100}%` }}
          onPointerDown={startDrag("end")}
        />
      </div>
    </div>
  );
}
