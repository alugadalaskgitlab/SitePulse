import { useRef, useState } from "react";
import { AlertTriangle, Camera, Check, ChevronDown, ClipboardList, Gauge, HardHat, RotateCcw, X } from "lucide-react";
import "./condensed-dpr.css";

type Outcome = "" | "Fully reusable" | "Partly reusable" | "Unsuitable";
type Activity = {
  id: string;
  name: string;
  reach: string;
  from: string;
  to: string;
  side: string;
  length: string;
  width: string;
  thickness: string;
  layer: string;
  personnel: string;
  photos: string[];
};

const seedActivities: Activity[] = [
  { id: "excavation", name: "Roadway excavation", reach: "Reach 2", from: "1+180", to: "1+360", side: "Full width", length: "180", width: "7", thickness: "0.35", layer: "—", personnel: "Excavation crew · 6", photos: [] },
  { id: "embankment", name: "Embankment filling", reach: "Reach 3", from: "1+360", to: "1+520", side: "Full width", length: "160", width: "7", thickness: "0.25", layer: "1", personnel: "Earthworks crew · 8", photos: [] },
];

const materialSources = ["Roadway excavation, Reach 2", "Approved external borrow", "Existing stockpile"];
const outcomes: Exclude<Outcome, "">[] = ["Fully reusable", "Partly reusable", "Unsuitable"];
const formatQty = (activity: Activity) => {
  const qty = Number(activity.length || 0) * Number(activity.width || 0) * Number(activity.thickness || 0);
  return Number.isFinite(qty) ? qty.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0";
};

