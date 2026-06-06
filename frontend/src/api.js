// Thin API client. All calls are relative so the same build works in dev
// (Vite proxy) and prod (nginx reverse proxy).

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchStats({ start, end, types, favourite, tags } = {}) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end)   params.set("end", end);
  if (types && types.length < 3) types.forEach((t) => params.append("types", t));
  if (favourite) params.set("favourite", "true");
  if (tags && tags.length > 0) tags.forEach((t) => params.append("tags", t));
  const qs = params.toString();
  return getJSON(`/api/stats${qs ? `?${qs}` : ""}`);
}

export function fetchMedia({ start, end, geotagged = true } = {}) {
  const params = new URLSearchParams();
  params.set("geotagged", geotagged ? "true" : "false");
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  return getJSON(`/api/media?${params.toString()}`);
}

export function fetchMediaDetail(id) {
  return getJSON(`/api/media/${id}`);
}

export async function triggerScan() {
  const res = await fetch("/api/scan", { method: "POST" });
  if (res.status === 409) return { state: "scanning", busy: true };
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchScanStatus() {
  return getJSON("/api/scan/status");
}

export async function resetIndex() {
  const res = await fetch("/api/scan/reset", { method: "POST" });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function fetchPlaces({ start, end } = {}) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  return getJSON(`/api/places${qs ? `?${qs}` : ""}`);
}

export function fetchMapStyles() {
  return getJSON("/api/map-styles");
}

export function fetchSettings() {
  return getJSON("/api/settings");
}

export async function saveSettings(body) {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function browseDir(path) {
  const qs = path ? `?path=${encodeURIComponent(path)}` : "";
  return getJSON(`/api/fs${qs}`);
}

export function fetchClusters({ start, end, zoom = 10, minLat, maxLat, minLon, maxLon, types, favourite, tags, personId } = {}) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end)   params.set("end", end);
  params.set("zoom", zoom);
  if (minLat != null) {
    params.set("min_lat", minLat);
    params.set("max_lat", maxLat);
    params.set("min_lon", minLon);
    params.set("max_lon", maxLon);
  }
  if (types && types.length < 3) types.forEach((t) => params.append("types", t));
  if (favourite) params.set("favourite", "true");
  if (tags && tags.length > 0) tags.forEach((t) => params.append("tags", t));
  if (personId != null) params.set("person_id", personId);
  return getJSON(`/api/clusters?${params.toString()}`);
}

export function fetchAlbums(clusterKey, { types, favourite, tags, personId } = {}) {
  const params = new URLSearchParams();
  if (types && types.length < 3) types.forEach((t) => params.append("types", t));
  if (favourite) params.set("favourite", "true");
  if (tags && tags.length > 0) tags.forEach((t) => params.append("tags", t));
  if (personId != null) params.set("person_id", personId);
  const qs = params.toString();
  return getJSON(`/api/clusters/${encodeURIComponent(clusterKey)}/albums${qs ? `?${qs}` : ""}`);
}

export function fetchAlbumMedia(clusterKey, albumKey, { types, favourite, tags, personId } = {}) {
  const params = new URLSearchParams();
  if (types && types.length < 3) types.forEach((t) => params.append("types", t));
  if (favourite) params.set("favourite", "true");
  if (tags && tags.length > 0) tags.forEach((t) => params.append("tags", t));
  if (personId != null) params.set("person_id", personId);
  const qs = params.toString();
  return getJSON(
    `/api/clusters/${encodeURIComponent(clusterKey)}/albums/${encodeURIComponent(albumKey)}/media${qs ? `?${qs}` : ""}`
  );
}

export function fetchTags() {
  return getJSON("/api/tags");
}

