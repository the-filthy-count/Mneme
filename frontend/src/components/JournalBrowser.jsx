import { useEffect, useState } from "react";
import { fetchJournalDays, fetchJournalEntryMonths, fetchJournalEntryYears, fetchJournalYears } from "../api.js";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export default function JournalBrowser({ onSelectDate, onClose }) {
  const [view, setView]               = useState("years");
  const [yearRange, setYearRange]     = useState(null);
  const [selectedYear, setSelectedYear]   = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [days, setDays]               = useState([]);
  const [entryYears, setEntryYears]   = useState(new Set());
  const [entryMonths, setEntryMonths] = useState(new Set());

  useEffect(() => {
    fetchJournalYears().then(setYearRange).catch(() => {});
    fetchJournalEntryYears().then(ys => setEntryYears(new Set(ys))).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedYear) {
      fetchJournalEntryMonths(selectedYear).then(ms => setEntryMonths(new Set(ms))).catch(() => {});
    }
  }, [selectedYear]);

  useEffect(() => {
    if (selectedYear && selectedMonth) {
      fetchJournalDays(selectedYear, selectedMonth).then(setDays).catch(() => {});
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (view !== "years") back();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, onClose]);

  const yearList = yearRange
    ? Array.from({ length: yearRange.max_year - yearRange.min_year + 1 }, (_, i) => yearRange.max_year - i)
    : [];

  // Build calendar grid (Monday-first)
  const calCells = () => {
    if (!days.length) return [];
    const firstDow = new Date(selectedYear, selectedMonth - 1, 1).getDay(); // 0=Sun
    const offset = (firstDow + 6) % 7; // shift so Mon=0
    const total = Math.ceil((offset + days.length) / 7) * 7;
    const cells = [];
    for (let i = 0; i < total; i++) {
      const n = i - offset + 1;
      cells.push(n >= 1 && n <= days.length ? days[n - 1] : null);
    }
    return cells;
  };

  const back = () => {
    if (view === "days")   setView("months");
    if (view === "months") setView("years");
  };

  const title =
    view === "years"  ? "Journal" :
    view === "months" ? String(selectedYear) :
    `${MONTHS[selectedMonth - 1]} ${selectedYear}`;

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="journal-browser" onClick={e => e.stopPropagation()}>
        <div className="journal-browser-header">
          <div className="journal-browser-nav">
            {view !== "years" && (
              <button className="back-crumb" onClick={back}>&lt; back</button>
            )}
            <h2 className="journal-browser-title">{title}</h2>
          </div>
          <button className="overlay-close" onClick={onClose}>×</button>
        </div>

        {view === "years" && (
          <div className="journal-year-grid">
            {yearList.map(y => (
              <button
                key={y}
                className={`journal-year-card${entryYears.has(y) ? " has-entry" : ""}`}
                onClick={() => { setSelectedYear(y); setView("months"); }}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {view === "months" && (
          <div className="journal-month-grid">
            {MONTHS.map((m, i) => (
              <button
                key={i}
                className={`journal-month-card${entryMonths.has(i + 1) ? " has-entry" : ""}`}
                onClick={() => { setSelectedMonth(i + 1); setView("days"); }}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {view === "days" && (
          <div className="journal-calendar">
            <div className="journal-cal-dow">
              {DOW.map(d => <div key={d} className="journal-cal-dow-cell">{d}</div>)}
            </div>
            <div className="journal-cal-grid">
              {calCells().map((day, i) =>
                day === null ? (
                  <div key={i} className="journal-cal-cell empty" />
                ) : (
                  <button
                    key={i}
                    className={[
                      "journal-cal-cell",
                      day.media_count === 0 ? "no-media" : "",
                      day.has_entry ? "has-entry" : "",
                    ].filter(Boolean).join(" ")}
                    disabled={day.media_count === 0}
                    onClick={() => onSelectDate(day.date)}
                  >
                    <span className="journal-cal-num">{day.day}</span>
                    {day.media_count > 0 && (
                      <span className="journal-cal-count">{day.media_count}</span>
                    )}
                    {day.has_entry && <span className="journal-cal-dot" />}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
