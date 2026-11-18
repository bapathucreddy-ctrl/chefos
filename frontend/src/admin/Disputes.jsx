import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
export default function Disputes({ data, onSaved }) {
  const [resolution, setResolution] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState(""), [video, setVideo] = useState(null);
  useEffect(() => () => { if (video) URL.revokeObjectURL(video); }, [video]);
  async function act(task) { setBusy(true); setError(""); try { await task(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function view(complaint, clip) {
    const { data: blob, error: failure } = await supabase.functions.invoke("chefos-recordings", { body: { id: clip.id, complaint_id: complaint.id } });
    if (failure) throw new Error("Recording access failed. An open complaint and active administrator account are required.");
    if (!(blob instanceof Blob)) throw new Error("The recording could not be loaded.");
    setVideo(URL.createObjectURL(new Blob([blob], { type: "video/mp4" })));
  }
  async function close(complaint) {
    const { error: failure } = await supabase.rpc("chefos_ops_complaints", { p_id: complaint.id, p_resolution: resolution[complaint.id] });
    if (failure) throw failure; setVideo(null); onSaved();
  }
  return <section className="ops-community-panel"><h2>Cooking visit complaints</h2>
    <p>Footage can be opened only for a specific open complaint. Every viewing request is audited. Open complaints hold retained footage beyond its normal 14-day expiry.</p>
    {error ? <p role="alert" className="ops-error">{error}</p> : null}
    {video ? <div><video src={video} controls style={{ width: "100%", maxHeight: 420 }} /><button onClick={() => setVideo(null)}>Close footage</button></div> : null}
    {(data?.rows || []).map((c) => <article key={c.id} className="ops-community-panel" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 20 }}>
      <h3>{c.customer} · {c.state}</h3><p>{c.reason}</p><small>Session {c.session_id} · {new Date(c.created_at).toLocaleString()}</small>
      {c.state === "open" ? <><div>{c.clips.filter((r) => r.uploaded).map((clip) => <button key={clip.id} disabled={busy} onClick={() => act(() => view(c, clip))}>Review {new Date(clip.started_at).toLocaleTimeString()}</button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); act(() => close(c)); }} className="ops-community-form"><label>Resolution<textarea required minLength={5} maxLength={1000} value={resolution[c.id] || ""} onChange={(e) => setResolution((v) => ({ ...v, [c.id]: e.target.value }))} /></label><button className="ops-primary" disabled={busy}>Resolve complaint</button></form>
      </> : <p>Resolution: {c.resolution}</p>}
    </article>)}
    {!data?.rows?.length ? <p>No cooking complaints.</p> : null}
  </section>;
}