export async function setAlbumFavourite(clusterKey, albumKey, favourite) {
  const res = await fetch(
    `/api/clusters/${encodeURIComponent(clusterKey)}/albums/${encodeURIComponent(albumKey)}/favourite?favourite=${favourite}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function patchMedia(id, patch) {
  const res = await fetch(`/api/media/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchUnlocated() {
  return getJSON("/api/unlocated");
}

export async function autoPlace() {
  const res = await fetch("/api/unlocated/auto-place", { method: "POST" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchUnlocatedItems(date) {
  return getJSON(`/api/unlocated/${encodeURIComponent(date)}/items`);
}

export function fetchUnlocatedSuggestions(date) {
  return getJSON(`/api/unlocated/${encodeURIComponent(date)}/suggest`);
}

export function geocodePoint(lat, lon) {
  return getJSON(`/api/geocode?lat=${lat}&lon=${lon}`);
}

export function geocodeSearch(q) {
  return getJSON(`/api/geocode/search?q=${encodeURIComponent(q)}`);
}

export async function relocateMedia(date, lat, lon) {
  const res = await fetch("/api/relocate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, lat, lon }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function removeAlbumLocation(date) {
  const res = await fetch("/api/remove-location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function locateMedia(date, lat, lon) {
  const res = await fetch("/api/locate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, lat, lon }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function saveAlbumLabel(clusterKey, albumKey, body) {
  const res = await fetch(
    `/api/clusters/${encodeURIComponent(clusterKey)}/albums/${encodeURIComponent(albumKey)}/label`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const thumbUrl = (id) => `/api/media/${id}/thumbnail`;
export const fileUrl = (id) => `/api/media/${id}/file`;
export const faceThumbUrl = (filename) => `/api/faces/thumbnail/${encodeURIComponent(filename)}`;

export async function triggerFaceScan() {
  const res = await fetch("/api/faces/scan", { method: "POST" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchFaceScanStatus() {
  return getJSON("/api/faces/scan/status");
}

export async function triggerFaceRecluster() {
  const res = await fetch("/api/faces/cluster", { method: "POST" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchPeople() {
  return getJSON("/api/faces/people");
}

export function fetchPersonFaces(personId) {
  return getJSON(`/api/faces/people/${personId}/faces`);
}

export function fetchPersonMedia(personId) {
  return getJSON(`/api/faces/people/${personId}/media`);
}

export async function renamePerson(personId, name) {
  const res = await fetch(`/api/faces/people/${personId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function mergePeople(targetId, sourceId) {
  const res = await fetch("/api/faces/people/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_id: targetId, source_id: sourceId }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchFaceStats() {
  return getJSON("/api/faces/stats");
}

export async function resetFaceData() {
  const res = await fetch("/api/faces/reset", { method: "POST" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchDuplicateStats() {
  return getJSON("/api/duplicates/stats");
}

export function fetchDuplicates(page = 0, limit = 20) {
  return getJSON(`/api/duplicates?page=${page}&limit=${limit}`);
}

export async function deleteMedia(id) {
  const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchCorruptMedia() {
  return getJSON("/api/media/corrupt");
}

export function fetchJournalStats() {
  return getJSON("/api/journal/stats");
}

export function fetchJournalYears() {
  return getJSON("/api/journal/years");
}

export function fetchJournalEntryYears() {
  return getJSON("/api/journal/entry-years");
}

export function fetchJournalEntryMonths(year) {
  return getJSON(`/api/journal/${year}/entry-months`);
}

export function fetchJournalDays(year, month) {
  return getJSON(`/api/journal/${year}/${month}/days`);
}

export function fetchJournalEntry(date) {
  return getJSON(`/api/journal/${date}`);
}

export function checkJournalMedia(date, mediaId) {
  return getJSON(`/api/journal/${date}/check/${mediaId}`);
}

export async function saveJournalEntry(date, body) {
  const res = await fetch(`/api/journal/${date}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function toggleJournalMedia(date, mediaId) {
  const res = await fetch(`/api/journal/${date}/media/${mediaId}`, { method: "POST" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function deleteJournalEntry(date) {
  const res = await fetch(`/api/journal/${date}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
