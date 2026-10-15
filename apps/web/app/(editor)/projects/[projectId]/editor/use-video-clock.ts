import { useEffect } from "react";
import { useEditorStore } from "./editor-store";

/**
 * Mirrors the <video> clock into the store: every animation frame while playing,
 * and on seek/pause/end otherwise. Captions never run on a timer of their own
 * (spec §9.3), so pausing, seeking and speed changes can't drift.
 */
export function useVideoClock(video: HTMLVideoElement | null) {
  const store = useEditorStore();

  useEffect(() => {
    if (!video) return;
    const { attachVideo, setClock, setPlaying, reloadSource } = store.getState();
    attachVideo(video);

    let frame = 0;
    const read = () => setClock(Math.round(video.currentTime * 1000));
    const tick = () => {
      read();
      frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const onStop = () => {
      setPlaying(false);
      cancelAnimationFrame(frame);
      read();
    };

    // A network error mid-session usually means the signed URL expired.
    let loaded = false;
    const onLoaded = () => {
      loaded = true;
    };
    const onError = () => {
      if (loaded || video.error?.code === MediaError.MEDIA_ERR_NETWORK) reloadSource();
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onStop);
    video.addEventListener("ended", onStop);
    video.addEventListener("seeked", read);
    video.addEventListener("timeupdate", read);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onStop);
      video.removeEventListener("ended", onStop);
      video.removeEventListener("seeked", read);
      video.removeEventListener("timeupdate", read);
      attachVideo(null);
    };
  }, [video, store]);
}
