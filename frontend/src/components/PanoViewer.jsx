import { useEffect, useRef } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/video-plugin/index.css";
import { fileUrl } from "../api.js";

export default function PanoViewer({ item }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      let viewer;
      if (item.media_type === "video") {
        const [{ EquirectangularVideoAdapter }, { VideoPlugin }] = await Promise.all([
          import("@photo-sphere-viewer/equirectangular-video-adapter"),
          import("@photo-sphere-viewer/video-plugin"),
        ]);
        if (cancelled) return;
        viewer = new Viewer({
          container: containerRef.current,
          adapter: EquirectangularVideoAdapter,
          panorama: { source: fileUrl(item.id) },
          plugins: [[VideoPlugin, { autoplay: true, muted: true }]],
          navbar: ["zoom", VideoPlugin.PLAY_BUTTON, VideoPlugin.VOLUME_BUTTON, "fullscreen"],
          keyboard: false,
        });
      } else {
        viewer = new Viewer({
          container: containerRef.current,
          panorama: fileUrl(item.id),
          navbar: ["zoom", "fullscreen"],
          keyboard: false,
        });
      }
      if (cancelled) {
        viewer?.destroy();
      } else {
        viewerRef.current = viewer;
      }
    })();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [item.id, item.media_type]);

  return <div ref={containerRef} className="pano-container" />;
}