export function CondensedDpr() {
  const [activities, setActivities] = useState<Activity[]>(() => seedActivities.map(a => ({ ...a, photos: [] })));
  const [expanded, setExpanded] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<Outcome>("");
  const [reusableQty, setReusableQty] = useState("");
  const [source, setSource] = useState(materialSources[0]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [closingTank, setClosingTank] = useState("42");
  const [tankConfirmed, setTankConfirmed] = useState(false);
  const [highlight, setHighlight] = useState("");
  const photoInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateActivity = (id: string, patch: Partial<Activity>) =>
    setActivities(current => current.map(activity => activity.id === id ? { ...activity, ...patch } : activity));

  const toggleActivity = (id: string) =>
    setExpanded(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  const fix = (target: "excavation" | "equipment") => {
    if (target === "excavation") setExpanded(current => current.includes("excavation") ? current : [...current, "excavation"]);
    setHighlight(target);
    window.setTimeout(() => {
      document.getElementById(target === "excavation" ? "dpr14-outcome-first" : "dpr14-tank-input")?.focus({ preventScroll: true });
      document.getElementById(`dpr14-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(""), 2600);
  };

  const reset = () => {
    setActivities(seedActivities.map(a => ({ ...a, photos: [] })));
    setExpanded([]);
    setOutcome("");
    setReusableQty("");
    setSource(materialSources[0]);
    setSourceOpen(false);
    setClosingTank("42");
    setTankConfirmed(false);
    setHighlight("");
    Object.values(photoInputs.current).forEach(input => { if (input) input.value = ""; });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const missing = [!outcome && { key: "excavation" as const, text: "Roadway excavation — material outcome not set" }, !tankConfirmed && { key: "equipment" as const, text: "Excavator — closing tank reading not confirmed" }].filter((item): item is { key: "excavation" | "equipment"; text: string } => Boolean(item));
  const consumed = 58 + 31 - Number(closingTank);

  return (
    <div className="dpr14">
      <header className="dpr14-top">
        <div className="dpr14-brand"><span className="dpr14-brand-mark"><HardHat size={18} strokeWidth={2.3} /></span>SitePulse</div>
        <div className="dpr14-topright"><span>FIELD REPORTS</span><span>Daily progress / Design review</span></div>
      </header>

      <main className="dpr14-shell">
        <div className="dpr14-crumb">Reports <span aria-hidden="true">/</span> Daily progress <span aria-hidden="true">/</span> <b>Condensed view</b></div>
        <div className="dpr14-head">
          <div>
            <div className="dpr14-eyebrow"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#dc7b36" }} /> DPR layout study · 14</div>
            <h1>Daily progress report</h1>
            <p className="dpr14-subhead">Sample roadworks day <span aria-hidden="true">·</span> Activity and equipment detail, only when you need it</p>
          </div>
          <div className="dpr14-head-actions">
            <span className="dpr14-sample">Mockup · sample data</span>
            <button type="button" className="dpr14-reset" onClick={reset}><RotateCcw size={13} /> Reset sample</button>
          </div>
        </div>

        {missing.length > 0 && (
          <aside className="dpr14-alert" aria-label="Items needed before submission" role="status">
            <span className="dpr14-alert-icon"><AlertTriangle size={16} strokeWidth={2.2} /></span>
            <div className="dpr14-alert-main">
              <div className="dpr14-alert-title">{missing.length} {missing.length === 1 ? "item" : "items"} to resolve before submission</div>
              <div className="dpr14-alert-list">
                {missing.map(item => (
                  <div className="dpr14-alert-item" key={item.key}>
                    <span aria-hidden="true">•</span><strong>{item.text}</strong>
                    <button type="button" className="dpr14-fix" onClick={() => fix(item.key)} aria-label={`Fix ${item.text}`}>Fix →</button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        <section className="dpr14-section" aria-labelledby="dpr14-activities-heading">
          <div className="dpr14-section-heading">
            <div><div className="dpr14-section-title"><ClipboardList size={19} strokeWidth={2} /><h2 id="dpr14-activities-heading">Activity progress</h2></div><p>Two recorded activities · open a row to review or change details</p></div>
            <span className="dpr14-section-count">02 activities</span>
          </div>
          <div className="dpr14-list">
            {activities.map((activity, index) => {
              const isOpen = expanded.includes(activity.id);
              const isExcavation = activity.id === "excavation";
              return (
                <article key={activity.id} id={`dpr14-${activity.id}`} className={`dpr14-card ${highlight === activity.id ? "is-focused" : ""}`}>
                  <button type="button" className="dpr14-activity-toggle" aria-expanded={isOpen} aria-controls={`dpr14-detail-${activity.id}`} onClick={() => toggleActivity(activity.id)}>
                    <span className="dpr14-activity-id">
                      <span className="dpr14-activity-number">{String(index + 1).padStart(2, "0")}</span>
                      <span style={{ minWidth: 0 }}><span className="dpr14-activity-title" style={{ display: "block" }}>{activity.name}</span><span className="dpr14-activity-meta">BOQ activity · {activity.reach}</span></span>
                    </span>
                    <span className="dpr14-reachsummary"><span className="dpr14-summary-label">Chainage</span><span className="dpr14-summary-value">{activity.from} — {activity.to}</span></span>
                    <span className="dpr14-qtysummary"><span className="dpr14-summary-label">Physical qty</span><span className="dpr14-quantity">{formatQty(activity)}<small>CUM</small></span></span>
                    <span className={`dpr14-chip ${isExcavation && !outcome ? "warning" : "good"}`}>
                      {isExcavation && !outcome ? <AlertTriangle size={12} /> : <Check size={12} strokeWidth={3} />}
                      {isExcavation && !outcome ? "Outcome needed" : "Recorded"}
                    </span>
                    <ChevronDown size={16} className={`dpr14-chevron ${isOpen ? "open" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="dpr14-details" id={`dpr14-detail-${activity.id}`}>
                      <div className="dpr14-fields">
                        <div className="dpr14-field"><label htmlFor={`dpr14-side-${activity.id}`}>Side</label><select className="dpr14-select" id={`dpr14-side-${activity.id}`} value={activity.side} onChange={e => updateActivity(activity.id, { side: e.target.value })}><option>Full width</option><option>LHS</option><option>RHS</option><option>Both sides</option></select></div>
                        <div className="dpr14-field"><label htmlFor={`dpr14-from-${activity.id}`}>From (Ch.)</label><input className="dpr14-input" id={`dpr14-from-${activity.id}`} value={activity.from} onChange={e => updateActivity(activity.id, { from: e.target.value })} /></div>
                        <div className="dpr14-field"><label htmlFor={`dpr14-to-${activity.id}`}>To (Ch.)</label><input className="dpr14-input" id={`dpr14-to-${activity.id}`} value={activity.to} onChange={e => updateActivity(activity.id, { to: e.target.value })} /></div>
                        <div className="dpr14-field"><label htmlFor={`dpr14-length-${activity.id}`}>Length (m)</label><input className="dpr14-input" id={`dpr14-length-${activity.id}`} type="number" min="0" step="0.01" value={activity.length} onChange={e => updateActivity(activity.id, { length: e.target.value })} /></div>
                        <div className="dpr14-field"><label htmlFor={`dpr14-width-${activity.id}`}>Width (m)</label><input className="dpr14-input" id={`dpr14-width-${activity.id}`} type="number" min="0" step="0.01" value={activity.width} onChange={e => updateActivity(activity.id, { width: e.target.value })} /></div>
                        <div className="dpr14-field"><label htmlFor={`dpr14-depth-${activity.id}`}>Thickness (m)</label><input className="dpr14-input" id={`dpr14-depth-${activity.id}`} type="number" min="0" step="0.01" value={activity.thickness} onChange={e => updateActivity(activity.id, { thickness: e.target.value })} /></div>
                        <div className="dpr14-field"><label htmlFor={`dpr14-layer-${activity.id}`}>Layer / lift no.</label><input className="dpr14-input" id={`dpr14-layer-${activity.id}`} value={activity.layer} onChange={e => updateActivity(activity.id, { layer: e.target.value })} /></div>
                        <div className="dpr14-field"><label>Physical qty (CUM)</label><input className="dpr14-input" readOnly value={formatQty(activity)} aria-label={`${activity.name} calculated physical quantity in cubic metres`} /><p className="dpr14-field-note">L × W × T in this sample</p></div>
                      </div>

                      <div className="dpr14-detail-lower">
                        <div className="dpr14-detail-pane">
                          {isExcavation ? (
                            <>
                              <span className="dpr14-detail-label">Material outcome <span style={{ color: "#a65a1b" }}>*</span></span>
                              <div className="dpr14-outcomes" role="group" aria-label="Roadway excavation material outcome">
                                {outcomes.map((option, optionIndex) => <button key={option} id={optionIndex === 0 ? "dpr14-outcome-first" : undefined} type="button" className={`dpr14-outcome ${outcome === option ? "selected" : ""}`} aria-pressed={outcome === option} onClick={() => setOutcome(option)}><span className="dpr14-radio" />{option}</button>)}
                              </div>
                              <p className="dpr14-helper">Required for roadway excavation only. Choose what happened to the excavated material.</p>
                              {outcome === "Partly reusable" && <div className="dpr14-reusable-field"><label className="dpr14-detail-label" htmlFor="dpr14-reusable-qty">Reusable quantity (CUM)</label><input className="dpr14-input" id="dpr14-reusable-qty" type="number" min="0" step="0.01" value={reusableQty} onChange={e => setReusableQty(e.target.value)} /></div>}
                            </>
                          ) : (
                            <>
                              <span className="dpr14-detail-label">Material source</span>
                              <div className="dpr14-sourcebox"><span>Material source: <strong>{source}</strong></span><button type="button" className="dpr14-textbutton" aria-expanded={sourceOpen} onClick={() => setSourceOpen(open => !open)}>Change</button></div>
                              {sourceOpen && <div className="dpr14-source-picker"><p>Choose where the fill material came from</p>{materialSources.map(option => <button key={option} type="button" className={`dpr14-source-option ${source === option ? "active" : ""}`} onClick={() => { setSource(option); setSourceOpen(false); }}>{source === option ? <Check size={14} /> : <span style={{ width: 14 }} />}{option}</button>)}</div>}
                            </>
                          )}
                        </div>
                        <div className="dpr14-detail-pane">
                          <label className="dpr14-detail-label" htmlFor={`dpr14-crew-${activity.id}`}>Personnel on activity</label>
                          <input className="dpr14-input" id={`dpr14-crew-${activity.id}`} value={activity.personnel} onChange={e => updateActivity(activity.id, { personnel: e.target.value })} />
                          <p className="dpr14-helper">Local sample entry; not saved to a report.</p>
                        </div>
                      </div>
                      <div className="dpr14-extra">
                        <div>
                          <span className="dpr14-detail-label">Site photos</span>
                          <div className="dpr14-upload">
                            <input ref={el => { photoInputs.current[activity.id] = el; }} type="file" accept="image/*" multiple hidden aria-label={`Select photos for ${activity.name}`} onChange={e => { const names = Array.from(e.target.files || []).map(file => file.name); updateActivity(activity.id, { photos: [...activity.photos, ...names] }); e.target.value = ""; }} />
                            <button className="dpr14-smallbutton" type="button" onClick={() => photoInputs.current[activity.id]?.click()}><Camera size={13} /> Add photos</button>
                            <span className="dpr14-helper" style={{ margin: 0 }}>{activity.photos.length ? `${activity.photos.length} selected locally` : "No photos selected"}</span>
                          </div>
                          {activity.photos.length > 0 && <div className="dpr14-photolist">{activity.photos.map((name, photoIndex) => <span className="dpr14-photo" key={`${name}-${photoIndex}`}><span title={name}>{name}</span><button type="button" aria-label={`Remove ${name}`} onClick={() => updateActivity(activity.id, { photos: activity.photos.filter((_, i) => i !== photoIndex) })}><X size={12} /></button></span>)}</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="dpr14-section" aria-labelledby="dpr14-equipment-heading">
          <div className="dpr14-section-heading">
            <div><div className="dpr14-section-title"><Gauge size={19} strokeWidth={2} /><h2 id="dpr14-equipment-heading">Equipment log</h2></div><p>One machine · key usage and fuel readings in one view</p></div>
            <span className="dpr14-section-count">01 machine</span>
          </div>
          <article id="dpr14-equipment" className={`dpr14-card dpr14-equipment ${highlight === "equipment" ? "is-focused" : ""}`}>
            <div className="dpr14-equipment-head">
              <div className="dpr14-machine"><span className="dpr14-machine-icon"><Gauge size={17} /></span><div><h3>Excavator <span style={{ fontWeight: 500, color: "#728491", fontSize: 12 }}>· EX-07</span></h3><p>Operator: M. Deshmukh <span aria-hidden="true">·</span> Hired equipment</p></div></div>
              <span className="dpr14-chip good"><Check size={12} strokeWidth={3} /> Working</span>
            </div>
            <div className="dpr14-statgrid">
              <div className="dpr14-stat"><div className="dpr14-stat-label">Meter hours</div><div className="dpr14-stat-value">6.8 <small>h</small></div></div>
              <div className="dpr14-stat"><div className="dpr14-stat-label">Clock duration</div><div className="dpr14-stat-value">8h 45m</div></div>
              <div className="dpr14-stat"><div className="dpr14-stat-label">Diesel issued</div><div className="dpr14-stat-value">31 <small>L</small></div></div>
              <div className="dpr14-stat"><div className="dpr14-stat-label">Tank status</div><div className={`dpr14-stat-value ${tankConfirmed ? "confirmed" : "pending"}`}>{tankConfirmed ? "Confirmed" : "Not confirmed"}</div></div>
            </div>
            <div className="dpr14-equipment-bottom">
              <div className="dpr14-tankdetails">
                <span>Meter <strong>1,412.4 → 1,419.2 h</strong></span>
                <span>Time <strong>08:15 → 17:00</strong></span>
                <span>Opening tank <strong>58 L</strong></span>
                <label htmlFor="dpr14-tank-input" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Closing tank <input id="dpr14-tank-input" className="dpr14-input" style={{ width: 65, height: 29, padding: "0 6px" }} type="number" min="0" max="89" step="0.1" value={closingTank} onChange={e => { setClosingTank(e.target.value); setTankConfirmed(false); }} aria-label="Excavator closing tank reading in litres" /> L</label>
                <span className={`dpr14-consumption ${tankConfirmed ? "complete" : ""}`}>Consumption: {tankConfirmed ? `${consumed.toLocaleString("en-IN", { maximumFractionDigits: 1 })} L` : "Incomplete — tank not confirmed"}</span>
              </div>
              {!tankConfirmed && <button type="button" className="dpr14-confirm" onClick={() => setTankConfirmed(true)} disabled={closingTank.trim() === "" || !Number.isFinite(Number(closingTank)) || Number(closingTank) < 0 || Number(closingTank) > 89}><Check size={13} strokeWidth={2.7} /> Confirm tank reading</button>}
            </div>
          </article>
        </section>
        <footer className="dpr14-foot"><span>Design review prototype · Sample values are illustrative, not a real DPR record.</span><span>Local interactions only · No save, upload or submission</span></footer>
      </main>
    </div>
  );
}

export default CondensedDpr;