import { useEffect, useState } from "react";
import { faceThumbUrl } from "../api.js";

const IS_UNNAMED = /^person \d+$/i;

function PersonCard({ person, isFav, isFiltered, onToggleFilter, onToggleFav }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      className={`person-card${isFiltered ? " person-card-active" : ""}`}
      onClick={() => onToggleFilter(person.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={person.name}
    >
      <div className="person-avatar">
        {person.cover_thumb
          ? <img src={faceThumbUrl(person.cover_thumb)} alt={person.name} />
          : <div className="person-avatar-placeholder" />}
      </div>
      <span className="person-name">{person.name}</span>
      <span className="person-count">{person.face_count.toLocaleString()} faces</span>
      {(hovered || isFav) && (
        <button
          className={`person-fav-btn${isFav ? " person-fav-active" : ""}`}
          title={isFav ? "Remove from favourites" : "Add to favourites"}
          onClick={(e) => { e.stopPropagation(); onToggleFav(person.id); }}
        >★</button>
      )}
    </button>
  );
}

export default function PeoplePanel({ people, onClose, onFilterMap, personFilter }) {
  const [favourites, setFavourites] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("peopleFavourites") || "[]")); }
    catch { return new Set(); }
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleFav = (id) => {
    setFavourites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("peopleFavourites", JSON.stringify([...next]));
      return next;
    });
  };

  const toggleFilter = (id) => {
    onFilterMap(personFilter === id ? null : id);
  };

  const sorted = [...people].sort((a, b) => b.face_count - a.face_count);
  const favPeople    = sorted.filter(p => favourites.has(p.id));
  const namedPeople  = sorted.filter(p => !favourites.has(p.id) && !IS_UNNAMED.test(p.name));
  const otherPeople  = sorted.filter(p => !favourites.has(p.id) &&  IS_UNNAMED.test(p.name));

  const cardProps = (p) => ({
    person: p,
    isFav: favourites.has(p.id),
    isFiltered: personFilter === p.id,
    onToggleFilter: toggleFilter,
    onToggleFav: toggleFav,
  });

  const hasMultipleSections = (favPeople.length > 0 ? 1 : 0) + (namedPeople.length > 0 ? 1 : 0) + (otherPeople.length > 0 ? 1 : 0) > 1;

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="cluster-popup people-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cluster-popup-header">
          <div>
            <h2 className="cluster-popup-title">People</h2>
            <p className="cluster-popup-sub">{people.length} people identified{personFilter != null ? " · filtered" : ""}</p>
          </div>
          <button className="overlay-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="cluster-popup-scroll">
          {people.length === 0 ? (
            <p className="cluster-popup-loading">No people found yet. Scan faces to get started.</p>
          ) : (
            <>
              {favPeople.length > 0 && (
                <section className="people-section">
                  {hasMultipleSections && <h3 className="people-section-label">Favourites</h3>}
                  <div className="people-grid">
                    {favPeople.map(p => <PersonCard key={p.id} {...cardProps(p)} />)}
                  </div>
                </section>
              )}
              {namedPeople.length > 0 && (
                <section className="people-section">
                  {hasMultipleSections && <h3 className="people-section-label">Named</h3>}
                  <div className="people-grid">
                    {namedPeople.map(p => <PersonCard key={p.id} {...cardProps(p)} />)}
                  </div>
                </section>
              )}
              {otherPeople.length > 0 && (
                <section className="people-section">
                  {hasMultipleSections && <h3 className="people-section-label">Everyone else</h3>}
                  <div className="people-grid">
                    {otherPeople.map(p => <PersonCard key={p.id} {...cardProps(p)} />)}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
