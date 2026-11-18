import { useEffect, useMemo, useRef } from "react";
import { mapDocument } from "./mapDocument";

export function ServiceMap({ points = [], center, selectedId, onSelect, height = 300, follow = false, onFollowChange }) {
  const frame = useRef(null);
  const html = useMemo(() => mapDocument(), []);
  const payload = { type: "update", points, center, selectedId, follow };
  const latest = useRef(payload); latest.current = payload;
  const pointKey = JSON.stringify(payload);
  useEffect(() => { frame.current?.contentWindow?.postMessage(JSON.parse(pointKey), "*"); }, [pointKey]);
  useEffect(() => {
    function receive(event) {
      if (event.source !== frame.current?.contentWindow) return;
      try {
        const input = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (input.type === "ready") frame.current?.contentWindow?.postMessage(latest.current, "*");
        if (input.type === "follow") onFollowChange?.(false);
        if (input.type === "select" && points.some((point) => point.id === input.id)) onSelect?.(input.id);
      } catch {}
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [points, onSelect, onFollowChange]);
  return <div style={{ position: "relative", height, width: "100%" }}>
    <iframe ref={frame} title="Chefos service map" srcDoc={html} sandbox="allow-scripts allow-same-origin allow-popups"
      onLoad={() => frame.current?.contentWindow?.postMessage(latest.current, "*")}
      style={{ width: "100%", height, border: 0, borderRadius: 26, background: "#e9eee6" }} />
    <button aria-label="Recenter map" onClick={() => { onFollowChange?.(true); frame.current?.contentWindow?.postMessage({ ...latest.current, recenter: true }, "*"); }}
      style={{ position: "absolute", right: 12, bottom: 32, width: 42, height: 42, border: 0, borderRadius: 22, background: "white", color: "#14213D", fontSize: 23, cursor: "pointer" }}>◎</button>
  </div>;
}
