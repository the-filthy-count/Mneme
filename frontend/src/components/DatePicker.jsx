import { useEffect, useRef, useState } from "react";

const MONTHS = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];
const DOWS = ["m","t","w","t","f","s","s"];

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDow(y, m) { return (new Date(y, m, 1).getDay() + 6) % 7; } // Mon=0

export default function DatePicker({ value, min, max, onChange }) {
  const today = new Date();
  const parsed = value ? new Date(value + "T00:00:00") : null;

  const [open, setOpen] = useState(false);
  const [vy, setVy] = useState((parsed || today).getFullYear());
  const [vm, setVm] = useState((parsed || today).getMonth());
  const ref = useRef(null);

  // Sync view to selected value when it changes externally.
  useEffect(() => {
    if (parsed) { setVy(parsed.getFullYear()); setVm(parsed.getMonth()); }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key  = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [open]);

  const prevMonth = () => vm === 0 ? (setVm(11), setVy(y => y - 1)) : setVm(m => m - 1);
  const nextMonth = () => vm === 11 ? (setVm(0), setVy(y => y + 1)) : setVm(m => m + 1);

  const pick = (day) => {
    const d = `${vy}-${String(vm + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    onChange(d);
    setOpen(false);
  };

  const minDate = min ? new Date(min + "T00:00:00") : null;
  const maxDate = max ? new Date(max + "T00:00:00") : null;
  const disabled = (day) => {
    const d = new Date(vy, vm, day);
    return (minDate && d < minDate) || (maxDate && d > maxDate);
  };

  const isSel   = (day) => parsed && parsed.getFullYear() === vy && parsed.getMonth() === vm && parsed.getDate() === day;
  const isToday = (day) => today.getFullYear() === vy && today.getMonth() === vm && today.getDate() === day;

  const label = parsed
    ? parsed.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : null;

  const blanks = firstDow(vy, vm);
  const days   = daysInMonth(vy, vm);

  return (
    <div className="datepicker" ref={ref}>
      <button
        type="button"
        className={`datepicker-input${open ? " open" : ""}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className={label ? "" : "dp-placeholder"}>{label || "dd / mm / yyyy"}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8"  y1="2" x2="8"  y2="6"/>
          <line x1="3"  y1="10" x2="21" y2="10"/>
        </svg>
      </button>

      {open && (
        <div className="datepicker-popup">
          <div className="dp-header">
            <button type="button" className="dp-nav" onClick={prevMonth}>‹</button>
            <span className="dp-month">{MONTHS[vm]} {vy}</span>
            <button type="button" className="dp-nav" onClick={nextMonth}>›</button>
          </div>
          <div className="dp-grid">
            {DOWS.map((d, i) => <div key={i} className="dp-dow">{d}</div>)}
            {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const dis = disabled(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={`dp-day${isSel(day) ? " sel" : ""}${isToday(day) ? " tod" : ""}${dis ? " dis" : ""}`}
                  onClick={() => !dis && pick(day)}
                  disabled={dis}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {value && (
            <div className="dp-footer">
              <button type="button" className="dp-clear" onClick={() => { onChange(null); setOpen(false); }}>
                clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
