import { useState } from "react";
import { supabase } from "../lib/supabase";
const cuisines = ['south_indian','north_indian','hyderabadi','andhra','kerala','tamil','punjabi','gujarati','maharashtrian','bengali','asian','continental'];
export default function ChefSafety({ data, onSaved }) {
  const [selected, setSelected] = useState(null), [skills, setSkills] = useState([]), [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { error: failure } = await supabase.rpc("chefos_ops_chef_safety", { p_chef: selected.id, p_cuisines: skills, p_reference: reference.trim() || null });
      if (failure) throw failure; setSelected(null); setReference(""); onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="ops-community-panel"><h2>Chef skills & identity enrolment</h2>
    <p>Review cuisine skills and registration selfie enrolment before approving a chef. Each cooking visit requires a fresh selfie and liveness check.</p>
    {error ? <p className="ops-error" role="alert">{error}</p> : null}
    <div className="ops-table-wrap"><table><thead><tr><th>Chef</th><th>Verified</th><th>Cuisines</th><th>Registration selfie</th><th /></tr></thead>
      <tbody>{(data?.rows || []).map((chef) => <tr key={chef.id}><td>{chef.name}</td><td>{chef.is_verified ? "Yes" : "No"}</td><td>{chef.cuisines.join(", ")}</td><td>{chef.selfie_enrolled ? "Enrolled" : "Pending"}</td>
        <td><button onClick={() => { setSelected(chef); setSkills(chef.cuisines); setReference(""); }}>Configure</button></td></tr>)}</tbody></table></div>
    {selected ? <form className="ops-community-form" onSubmit={save}><h3>{selected.name}</h3>
      <fieldset><legend>Verified cuisine skills</legend>{cuisines.map((c) => <label key={c} style={{ display: "inline-flex", margin: 10, gap: 6 }}><input type="checkbox" checked={skills.includes(c)} onChange={() => setSkills((v) => v.includes(c) ? v.filter((x) => x !== c) : [...v, c])} />{c.replaceAll("_", " ")}</label>)}</fieldset>
      {selected.selfie_enrolled ? <p>Registration selfie enrolled on {new Date(selected.selfie_enrolled_at).toLocaleDateString()}.</p>
        : <label>Legacy gateway enrolment reference (optional)<input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} autoComplete="off" /></label>}
      <button className="ops-primary" disabled={busy || !skills.length}>{busy ? "Saving…" : "Save verified details"}</button>
      <button type="button" onClick={() => setSelected(null)}>Cancel</button>
    </form> : null}
  </section>;
}
