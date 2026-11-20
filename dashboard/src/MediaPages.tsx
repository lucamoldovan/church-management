
import { useEffect, useState, type ChangeEvent } from "react";
import { ChevronDown, ChevronUp, Disc3, Image, LoaderCircle, Plus, Radio, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import {
  createPlaylist,
  deleteMedia,
  deletePlaylist,
  getMedia,
  getPlaylist,
  getPlaylists,
  getSources,
  updatePlaylist,
  uploadMedia,
  type MediaAsset,
  type NdiSource,
  type PlaylistItem,
  type PlaylistSummary,
} from "./api";


export function SourcesPage() {
  const [sources, setSources] = useState<NdiSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    getSources(controller.signal).then((result) => {
      if (active) {
        setSources(result.sources);
        setError("");
      }
    }).catch((loadError) => {
      if (active && !controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Could not load NDI sources.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshTick]);

  return (
    <>
      <section className="page-heading">
        <div><div className="eyebrow">NETWORK INPUTS</div><h1>NDI sources</h1><p>Sources reported by Veyra receivers on your local network.</p></div>
        <button className="button button-secondary" onClick={() => setRefreshTick((tick) => tick + 1)} disabled={loading}><RefreshCw size={14} /> Refresh</button>
      </section>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <section className="panel sources-panel">
        <div className="panel-heading">
          <div><h2>Discovered sources</h2><p>Aggregated from receiver discovery reports</p></div>
          <span className="media-count">{sources.length} {sources.length === 1 ? "source" : "sources"}</span>
        </div>
        {loading ? (
          <div className="devices-empty"><LoaderCircle size={22} className="auth-spinner" /><span>Loading sources…</span></div>
        ) : sources.length === 0 ? (
          <div className="devices-empty">
            <div className="empty-icon"><Radio size={20} /></div>
            <strong>No NDI sources reported yet</strong>
            <span>Once the receiver discovery client is connected, sources found by each display will appear here.</span>
          </div>
        ) : (
          <div className="source-list">
            <div className="source-list-head"><span>SOURCE</span><span>ADDRESS</span><span>REPORTED BY</span><span>LAST SEEN</span></div>
            {sources.map((source) => (
              <div className="source-row" key={source.id}>
                <div className="source-name"><span className="source-icon"><Radio size={15} /></span><strong>{source.name}</strong></div>
                <code>{source.address ?? "Name-based source"}</code>
                <div className="source-devices">{source.devices.map((device) => <span key={device.id}>{device.name}</span>)}</div>
                <span className="source-last-seen">{source.lastSeenAt ? new Date(source.lastSeenAt).toLocaleString() : "Not reported"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <footer className="page-footer"><span>VEYRA <span className="footer-separator">/</span> NETWORK VIDEO. SIMPLIFIED.</span><span>NDI transport stays independent of server control <ShieldCheck size={13} /></span></footer>
    </>
  );
}

export function MediaPage() {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    getMedia(controller.signal).then((result) => {
      if (active) {
        setMedia(result.media);
        setError("");
      }
    }).catch((loadError) => {
      if (active && !controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Could not load the media library.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshTick]);

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    let uploaded = 0;
    try {
      for (const file of files) {
        await uploadMedia(file);
        uploaded += 1;
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the image.");
    } finally {
      if (uploaded > 0) setRefreshTick((tick) => tick + 1);
      setUploading(false);
    }
  };

  const removeImage = async (asset: MediaAsset) => {
    if (!window.confirm("Delete \"" + asset.name + "\" from the media library?")) return;
    setError("");
    try {
      await deleteMedia(asset.id);
      setRefreshTick((tick) => tick + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the image.");
    }
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">CONTENT LIBRARY</div>
          <h1>Media library</h1>
          <p>Store images locally and reuse them across your display playlists.</p>
        </div>
        <label className="button button-dark media-upload-button">
          {uploading ? <LoaderCircle size={15} className="auth-spinner" /> : <Plus size={16} />}
          {uploading ? "Uploading…" : "Add images"}
          <input className="media-upload-input" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={uploading} onChange={(event) => void uploadFiles(event)} />
        </label>
      </section>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <section className="panel media-library-panel">
        <div className="panel-heading">
          <div><h2>Images</h2><p>PNG, JPEG and WebP · up to 20 MB per image</p></div>
          <span className="media-count">{media.length} {media.length === 1 ? "asset" : "assets"}</span>
        </div>
        {loading ? (
          <div className="devices-empty"><LoaderCircle size={22} className="auth-spinner" /><span>Loading media…</span></div>
        ) : media.length === 0 ? (
          <div className="devices-empty">
            <div className="empty-icon"><Image size={20} /></div>
            <strong>Your library is empty</strong>
            <span>Upload a few images to start building display playlists.</span>
          </div>
        ) : (
          <div className="media-grid">
            {media.map((asset) => (
              <article className="media-card" key={asset.id}>
                <div className="media-preview"><img src={asset.contentUrl} alt={asset.name} loading="lazy" /></div>
                <div className="media-card-footer">
                  <div className="media-card-copy">
                    <strong title={asset.name}>{asset.name}</strong>
                    <span>{(asset.sizeBytes / 1024).toFixed(0)} KB · {asset.mimeType.replace("image/", "").toUpperCase()}</span>
                  </div>
                  <button className="icon-button media-delete-button" aria-label={"Delete " + asset.name} onClick={() => void removeImage(asset)}><Trash2 size={15} /></button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer className="page-footer"><span>VEYRA <span className="footer-separator">/</span> NETWORK VIDEO. SIMPLIFIED.</span><span>Stored on this Veyra server <ShieldCheck size={13} /></span></footer>
    </>
  );
}

export function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [activeId, setActiveId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [duration, setDuration] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([getPlaylists(controller.signal), getMedia(controller.signal)]).then(([playlistResult, mediaResult]) => {
      if (!active) return;
      setPlaylists(playlistResult.playlists);
      setMedia(mediaResult.media);
      if (!activeId && playlistResult.playlists.length > 0) setActiveId(playlistResult.playlists[0].id);
      if (!selectedMediaId && mediaResult.media.length > 0) setSelectedMediaId(mediaResult.media[0].id);
      setError("");
    }).catch((loadError) => {
      if (active && !controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Could not load playlists.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshTick]);

  useEffect(() => {
    if (!activeId) {
      setName("");
      setDescription("");
      setItems([]);
      return;
    }
    let active = true;
    const controller = new AbortController();
    getPlaylist(activeId, controller.signal).then((playlist) => {
      if (!active) return;
      setName(playlist.name);
      setDescription(playlist.description);
      setItems(playlist.items);
    }).catch((loadError) => {
      if (active && !controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Could not open this playlist.");
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeId]);

  const createNewPlaylist = async () => {
    const nextName = newPlaylistName.trim();
    if (!nextName) return;
    setSaving(true);
    setError("");
    try {
      const created = await createPlaylist({ name: nextName });
      setNewPlaylistName("");
      setActiveId(created.id);
      setRefreshTick((tick) => tick + 1);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the playlist.");
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => {
    if (!selectedMediaId || !Number.isInteger(duration) || duration < 1 || duration > 3600) return;
    setItems((current) => [...current, { mediaId: selectedMediaId, durationSeconds: duration }]);
  };

  const moveItem = (index: number, offset: number) => {
    setItems((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const currentItem = next[index];
      const targetItem = next[target];
      if (!currentItem || !targetItem) return current;
      next[index] = targetItem;
      next[target] = currentItem;
      return next;
    });
  };

  const hasInvalidDuration = items.some((item) => !Number.isInteger(item.durationSeconds) || item.durationSeconds < 1 || item.durationSeconds > 3600);

  const savePlaylist = async () => {
    if (!activeId || hasInvalidDuration) return;
    setSaving(true);
    setError("");
    try {
      await updatePlaylist(activeId, {
        name,
        description,
        items: items.map((item) => ({ mediaId: item.mediaId, durationSeconds: item.durationSeconds })),
      });
      setRefreshTick((tick) => tick + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the playlist.");
    } finally {
      setSaving(false);
    }
  };

  const removePlaylist = async () => {
    if (!activeId || !window.confirm("Delete playlist \"" + name + "\"?")) return;
    setSaving(true);
    setError("");
    try {
      await deletePlaylist(activeId);
      setActiveId("");
      setRefreshTick((tick) => tick + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the playlist.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">PLAYBACK CONTENT</div>
          <h1>Playlists</h1>
          <p>Build ordered image sequences with an individual display duration for every item.</p>
        </div>
      </section>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="playlist-workspace">
        <aside className="panel playlist-sidebar">
          <div className="panel-heading"><div><h2>Your playlists</h2><p>{playlists.length} saved</p></div></div>
          <div className="playlist-create-row">
            <input value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} placeholder="New playlist name" maxLength={80} />
            <button className="icon-button" aria-label="Create playlist" disabled={saving || !newPlaylistName.trim()} onClick={() => void createNewPlaylist()}><Plus size={17} /></button>
          </div>
          {loading ? <div className="playlist-sidebar-empty">Loading…</div> : playlists.length === 0 ? (
            <div className="playlist-sidebar-empty">Create a playlist to start building a sequence.</div>
          ) : (
            <div className="playlist-list">
              {playlists.map((playlist) => (
                <button key={playlist.id} className={"playlist-list-item " + (activeId === playlist.id ? "playlist-list-item-active" : "")} onClick={() => setActiveId(playlist.id)}>
                  <span>{playlist.name}</span><small>{playlist.itemCount} {playlist.itemCount === 1 ? "image" : "images"}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="panel playlist-editor">
          {!activeId ? (
            <div className="devices-empty">
              <div className="empty-icon"><Disc3 size={20} /></div>
              <strong>No playlist selected</strong>
              <span>Create a playlist on the left, then add images from your media library.</span>
            </div>
          ) : (
            <>
              <div className="panel-heading playlist-editor-heading">
                <div><h2>Sequence editor</h2><p>Images play in order and loop continuously.</p></div>
                <div className="playlist-editor-actions">
                  <button className="button button-secondary" disabled={saving} onClick={() => void removePlaylist()}><Trash2 size={14} /> Delete</button>
                  <button className="button button-dark" disabled={saving || !name.trim() || hasInvalidDuration} onClick={() => void savePlaylist()}>{saving ? "Saving…" : "Save changes"}</button>
                </div>
              </div>
              <div className="playlist-fields">
                <label className="field-label">Playlist name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>
                <label className="field-label">Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Optional description" /></label>
              </div>
              <div className="playlist-add-row">
                <select value={selectedMediaId} onChange={(event) => setSelectedMediaId(event.target.value)} disabled={media.length === 0}>
                  {media.length === 0 ? <option value="">Upload images first</option> : media.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                </select>
                <label className="playlist-duration-field"><span>Seconds</span><input type="number" min={1} max={3600} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
                <button className="button button-secondary" disabled={!selectedMediaId || media.length === 0 || !Number.isInteger(duration) || duration < 1 || duration > 3600} onClick={addItem}><Plus size={14} /> Add image</button>
              </div>
              {items.length === 0 ? (
                <div className="playlist-empty">This playlist has no images yet.</div>
              ) : (
                <div className="playlist-items">
                  {items.map((item, index) => {
                    const asset = media.find((candidate) => candidate.id === item.mediaId);
                    return (
                      <div className="playlist-item-row" key={item.id ?? (item.mediaId + "-" + index)}>
                        <span className="playlist-item-number">{String(index + 1).padStart(2, "0")}</span>
                        {asset && <img src={asset.contentUrl} alt="" />}
                        <div className="playlist-item-copy"><strong>{asset?.name ?? item.mediaName ?? "Missing image"}</strong><label className="playlist-item-duration"><input aria-label={"Display duration for item " + (index + 1)} type="number" min={1} max={3600} step={1} value={item.durationSeconds} onChange={(event) => { const value = Number(event.target.value); setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, durationSeconds: value } : entry)); }} /><span>seconds</span></label></div>
                        <div className="playlist-item-controls">
                          <button className="icon-button" aria-label="Move image up" disabled={index === 0} onClick={() => moveItem(index, -1)}><ChevronUp size={16} /></button>
                          <button className="icon-button" aria-label="Move image down" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}><ChevronDown size={16} /></button>
                          <button className="icon-button" aria-label="Remove image" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="playlist-editor-foot">Changes stay in this editor until you save them. Playlist assignment to receivers is a later integration step.</div>
            </>
          )}
        </section>
      </div>
      <footer className="page-footer"><span>VEYRA <span className="footer-separator">/</span> NETWORK VIDEO. SIMPLIFIED.</span><span>Image sequences · Local storage <ShieldCheck size={13} /></span></footer>
    </>
  );
}
