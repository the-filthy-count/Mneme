import { useCallback, useEffect, useRef, useState } from "react";
import MapView from "./components/MapView.jsx";
import Timeline from "./components/Timeline.jsx";
import ClusterPopup from "./components/ClusterPopup.jsx";
import PhotoCarousel from "./components/PhotoCarousel.jsx";
import Sidebar from "./components/Sidebar.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import TagPopup from "./components/TagPopup.jsx";
import PeoplePanel from "./components/PeoplePanel.jsx";
import JournalBrowser from "./components/JournalBrowser.jsx";
import JournalPage from "./components/JournalPage.jsx";
import {
  autoPlace,
  fetchClusters,
  fetchAlbumMedia,
  fetchStats,
  fetchPlaces,
  fetchScanStatus,
  fetchMapStyles,
  fetchSettings,
  fetchTags,
  fetchUnlocated,
  geocodePoint,
  geocodeSearch,
  locateMedia,
  patchMedia,
  relocateMedia,
  removeAlbumLocation,
  setAlbumFavourite,
  triggerScan,
  fetchPeople,
  fetchFaceScanStatus,
  fetchJournalStats,
} from "./api.js";

export default function App() {
  const [stats, setStats] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [places, setPlaces] = useState([]);
  const [range, setRange] = useState({ start: null, end: null });
  const [activeCluster, setActiveCluster] = useState(null);
  const [carousel, setCarousel] = useState(null); // { items, index }
  const [unlocatedGroups, setUnlocatedGroups] = useState(null);
  const [placementGroup, setPlacementGroup] = useState(null); // group being placed { date, label, count, isReposition }
  const [pendingPin, setPendingPin] = useState(null);          // { lat, lon, preview }
  const [scan, setScan] = useState(null);
  const [mapStyles, setMapStyles] = useState([]);
  const [settings, setSettings] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState("settings");
  const [flyTo, setFlyTo] = useState(null);
  const [layerVisibility, setLayerVisibility] = useState({});
  const [colorOverrides, setColorOverrides] = useState({});
  const [dayFilter, setDayFilter] = useState(null);
  const [typeFilter, setTypeFilter] = useState(["image", "video", "pano"]);
  const [view, setView] = useState({ zoom: 2, bounds: null });
  const [locationSearch, setLocationSearch] = useState("");
  const [locationResults, setLocationResults] = useState([]);
  const [unlocatedTypeFilter, setUnlocatedTypeFilter] = useState(["image", "video", "pano"]);
  const [unlocatedSuggestedOnly, setUnlocatedSuggestedOnly] = useState(false);
  const [favouriteFilter, setFavouriteFilter] = useState(false);
  const [tagFilter, setTagFilter] = useState([]);
  const [tagPopupOpen, setTagPopupOpen] = useState(false);
  const [allTags, setAllTags] = useState([]);
  const [people, setPeople] = useState([]);
  const [faceScan, setFaceScan] = useState(null);
  const [personFilter, setPersonFilter] = useState(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [journalCount, setJournalCount] = useState(0);
  const [journalBrowserOpen, setJournalBrowserOpen] = useState(false);
  const [journalDate, setJournalDate] = useState(null);
  const pollRef = useRef(null);
  const facePollRef = useRef(null);
  const flyKey = useRef(0);
  const viewTimer = useRef(null);
  const searchTimer = useRef(null);

  const effStart = dayFilter ? `${dayFilter}T00:00:00` : range.start;
  const effEnd = dayFilter ? `${dayFilter}T23:59:59` : range.end;

  const loadStats = useCallback(() => {
    fetchStats({ start: effStart, end: effEnd, types: typeFilter, favourite: favouriteFilter, tags: tagFilter })
      .then(setStats).catch(() => {});
    fetchPlaces().then(setPlaces).catch(() => {});
  }, [effStart, effEnd, typeFilter, favouriteFilter, tagFilter]);

  const loadUnlocated = useCallback(() => {
    fetchUnlocated().then(setUnlocatedGroups).catch(() => {});
  }, []);

  const loadPeople = useCallback(() => {
    fetchPeople().then(setPeople).catch(() => {});
  }, []);

  const loadJournalStats = useCallback(() => {
    fetchJournalStats().then(d => setJournalCount(d.total_entries)).catch(() => {});
  }, []);

  const startFacePoll = useCallback(() => {
    if (facePollRef.current) clearInterval(facePollRef.current);
    facePollRef.current = setInterval(async () => {
      const s = await fetchFaceScanStatus().catch(() => null);
      if (!s) return;
      setFaceScan(s);
      if (s.state !== "scanning" && s.state !== "clustering") {
        clearInterval(facePollRef.current);
        facePollRef.current = null;
        if (s.state === "done") loadPeople();
      }
    }, 1500);
  }, [loadPeople]);

  useEffect(() => {
    fetchMapStyles().then(setMapStyles).catch(() => {});
    fetchSettings().then((s) => { setSettings(s); setColorOverrides(s?.color_overrides || {}); }).catch(() => {});
    loadStats();
    loadUnlocated();
    loadPeople();
    loadJournalStats();
    // Re-attach to any scan already running in the backend (e.g. after page reload).
    fetchScanStatus().then((status) => {
      setScan(status);
      if (status.state === "scanning") {
        pollRef.current = setInterval(async () => {
          const s = await fetchScanStatus();
          setScan(s);
          if (s.state !== "scanning") {
            clearInterval(pollRef.current);
            pollRef.current = null;
            refreshAll();
            startFacePoll();
          }
        }, 1000);
      }
    }).catch(() => {});
    // Re-attach to any face scan running.
    fetchFaceScanStatus().then((s) => {
      setFaceScan(s);
      if (s.state === "scanning" || s.state === "clustering") startFacePoll();
    }).catch(() => {});
  }, [loadStats, loadUnlocated, loadPeople, loadJournalStats, startFacePoll]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => facePollRef.current && clearInterval(facePollRef.current), []);

  useEffect(() => {
    fetchClusters({ start: effStart, end: effEnd, zoom: view.zoom, ...view.bounds, types: typeFilter, favourite: favouriteFilter, tags: tagFilter, personId: personFilter })
      .then(setClusters)
      .catch(() => setClusters([]));
  }, [effStart, effEnd, view, typeFilter, favouriteFilter, tagFilter, personFilter]);

  const refreshAll = useCallback(() => {
    loadStats();
    loadUnlocated();
    fetchClusters({ start: effStart, end: effEnd, zoom: view.zoom, ...view.bounds, types: typeFilter, favourite: favouriteFilter, tags: tagFilter, personId: personFilter })
      .then(setClusters).catch(() => {});
  }, [loadStats, loadUnlocated, effStart, effEnd, view, typeFilter, favouriteFilter, tagFilter, personFilter]);

  const onViewChange = useCallback((zoom, bounds) => {
    clearTimeout(viewTimer.current);
    viewTimer.current = setTimeout(() => setView({ zoom, bounds }), 250);
  }, []);

  const onScan = useCallback(async () => {
    try {
      const s = await triggerScan();
      setScan(s);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const status = await fetchScanStatus();
        setScan(status);
        if (status.state !== "scanning") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          refreshAll();
          startFacePoll();
        }
      }, 1000);
    } catch (e) {
      setScan({ state: "error", message: String(e) });
    }
  }, [refreshAll, startFacePoll]);

  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), []);

  const onSettingsSaved = useCallback(
    (saved, rescan) => {
      setSettings(saved);
      setColorOverrides(saved?.color_overrides || {});
      if (rescan) onScan();
    },
    [onScan]
  );

  const onFlyToPlace = useCallback((p) => {
    flyKey.current += 1;
    setFlyTo({ lat: p.lat, lon: p.lon, zoom: 11, key: flyKey.current });
  }, []);

  const onStartPlacement = useCallback((group, suggestion = null) => {
    setSettingsOpen(false);
    setPlacementGroup(group);
    setLocationSearch("");
    setLocationResults([]);
    if (suggestion) {
      setPendingPin({ lat: suggestion.lat, lon: suggestion.lon, preview: suggestion });
      flyKey.current += 1;
      setFlyTo({ lat: suggestion.lat, lon: suggestion.lon, zoom: 11, key: flyKey.current });
    } else {
      setPendingPin(null);
    }
  }, []);

  const onMapClick = useCallback(async (lat, lon) => {
    if (!placementGroup) return;
    const preview = await geocodePoint(lat, lon).catch(() => null);
    setPendingPin({ lat, lon, preview });
  }, [placementGroup]);

  const onConfirmPlace = useCallback(async () => {
    if (!placementGroup || !pendingPin) return;
    try {
      if (placementGroup.mediaId) {
        await patchMedia(placementGroup.mediaId, { lat: pendingPin.lat, lon: pendingPin.lon });
      } else if (placementGroup.isReposition) {
        await relocateMedia(placementGroup.date, pendingPin.lat, pendingPin.lon);
      } else {
        await locateMedia(placementGroup.date, pendingPin.lat, pendingPin.lon);
      }
      setPlacementGroup(null);
      setPendingPin(null);
      setLocationSearch("");
      setLocationResults([]);
      refreshAll();
      if (!placementGroup.isReposition && !placementGroup.mediaId) {
        // Return to the panel so the user can work through the list sequentially.
        const remaining = await fetchUnlocated().catch(() => null);
        if (remaining !== null) {
          setUnlocatedGroups(remaining);
          if (remaining.length > 0) setUnlocatedOpen(true);
        }
      }
    } catch {
      // keep pin so user can retry
    }
  }, [placementGroup, pendingPin, refreshAll]);

  const onStartReposition = useCallback((album) => {
    setActiveCluster(null);
    setPlacementGroup({ date: album.album_key, label: album.custom_label || album.label, count: album.count, isReposition: true });
    setPendingPin(null);
    setLocationSearch("");
    setLocationResults([]);
  }, []);

  const onStartRepositionMedia = useCallback((mediaItem) => {
    setActiveCluster(null);
    setCarousel(null);
    const date = mediaItem.taken_at?.slice(0, 10) || "no-date";
    setPlacementGroup({ date, label: mediaItem.filename || "photo", count: 1, isReposition: true, mediaId: mediaItem.id });
    setPendingPin(null);
    setLocationSearch("");
    setLocationResults([]);
  }, []);

  const onRemoveLocation = useCallback(async (album) => {
    try {
      await removeAlbumLocation(album.album_key);
      refreshAll();
    } catch { /* ignore */ }
  }, [refreshAll]);

  const onAutoPlace = useCallback(async () => {
    await autoPlace().catch(() => {});
    refreshAll();
    const remaining = await fetchUnlocated().catch(() => null);
    if (remaining !== null) setUnlocatedGroups(remaining);
  }, [refreshAll]);

  const onCancelPlacement = useCallback(() => {
    setPlacementGroup(null);
    setPendingPin(null);
    setLocationSearch("");
    setLocationResults([]);
  }, []);

  const onLocationSearch = useCallback((q) => {
    setLocationSearch(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setLocationResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const results = await geocodeSearch(q).catch(() => []);
      setLocationResults(results);
    }, 400);
  }, []);

  const onPickSearchResult = useCallback(async (result) => {
    setLocationResults([]);
    setLocationSearch("");
    const preview = await geocodePoint(result.lat, result.lon).catch(() => null);
    setPendingPin({ lat: result.lat, lon: result.lon, preview });
    flyKey.current += 1;
    setFlyTo({ lat: result.lat, lon: result.lon, zoom: 11, key: flyKey.current });
  }, []);

  const onAlbumSelect = useCallback(async (album, cluster) => {
    try {
      const items = await fetchAlbumMedia(cluster.cluster_key, album.album_key, { types: typeFilter, favourite: favouriteFilter, tags: tagFilter, personId: personFilter });
      setCarousel({ items, index: 0, hasBack: true });
    } catch {
      // ignore
    }
  }, [typeFilter, favouriteFilter, tagFilter, personFilter]);

  const onItemUpdated = useCallback((updated) => {
    setCarousel((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((it) => (it.id === updated.id ? updated : it)),
      };
    });
    loadStats();
  }, [loadStats]);

  const onAlbumFavourite = useCallback(async (clusterKey, albumKey, fav) => {
    await setAlbumFavourite(clusterKey, albumKey, fav).catch(() => {});
    loadStats();
  }, [loadStats]);

  const onOpenTags = useCallback(async () => {
    const tags = await fetchTags().catch(() => []);
    setAllTags(tags);
    setTagPopupOpen(true);
  }, []);

  const currentStyle =
    mapStyles.find((s) => s.id === settings?.map_style) || mapStyles[0] || null;

  return (
    <div className="app">
      <Sidebar
        stats={stats}
        scan={scan}
        onScan={onScan}
        places={places}
        onFlyToPlace={onFlyToPlace}
        onOpenSettings={(tab = "about") => { setSettingsInitialTab(tab); setSettingsOpen(true); }}
        dayFilter={dayFilter}
        onDayFilter={setDayFilter}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        unlocatedCount={unlocatedGroups?.reduce((s, g) => s + g.count, 0) ?? 0}
        onOpenUnlocated={() => { setSettingsInitialTab("unlocated"); setSettingsOpen(true); }}
        favouriteFilter={favouriteFilter}
        onToggleFavourite={() => setFavouriteFilter((f) => !f)}
        tagFilter={tagFilter}
        onOpenTags={onOpenTags}
        people={people}
        faceScan={faceScan}
        personFilter={personFilter}
        onOpenPeople={() => setPeopleOpen(true)}
        journalCount={journalCount}
        onOpenJournal={() => setJournalBrowserOpen(true)}
      />
      <main className="stage">
        {placementGroup && (
          <div className="placement-banner">
            <div className="placement-banner-top">
              <span className="placement-label">
                placing <strong>{placementGroup.label}</strong>
                {" "}({placementGroup.count} item{placementGroup.count !== 1 ? "s" : ""})
              </span>
              <div className="placement-search-wrap">
                <input
                  className="placement-search"
                  type="text"
                  placeholder="search for a location…"
                  value={locationSearch}
                  onChange={(e) => onLocationSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && (setLocationSearch(""), setLocationResults([]))}
                />
                {locationResults.length > 0 && (
                  <div className="placement-search-results">
                    {locationResults.map((r, i) => (
                      <button key={i} className="placement-search-result" onClick={() => onPickSearchResult(r)}>
                        {r.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="mini-btn" onClick={onCancelPlacement}>cancel</button>
            </div>
            {pendingPin ? (
              <div className="placement-preview">
                <span>{[pendingPin.preview?.place, pendingPin.preview?.country]
                  .filter(Boolean).join(", ") || `${pendingPin.lat.toFixed(4)}, ${pendingPin.lon.toFixed(4)}`}
                </span>
                <button className="scan-btn inline" onClick={onConfirmPlace}>confirm</button>
                <button className="mini-btn" onClick={() => setPendingPin(null)}>move pin</button>
              </div>
            ) : (
              <span className="placement-hint">click the map to drop a pin, or search above</span>
            )}
          </div>
        )}
        <MapView
          clusters={clusters}
          onClusterClick={placementGroup ? undefined : setActiveCluster}
          mapStyle={currentStyle}
          layerVisibility={layerVisibility}
          colorOverrides={colorOverrides}
          flyTo={flyTo}
          onViewChange={onViewChange}
          placementMode={!!placementGroup}
          onMapClick={placementGroup ? onMapClick : undefined}
          pendingPin={pendingPin}
        />
        <Timeline
          histogram={stats?.histogram || []}
          minDate={stats?.min_date}
          maxDate={stats?.max_date}
          onChange={setRange}
        />
      </main>

      <ClusterPopup
        cluster={carousel ? null : activeCluster}
        types={typeFilter}
        favourite={favouriteFilter}
        tags={tagFilter}
        personId={personFilter}
        onAlbumSelect={(album) => onAlbumSelect(album, activeCluster)}
        onAlbumFavourite={onAlbumFavourite}
        onStartReposition={onStartReposition}
        onRemoveLocation={onRemoveLocation}
        onClose={() => setActiveCluster(null)}
      />

      {carousel && (
        <PhotoCarousel
          items={carousel.items}
          initialIndex={carousel.index}
          onClose={() => { setCarousel(null); setActiveCluster(null); }}
          onBack={carousel.hasBack ? () => setCarousel(null) : undefined}
          onItemUpdated={onItemUpdated}
          onOpenJournal={(date) => { setJournalDate(date); setJournalBrowserOpen(false); loadJournalStats(); }}
          onStartRepositionMedia={onStartRepositionMedia}
        />
      )}

      {tagPopupOpen && (
        <TagPopup
          tags={allTags}
          selected={tagFilter}
          onSelect={setTagFilter}
          onClose={() => setTagPopupOpen(false)}
        />
      )}

      {peopleOpen && (
        <PeoplePanel
          people={people}
          onClose={() => setPeopleOpen(false)}
          onFilterMap={(id) => setPersonFilter(id)}
          personFilter={personFilter}
        />
      )}

      {journalBrowserOpen && (
        <JournalBrowser
          onSelectDate={(date) => { setJournalDate(date); setJournalBrowserOpen(false); }}
          onClose={() => setJournalBrowserOpen(false)}
        />
      )}

      {journalDate && (
        <JournalPage
          date={journalDate}
          onClose={() => setJournalDate(null)}
          onStatsChange={loadJournalStats}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsInitialTab}
        onClose={() => setSettingsOpen(false)}
        mapStyles={mapStyles}
        settings={settings}
        onSaved={onSettingsSaved}
        layerVisibility={layerVisibility}
        onLayerVisibility={setLayerVisibility}
        colorOverrides={colorOverrides}
        onColorOverrides={setColorOverrides}
        onReset={() => { setScan(null); refreshAll(); }}
        people={people}
        faceScan={faceScan}
        onPeopleChanged={loadPeople}
        onPersonFilter={setPersonFilter}
        personFilter={personFilter}
        onStartFacePoll={startFacePoll}
        unlocatedGroups={unlocatedGroups || []}
        onUnlocatedPlace={onStartPlacement}
        onUnlocatedPreview={(items, index = 0) => setCarousel({ items, index })}
        unlocatedTypeFilter={unlocatedTypeFilter}
        onUnlocatedTypeFilter={setUnlocatedTypeFilter}
        unlocatedSuggestedOnly={unlocatedSuggestedOnly}
        onUnlocatedSuggestedOnly={setUnlocatedSuggestedOnly}
        onUnlocatedAutoPlace={onAutoPlace}
      />
    </div>
  );
}
