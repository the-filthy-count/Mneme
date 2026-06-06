import { useState } from "react";
import DatePicker from "./DatePicker.jsx";

const countryFlag = (code) => {
  if (!code || code.length !== 2) return "";
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
};

function PlacesByCountry({ places, onFlyToPlace }) {
  const [expanded, setExpanded] = useState({});

  // Group by country (or "Unknown" if null)
  const groups = [];
  const seen = new Map();
  for (const p of places) {
    const key = p.country || "Unknown";
    if (!seen.has(key)) {
      seen.set(key, { country: key, country_code: p.country_code, total: 0, places: [] });
      groups.push(seen.get(key));
    }
    const g = seen.get(key);
    g.total += p.count;
    g.places.push(p);
  }
  // Sort groups alphabetically by country name
  groups.sort((a, b) => a.country.localeCompare(b.country));

  const toggle = (key) => setExpanded((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="places">
      <h3>Places</h3>
      <ul className="country-list">
        {groups.map((g) => (
          <li key={g.country} className="country-group">
            <button className="country-row" onClick={() => toggle(g.country)}>
              <span className="country-chevron">{expanded[g.country] ? "▾" : "▸"}</span>
              {countryFlag(g.country_code) && <span className="country-flag">{countryFlag(g.country_code)}</span>}
              <span className="place-name">{g.country}</span>
              <span className="place-meta">{g.total.toLocaleString()}</span>
            </button>
            {expanded[g.country] && (
              <ul className="place-list">
                {g.places.map((p) => (
                  <li key={`${p.place}-${p.region}-${p.country_code}`}>
                    <button className="place-row" onClick={() => onFlyToPlace(p)}>
                      <span className="place-name">{p.place}</span>
                      <span className="place-meta">{p.count.toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const IconCamera = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

const IconVideo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);

const IconPano = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <ellipse cx="12" cy="12" rx="10" ry="4"/>
    <line x1="12" y1="2" x2="12" y2="22"/>
  </svg>
);

const IconMemories = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconNoLocation = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M10.72 10.72A9 9 0 0 0 3 10c0 7 9 13 9 13a24.8 24.8 0 0 0 5.34-4.23"/>
    <path d="M14.47 5.32A9 9 0 0 1 21 10c0 2.33-.8 4.46-2.1 6.12"/>
    <path d="M9.66 6.34a3 3 0 1 1 4 4"/>
  </svg>
);

const IconScan = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <polyline points="23 20 23 14 17 14"/>
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
  </svg>
);

const IconPeople = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconStar = ({ filled }) => (
  <svg width="13" height="13" viewBox="0 0 24 24"
       fill={filled ? "currentColor" : "none"}
       stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const IconJournalSidebar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);

export default function Sidebar({
  stats,
  scan,
  onScan,
  places,
  onFlyToPlace,
  onOpenSettings,
  dayFilter,
  onDayFilter,
  typeFilter,
  onTypeFilter,
  unlocatedCount,
  onOpenUnlocated,
  favouriteFilter,
  onToggleFavourite,
  tagFilter,
  onOpenTags,
  people,
  faceScan,
  personFilter,
  onOpenPeople,
  journalCount,
  onOpenJournal,
}) {
  const toggleType = (key) => {
    const next = typeFilter.includes(key)
      ? typeFilter.filter((t) => t !== key)
      : [...typeFilter, key];
    if (next.length === 0) return; // keep at least one
    onTypeFilter(next);
  };
  const scanning = scan?.state === "scanning";
  const pct =
    scan && scan.total ? Math.round((scan.processed / scan.total) * 100) : 0;
  const faceScanning = faceScan?.state === "scanning" || faceScan?.state === "clustering";
  const facePct = faceScan?.total ? Math.round((faceScan.processed / faceScan.total) * 100) : null;

  const minDay = stats?.min_date ? stats.min_date.slice(0, 10) : undefined;
  const maxDay = stats?.max_date ? stats.max_date.slice(0, 10) : undefined;

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="sidebar-wordmark" src="/logo2.webp" alt="Mneme" />
        <p className="tagline">your life, remembered</p>
      </div>

      <div className="actions">
        <button className="scan-btn" onClick={onScan} disabled={scanning} title={scanning ? `Scanning… ${pct}%` : "Scan library"}>
          <span className={`scan-btn-icon${scanning ? " spinning" : ""}`}><IconScan /></span>
          {scanning && <span className="scan-pct">{pct}%</span>}
        </button>
        <button className="icon-btn" onClick={() => onOpenSettings()} title="Settings" aria-label="Settings">
          ☰
        </button>
      </div>

      {scanning && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
      )}
      {scan?.state === "done" && (
        <p className="scan-note">
          Indexed {scan.added} new · {scan.updated} updated
          {scan.removed ? ` · ${scan.removed} removed` : ""}
        </p>
      )}
      {scan?.state === "error" && (
        <p className="scan-note error">Scan failed: {scan.message}</p>
      )}

      {stats && (
        <dl className="stats">
          <div><dt><IconMemories /> Memories</dt><dd>{stats.geotagged_filtered.toLocaleString()}</dd></div>
          <div
            className="stats-row-link"
            onClick={onOpenJournal}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onOpenJournal?.()}
            title="Browse journal entries"
          ><dt><IconJournalSidebar /> Journal</dt><dd>{(journalCount || 0).toLocaleString()}</dd></div>
          {(faceScanning || (people && people.length > 0)) && (
            <div
              className={`${people?.length > 0 ? "stats-row-link" : ""}${personFilter != null ? " people-active" : ""}`}
              onClick={people?.length > 0 ? onOpenPeople : undefined}
              role={people?.length > 0 ? "button" : undefined}
              tabIndex={people?.length > 0 ? 0 : undefined}
              onKeyDown={people?.length > 0 ? (e) => e.key === "Enter" && onOpenPeople() : undefined}
            >
              <dt>
                <IconPeople /> People
                {faceScanning && (
                  <span className="face-scan-pct">
                    {faceScan.state === "clustering" ? " clustering…" : facePct != null ? ` ${facePct}%` : "…"}
                  </span>
                )}
              </dt>
              <dd>
                {people?.length > 0 ? people.length.toLocaleString() : "…"}
                {personFilter != null && <span className="people-filter-badge">filtered</span>}
              </dd>
            </div>
          )}
          <div
            className={`stats-row-link stats-type-row${typeFilter.includes("image") ? " type-active" : " type-dim"}`}
            onClick={() => toggleType("image")}
            role="button"
            tabIndex={0}
            aria-pressed={typeFilter.includes("image")}
            onKeyDown={(e) => e.key === "Enter" && toggleType("image")}
          ><dt><IconCamera /> Photos</dt><dd>{stats.images.toLocaleString()}</dd></div>
          <div
            className={`stats-row-link stats-type-row${typeFilter.includes("video") ? " type-active" : " type-dim"}`}
            onClick={() => toggleType("video")}
            role="button"
            tabIndex={0}
            aria-pressed={typeFilter.includes("video")}
            onKeyDown={(e) => e.key === "Enter" && toggleType("video")}
          ><dt><IconVideo /> Videos</dt><dd>{stats.videos.toLocaleString()}</dd></div>
          {stats.panos > 0 && (
            <div
              className={`stats-row-link stats-type-row${typeFilter.includes("pano") ? " type-active" : " type-dim"}`}
              onClick={() => toggleType("pano")}
              role="button"
              tabIndex={0}
              aria-pressed={typeFilter.includes("pano")}
              onKeyDown={(e) => e.key === "Enter" && toggleType("pano")}
            ><dt><IconPano /> 360°</dt><dd>{stats.panos.toLocaleString()}</dd></div>
          )}
          {stats.favourites > 0 && (
            <div
              className={`stats-row-link stats-fav-row${favouriteFilter ? " fav-active" : ""}`}
              onClick={onToggleFavourite}
              role="button"
              tabIndex={0}
              aria-pressed={favouriteFilter}
              onKeyDown={(e) => e.key === "Enter" && onToggleFavourite()}
            ><dt><IconStar filled={favouriteFilter} /> favourites</dt><dd>{stats.favourites.toLocaleString()}</dd></div>
          )}
          {stats.tag_count > 0 && (
            <div
              className={`stats-row-link stats-tag-row${tagFilter.length > 0 ? " tag-active" : ""}`}
              onClick={onOpenTags}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onOpenTags()}
            ><dt># tags</dt><dd>{stats.tag_count.toLocaleString()}</dd></div>
          )}
        </dl>
      )}

      {places?.length > 0 && (
        <PlacesByCountry places={places} onFlyToPlace={onFlyToPlace} />
      )}

      <div className="datefilter">
        <h3>Jump to a date</h3>
        <DatePicker
          value={dayFilter}
          min={minDay}
          max={maxDay}
          onChange={onDayFilter}
        />
        {dayFilter && <p className="datefilter-note">Showing {dayFilter}</p>}
      </div>

      <div className="sidebar-logo">
        <img src="/logo1.webp" alt="Mneme" />
      </div>
    </aside>
  );
}
