import { useState, useCallback } from 'react'
import { useAuth, SignIn } from '@clerk/clerk-react'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:'#0c0e11', panel:'#12151a', card:'#181c22', border:'#1e2330',
  borderHi:'#2a3040', text:'#dde1eb', sub:'#7a8194', muted:'#3d4355',
  accent:'#4f8ef7', green:'#2ecc7a', amber:'#f0a500', red:'#e84545', purple:'#9b77f5',
}

const css = `
* { box-sizing:border-box; margin:0; padding:0; }
body { background:${C.bg}; color:${C.text}; font-family:'IBM Plex Sans',sans-serif; font-size:13px; line-height:1.5; }
::-webkit-scrollbar { width:5px; height:5px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
a { color:${C.accent}; text-decoration:none; }
a:hover { text-decoration:underline; }
button { font-family:inherit; cursor:pointer; }
input,select { font-family:inherit; }
`

// ─── Utility components ───────────────────────────────────────────────────────
function Pill({ children, color, bg }) {
  return <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em',
    padding:'2px 7px', borderRadius:20, background:bg||`${color}18`, color, flexShrink:0 }}>{children}</span>
}

function StatusPill({ status }) {
  const map = {
    high:   [C.red,   `${C.red}18`],
    medium: [C.amber, `${C.amber}18`],
    low:    [C.sub,   `${C.sub}14`],
    high_confidence: [C.green, `${C.green}18`],
    medium_confidence: [C.amber, `${C.amber}18`],
  }
  const [color, bg] = map[status] || map.low
  return <Pill color={color} bg={bg}>{status.replace('_', ' ')}</Pill>
}

function Btn({ children, onClick, variant='default', disabled, small }) {
  const v = {
    default: { background:C.card, border:`1px solid ${C.border}`, color:C.sub },
    primary: { background:C.accent, border:'none', color:'#fff' },
    green:   { background:`${C.green}18`, border:`1px solid ${C.green}44`, color:C.green },
    ghost:   { background:'none', border:`1px solid ${C.border}`, color:C.sub },
    danger:  { background:`${C.red}18`, border:`1px solid ${C.red}44`, color:C.red },
  }
  const s = v[variant] || v.default
  return <button disabled={disabled} onClick={onClick}
    style={{ ...s, padding:small?'4px 12px':'7px 16px', borderRadius:6,
      fontSize:small?11:12, fontWeight:500, opacity:disabled?.45:1,
      transition:'all .15s', whiteSpace:'nowrap' }}>{children}</button>
}

function Card({ children, style, accent }) {
  return <div style={{ background:C.card, border:`1px solid ${accent||C.border}`,
    borderRadius:10, overflow:'hidden', ...style }}>{children}</div>
}

function CardHead({ children, right, accent }) {
  return <div style={{ padding:'10px 16px', borderBottom:`1px solid ${C.border}`,
    background:`${C.panel}88`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
    <span style={{ fontSize:11, fontWeight:600, letterSpacing:'.06em',
      textTransform:'uppercase', color:accent||C.sub }}>{children}</span>
    {right && <div style={{ display:'flex', gap:8, alignItems:'center' }}>{right}</div>}
  </div>
}

function StatRow({ label, value, color, sub }) {
  return <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline',
    padding:'7px 0', borderBottom:`1px solid ${C.border}` }}>
    <span style={{ color:C.sub, fontSize:12 }}>{label}</span>
    <div style={{ textAlign:'right' }}>
      <span style={{ fontWeight:600, fontFamily:'IBM Plex Mono', color:color||C.text, fontSize:13 }}>{value}</span>
      {sub && <div style={{ fontSize:10, color:C.muted }}>{sub}</div>}
    </div>
  </div>
}

function SummaryGrid({ items }) {
  return <div style={{ display:'grid', gridTemplateColumns:`repeat(${items.length},1fr)`, gap:1,
    background:C.border, borderRadius:8, overflow:'hidden', margin:'0 0 0 0' }}>
    {items.map((item,i) => (
      <div key={i} style={{ background:C.card, padding:'12px 14px', textAlign:'center' }}>
        <div style={{ fontSize:20, fontWeight:700, fontFamily:'IBM Plex Mono',
          color:item.color||C.text, marginBottom:3 }}>{item.value??'—'}</div>
        <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:'.04em' }}>{item.label}</div>
      </div>
    ))}
  </div>
}

function Callout({ children, type='info' }) {
  const colors = { info:C.accent, warn:C.amber, error:C.red, success:C.green }
  const c = colors[type] || C.accent
  return <div style={{ fontSize:11, padding:'9px 13px', background:`${c}0f`,
    border:`1px solid ${c}33`, borderRadius:8, color:C.sub, lineHeight:1.6 }}>
    {children}
  </div>
}

function Accordion({ header, children, defaultOpen, borderColor }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return <div style={{ borderTop:`1px solid ${borderColor||C.border}` }}>
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px',
      cursor:'pointer', userSelect:'none' }} onClick={() => setOpen(v=>!v)}>
      {header}
      <span style={{ fontSize:10, color:C.muted, marginLeft:'auto', flexShrink:0 }}>{open?'▲':'▼'}</span>
    </div>
    {open && <div style={{ padding:'0 16px 14px' }}>{children}</div>}
  </div>
}

// ─── Step 0: Pre-Filter ───────────────────────────────────────────────────────
function Step0({ data }) {
  if (!data) return null
  const { excludedCompanies, excludedContacts, emailRepairTargets, summary } = data
  const needsTag = excludedCompanies.filter(c => c.flaggedForTag)

  return (
    <Card>
      <CardHead right={
        summary.totalExcluded > 0
          ? <Pill color={C.amber}>{summary.totalExcluded} excluded from enrichment</Pill>
          : <Pill color={C.green}>Nothing to exclude</Pill>
      }>Step 1 — Pre-Filter</CardHead>

      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>
        <SummaryGrid items={[
          { label:'Vendor Companies', value:summary.vendorCompanies, color:summary.vendorCompanies>0?C.amber:C.green },
          { label:'Needs Vendor Tag', value:summary.needsVendorTag,  color:summary.needsVendorTag>0?C.amber:C.green },
          { label:'Excluded Contacts', value:summary.excludedContacts, color:summary.excludedContacts>0?C.amber:C.green },
          { label:'Email Repair', value:summary.emailRepairTargets, color:summary.emailRepairTargets>0?C.red:C.green },
        ]} />

        {needsTag.length > 0 ? (
          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>
              Companies to tag as Vendor/Supplier
            </div>
            <Callout type="warn">
              These {needsTag.length} companies were detected as vendors but aren't tagged yet in HubSpot.
              They'll be included in the Field Updates export — review before importing.
            </Callout>
            <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:3 }}>
              {needsTag.map((co,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
                  background:C.panel, borderRadius:7, border:`1px solid ${C.border}` }}>
                  <span style={{ flex:1, fontSize:12 }}>{co.name}</span>
                  <span style={{ fontSize:11, color:C.sub }}>{co.reason}</span>
                  <a href={co.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11 }}>Open →</a>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Callout type="success">✓ No vendor companies detected — all Gold accounts look like legitimate targets.</Callout>
        )}

        {emailRepairTargets.length > 0 && (
          <Callout type="error">
            {emailRepairTargets.length} contacts have bounced or missing emails.
            Export the Email Repair list for ZoomInfo or manual research.
          </Callout>
        )}
      </div>
    </Card>
  )
}

// ─── Step 1: Dedup ────────────────────────────────────────────────────────────
function Step1({ data, approved, onApprove }) {
  if (!data) return null
  const { issues, summary, analyzedCompanies } = data
  const hasIssues = issues.length > 0

  return (
    <Card>
      <CardHead right={
        hasIssues
          ? <Pill color={C.amber}>{issues.length} issues found</Pill>
          : <Pill color={C.green}>All clear</Pill>
      }>Step 2 — Duplicate Detection</CardHead>

      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>
        <SummaryGrid items={[
          { label:'Duplicate Names',  value:summary.duplicateNames,  color:summary.duplicateNames>0?C.red:C.green },
          { label:'Shared Domain',    value:summary.sameDomain,      color:summary.sameDomain>0?C.amber:C.green },
          { label:'Missing Domain',   value:summary.missingDomain,   color:summary.missingDomain>0?C.amber:C.green },
          { label:'Merges Needed',    value:summary.mergesRequired,  color:summary.mergesRequired>0?C.red:C.green },
        ]} />

        {!hasIssues && <Callout type="success">✓ No duplicate companies found across {analyzedCompanies} accounts.</Callout>}

        {issues.map((issue, i) => (
          <Accordion key={issue.issueId} header={
            <>
              <StatusPill status={issue.severity} />
              <span style={{ fontSize:12, fontWeight:500, flex:1 }}>{issue.label}</span>
              {approved[issue.issueId] && <Pill color={C.green}>Reviewed</Pill>}
            </>
          }>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:4 }}>
              <p style={{ fontSize:12, color:C.sub }}>{issue.description}</p>

              {issue.records.map((rec,j) => (
                <div key={j} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                  background:C.panel, borderRadius:8, border:`1px solid ${C.border}` }}>
                  <div style={{ flex:1 }}>
                    <a href={rec.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontWeight:600, fontSize:12 }}>{rec.name}</a>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                      {rec.tier} · {rec.domain||'no domain'} · {rec.contacts} contacts
                    </div>
                  </div>
                  {j===0 && issue.action==='MERGE_MANUAL' && <Pill color={C.green}>Keep this one</Pill>}
                  {j>0  && issue.action==='MERGE_MANUAL' && <Pill color={C.red}>Merge into primary</Pill>}
                </div>
              ))}

              {issue.manualNote && <Callout type="info">Action: {issue.manualNote}</Callout>}

              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                {!approved[issue.issueId]
                  ? <Btn small variant="green" onClick={() => onApprove(issue.issueId, issue)}>Mark as reviewed ✓</Btn>
                  : <span style={{ fontSize:11, color:C.green }}>✓ Reviewed</span>
                }
                <Btn small onClick={() => window.open(issue.records[0].url,'_blank')}>Open in HubSpot</Btn>
              </div>
            </div>
          </Accordion>
        ))}
      </div>
    </Card>
  )
}

// ─── Step 2: Hierarchy ────────────────────────────────────────────────────────
function Step2({ data, approved, onApprove, companies }) {
  const [enriching, setEnriching]         = useState(false)
  const [enrichResults, setEnrichResults] = useState([])
  const [enrichProgress, setEnrichProgress] = useState('')
  const [enrichDone, setEnrichDone]       = useState(false)
  const [enrichError, setEnrichError]     = useState(null)

  if (!data) return null
  const { proposals, summary } = data

  const runEnrichment = async () => {
    setEnriching(true); setEnrichResults([]); setEnrichDone(false); setEnrichError(null)
    const allResults = []; const batchSize = 10; let batchStart = 0
    try {
      while (batchStart < companies.length) {
        setEnrichProgress(`Researching companies ${batchStart+1}–${Math.min(batchStart+batchSize, companies.length)} of ${companies.length}…`)
        const res = await fetch('/api/dq-enrich', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ companies, batchStart, batchSize }),
        })
        if (!res.ok) throw new Error('Research request failed')
        const d = await res.json()
        allResults.push(...(d.results||[]))
        if (!d.hasMore) break
        batchStart = d.nextBatch
        await new Promise(r => setTimeout(r, 1000))
      }
      setEnrichResults(allResults); setEnrichDone(true); setEnrichProgress('')
    } catch(e) { setEnrichError(e.message); setEnrichProgress('') }
    finally { setEnriching(false) }
  }

  const nameChanges    = enrichResults.flatMap(r=>r.flags||[]).filter(f=>f.type==='NAME_CHANGED')
  const recentChanges  = enrichResults.flatMap(r=>r.flags||[]).filter(f=>f.type==='RECENT_CHANGE')
  const withUpdates    = enrichResults.filter(r=>(r.fieldUpdates||[]).length>0)

  return (
    <Card>
      <CardHead right={<Pill color={C.accent}>{proposals.length} proposals</Pill>}>
        Step 3 — Hierarchy & Parent/Subsidiary Mapping
      </CardHead>

      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>
        <SummaryGrid items={[
          { label:'Total Proposals',    value:summary.total },
          { label:'High Confidence',    value:summary.highConfidence,     color:C.green },
          { label:'Ready to Export',    value:summary.csvExportable,      color:C.accent },
          { label:'Needs Association',  value:summary.requireAssociation, color:summary.requireAssociation>0?C.amber:C.green },
        ]} />

        {/* Live Research */}
        <div style={{ background:C.panel, border:`1px solid ${C.borderHi}`, borderRadius:10, padding:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Live Research Verification</div>
              <div style={{ fontSize:12, color:C.sub, lineHeight:1.6 }}>
                The static proposals above are based on built-in knowledge and may be outdated.
                Run live research to verify current names, detect recent mergers and rebrandings,
                and confirm parent/subsidiary relationships as of 2025.
              </div>
              <div style={{ fontSize:11, color:C.muted, marginTop:5 }}>
                {Math.ceil(companies.length/10)} batches · ~{Math.ceil(companies.length*2/60)} min · {companies.length} companies
              </div>
            </div>
            <Btn variant="primary" disabled={enriching} onClick={runEnrichment}>
              {enriching ? '⟳ Researching…' : enrichDone ? 'Re-run' : 'Run Research'}
            </Btn>
          </div>

          {enriching && (
            <div style={{ marginTop:12, fontSize:12, color:C.accent }}>{enrichProgress}</div>
          )}
          {enrichError && (
            <div style={{ marginTop:10 }}><Callout type="error">{enrichError}</Callout></div>
          )}

          {enrichDone && enrichResults.length > 0 && (
            <div style={{ marginTop:14, display:'flex', flexDirection:'column', gap:12 }}>
              <SummaryGrid items={[
                { label:'Researched',      value:enrichResults.length },
                { label:'Name Changes',    value:nameChanges.length,   color:nameChanges.length>0?C.red:C.green },
                { label:'Recent Changes',  value:recentChanges.length, color:recentChanges.length>0?C.amber:C.green },
                { label:'Updated Proposals', value:withUpdates.length, color:C.accent },
              ]} />

              {/* Name changes */}
              {nameChanges.length > 0 && (
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:C.red, marginBottom:8 }}>
                    Outdated Company Names — update these in HubSpot
                  </div>
                  {enrichResults.filter(r=>r.flags?.some(f=>f.type==='NAME_CHANGED')).map((r,i) => {
                    const flag = r.flags.find(f=>f.type==='NAME_CHANGED')
                    return (
                      <div key={i} style={{ padding:'12px', background:`${C.red}08`,
                        border:`1px solid ${C.red}22`, borderRadius:9, marginBottom:8 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600 }}>
                              <span style={{ color:C.red }}>{flag.currentName}</span>
                              <span style={{ color:C.muted, margin:'0 8px' }}>→</span>
                              <span style={{ color:C.green }}>{flag.correctName}</span>
                            </div>
                            <div style={{ fontSize:11, color:C.sub, marginTop:4 }}>{r.research?.notes}</div>
                            {r.research?.recentChanges && (
                              <div style={{ fontSize:11, color:C.amber, marginTop:4 }}>
                                {r.research.recentChanges}
                              </div>
                            )}
                          </div>
                          <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0, marginLeft:12 }}>
                            <StatusPill status={`${r.confidence}_confidence`} />
                            <a href={r.url} target="_blank" rel="noopener noreferrer">
                              <Btn small>Open →</Btn>
                            </a>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Recent changes */}
              {recentChanges.length > 0 && (
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:C.amber, marginBottom:8 }}>
                    Recent Mergers, Acquisitions & Rebrandings
                  </div>
                  {enrichResults.filter(r=>r.flags?.some(f=>f.type==='RECENT_CHANGE')).map((r,i) => {
                    const flag = r.flags.find(f=>f.type==='RECENT_CHANGE')
                    return (
                      <div key={i} style={{ padding:'10px 14px', background:`${C.amber}08`,
                        border:`1px solid ${C.amber}22`, borderRadius:9, marginBottom:6,
                        display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600 }}>{r.companyName}</div>
                          <div style={{ fontSize:11, color:C.sub, marginTop:3 }}>{flag.message}</div>
                        </div>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft:12, flexShrink:0 }}>
                          <Btn small>Open →</Btn>
                        </a>
                      </div>
                    )
                  })}
                </div>
              )}

              {nameChanges.length === 0 && recentChanges.length === 0 && (
                <Callout type="success">✓ All company names and hierarchies appear current as of 2025.</Callout>
              )}

              <Callout type="info">
                Export the Field Updates CSV to apply verified hierarchy changes.
                Name changes must be updated manually in HubSpot — the export will flag which ones.
              </Callout>
            </div>
          )}
        </div>

        {/* Static proposals (collapsed by default since research is preferred) */}
        {proposals.length > 0 && (
          <Accordion header={
            <>
              <span style={{ fontSize:12, fontWeight:500 }}>Static Proposals (built-in knowledge)</span>
              <Pill color={C.sub}>{proposals.length} proposals</Pill>
            </>
          }>
            <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:8 }}>
              {proposals.slice(0,30).map((p,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
                  background:C.panel, borderRadius:7, border:`1px solid ${C.border}` }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <span style={{ fontSize:12, fontWeight:500 }}>{p.companyName}</span>
                    <span style={{ fontSize:11, color:C.muted, marginLeft:8 }}>{p.tier}</span>
                  </div>
                  {(p.fieldUpdates||[]).map((u,j) => (
                    <span key={j} style={{ fontSize:10, color:C.sub }}>
                      {u.field}: <span style={{ color:C.accent }}>{u.proposedValue}</span>
                    </span>
                  ))}
                  <StatusPill status={`${p.confidence}_confidence`} />
                </div>
              ))}
              {proposals.length > 30 && (
                <div style={{ fontSize:11, color:C.muted, padding:'4px 0' }}>
                  + {proposals.length-30} more in export
                </div>
              )}
            </div>
          </Accordion>
        )}
      </div>
    </Card>
  )
}

// ─── Step 3: Contacts ─────────────────────────────────────────────────────────
function Step3({ data }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  if (!data) return null
  const { issues, summary } = data

  const FILTERS = [
    { key:'all',                   label:'All issues' },
    { key:'EMAIL_REPAIR',          label:'Email repair' },
    { key:'MISSING_PERSONA',       label:'Missing persona' },
    { key:'MISSING_PRIMARY_REP',   label:'Missing rep' },
    { key:'MISSING_PHONE',         label:'Missing phone' },
    { key:'MISSING_PRIMARY_ENTITY',label:'Missing entity' },
    { key:'DOMAIN_MISMATCH',       label:'Domain mismatch' },
  ]

  const filtered = issues.filter(i => {
    if (filter !== 'all' && i.type !== filter) return false
    if (search && !i.contactName?.toLowerCase().includes(search.toLowerCase()) &&
        !i.companyName?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const typeLabels = {
    EMAIL_REPAIR:'Email repair needed',
    MISSING_PERSONA:'No target persona',
    MISSING_PRIMARY_REP:'No primary rep',
    MISSING_PHONE:'No phone',
    MISSING_PRIMARY_ENTITY:'No primary entity',
    DOMAIN_MISMATCH:'Domain mismatch',
  }

  const typeColors = {
    EMAIL_REPAIR:C.red, MISSING_PERSONA:C.amber,
    MISSING_PRIMARY_REP:C.amber, MISSING_PHONE:C.sub,
    MISSING_PRIMARY_ENTITY:C.sub, DOMAIN_MISMATCH:C.sub,
  }

  return (
    <Card>
      <CardHead right={<Pill color={C.amber}>{summary.total.toLocaleString()} issues</Pill>}>
        Step 4 — Contact Data Quality
      </CardHead>

      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>
        <SummaryGrid items={[
          { label:'Email Repair',    value:summary.emailRepair,       color:summary.emailRepair>0?C.red:C.green },
          { label:'No Persona',      value:summary.missingPersona,    color:summary.missingPersona>0?C.amber:C.green },
          { label:'No Primary Rep',  value:summary.missingPrimaryRep, color:summary.missingPrimaryRep>0?C.amber:C.green },
          { label:'No Phone',        value:summary.missingPhone,      color:C.sub },
          { label:'No Entity',       value:summary.missingEntity,     color:C.sub },
          { label:'Auto-Fixable',    value:summary.withProposedValue, color:C.accent },
        ]} />

        <Callout type="info">
          {summary.withProposedValue.toLocaleString()} of {summary.total.toLocaleString()} issues have an automatic proposed fix
          and will be included in the Contact Issues export ready to import.
          The remaining {(summary.total - summary.withProposedValue).toLocaleString()} require manual assignment (persona, entity).
        </Callout>

        {/* Filters + search */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ fontSize:11, padding:'4px 11px', borderRadius:20, cursor:'pointer',
                border:`1px solid ${filter===f.key?C.accent:C.border}`,
                background:filter===f.key?`${C.accent}18`:'transparent',
                color:filter===f.key?C.accent:C.sub }}>
              {f.label}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or company…"
            style={{ flex:1, minWidth:180, padding:'5px 10px', background:C.card,
              border:`1px solid ${C.border}`, borderRadius:6, fontSize:11, color:C.text, outline:'none' }} />
        </div>

        {/* Contact table */}
        <div style={{ border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:C.panel }}>
                {['Contact','Title','Company','Issue','Proposed Fix'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', fontSize:9, fontWeight:700,
                    textTransform:'uppercase', letterSpacing:'.06em', color:C.muted,
                    borderBottom:`1px solid ${C.border}`, textAlign:'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0,100).map((issue,i) => (
                <tr key={issue.issueId} style={{ borderBottom:`1px solid ${C.border}`, cursor:'pointer' }}
                  onClick={() => window.open(issue.url,'_blank')}
                  onMouseEnter={e => e.currentTarget.style.background=C.card}
                  onMouseLeave={e => e.currentTarget.style.background=''}>
                  <td style={{ padding:'8px 12px', fontWeight:500 }}>
                    <a href={issue.url} target="_blank" rel="noopener noreferrer"
                      style={{ color:C.accent }} onClick={e=>e.stopPropagation()}>
                      {issue.contactName||issue.contactEmail||'—'}
                    </a>
                  </td>
                  <td style={{ padding:'8px 12px', color:C.sub, maxWidth:160,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                    title={issue.contactTitle}>{issue.contactTitle||'—'}</td>
                  <td style={{ padding:'8px 12px', color:C.sub }}>{issue.companyName}</td>
                  <td style={{ padding:'8px 12px' }}>
                    <span style={{ fontSize:10, fontWeight:600,
                      color:typeColors[issue.type]||C.sub }}>
                      {typeLabels[issue.type]||issue.type}
                    </span>
                  </td>
                  <td style={{ padding:'8px 12px' }}>
                    {issue.proposedValue
                      ? <span style={{ color:C.green }}>
                          <span style={{ fontSize:9, color:C.muted, fontFamily:'IBM Plex Mono' }}>{issue.field}: </span>
                          {issue.proposedValue}
                        </span>
                      : <span style={{ color:C.muted, fontStyle:'italic' }}>needs manual review</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <div style={{ padding:'9px 12px', fontSize:11, color:C.muted, textAlign:'center',
              background:C.panel, borderTop:`1px solid ${C.border}` }}>
              Showing 100 of {filtered.length.toLocaleString()} — download the full Contact Issues CSV for the complete list
            </div>
          )}
          {filtered.length === 0 && (
            <div style={{ padding:'20px', color:C.sub, textAlign:'center' }}>No issues match this filter</div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── Step 4: Stale ────────────────────────────────────────────────────────────
function Step4({ data }) {
  if (!data) return null
  const { records, summary } = data

  const statusColor = { NEVER_CONTACTED:C.red, STALE_1YEAR:C.red, STALE_6MONTHS:C.amber, STALE_90DAYS:C.amber, ACTIVE:C.green }
  const statusLabel = { NEVER_CONTACTED:'Never contacted', STALE_1YEAR:'Over a year', STALE_6MONTHS:'6+ months', STALE_90DAYS:'90+ days', ACTIVE:'Active' }

  const concerning = records.filter(r => r.status !== 'ACTIVE')

  return (
    <Card>
      <CardHead right={
        concerning.length > 0
          ? <Pill color={C.amber}>{concerning.length} accounts need attention</Pill>
          : <Pill color={C.green}>All active</Pill>
      }>Step 5 — Activity & Staleness</CardHead>

      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>
        <SummaryGrid items={[
          { label:'Never Contacted', value:summary.neverContacted, color:summary.neverContacted>0?C.red:C.green },
          { label:'Stale 1yr+',      value:summary.stale1Year,     color:summary.stale1Year>0?C.red:C.green },
          { label:'Stale 6mo+',      value:summary.stale6Months,   color:summary.stale6Months>0?C.amber:C.green },
          { label:'Stale 90d+',      value:summary.stale90Days,    color:summary.stale90Days>0?C.amber:C.green },
          { label:'Active',          value:summary.active,         color:C.green },
        ]} />

        {concerning.length > 0 && (
          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>Accounts needing attention</div>
            <div style={{ border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ background:C.panel }}>
                    {['Account','Tier','BDR','Contacts','Last activity','Status'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', fontSize:9, fontWeight:700,
                        textTransform:'uppercase', letterSpacing:'.06em', color:C.muted,
                        borderBottom:`1px solid ${C.border}`, textAlign:'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {concerning.map((r,i) => (
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background=C.card}
                      onMouseLeave={e => e.currentTarget.style.background=''}>
                      <td style={{ padding:'8px 12px', fontWeight:500 }}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          style={{ color:C.accent }}>{r.name}</a>
                      </td>
                      <td style={{ padding:'8px 12px', color:C.sub, fontFamily:'IBM Plex Mono', fontSize:10 }}>{r.tier?.replace('GOLD - ','')}</td>
                      <td style={{ padding:'8px 12px', color:C.sub }}>{r.assignedBdr||'—'}</td>
                      <td style={{ padding:'8px 12px' }}>{r.contacts}</td>
                      <td style={{ padding:'8px 12px', color:C.sub }}>
                        {r.lastActivity ? new Date(r.lastActivity).toLocaleDateString() : 'Never'}
                        {r.daysSince != null && <span style={{ color:C.muted, marginLeft:6 }}>({r.daysSince}d ago)</span>}
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <span style={{ fontSize:10, fontWeight:600, color:statusColor[r.status] }}>
                          {statusLabel[r.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {concerning.length === 0 && (
          <Callout type="success">✓ All Gold accounts have had activity within the last 90 days.</Callout>
        )}
      </div>
    </Card>
  )
}

// ─── Export Panel ─────────────────────────────────────────────────────────────
function ExportPanel({ scanResult }) {
  const [exporting, setExporting] = useState({})

  const doExport = async (type, filename) => {
    setExporting(p => ({...p,[type]:true}))
    try {
      const res = await fetch('/api/dq-export', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type, scanResult }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = filename; a.click()
    } catch(e) { alert('Export error: ' + e.message) }
    finally { setExporting(p => ({...p,[type]:false})) }
  }

  const d = new Date().toISOString().slice(0,10)
  const EXPORTS = [
    { type:'field-updates', icon:'📥', label:'Field Updates',
      desc:'Imports directly into HubSpot. Covers company_type, parent_system_name, primary_outreach_rep, vendor tags, and all auto-fixable field updates.',
      action:'HubSpot → Settings → Import → select file', primary:true, filename:`cipher-dq-field-updates-${d}.csv` },
    { type:'merge-list', icon:'🔀', label:'Merge List',
      desc:'Duplicate company pairs to merge. Open each in HubSpot → Actions → Merge.',
      action:'Manual action in HubSpot UI', filename:`cipher-dq-merge-list-${d}.csv` },
    { type:'parent-child', icon:'🌳', label:'Parent/Child Associations',
      desc:'Subsidiaries needing a parent company set. Open each record → Company Information → Parent Company.',
      action:'Manual action in HubSpot UI', filename:`cipher-dq-parent-child-${d}.csv` },
    { type:'vendor-list', icon:'🚫', label:'Vendor Review List',
      desc:'Companies and contacts flagged as vendors. Review before tagging — included in Field Updates once confirmed.',
      action:'Review then import', filename:`cipher-dq-vendors-${d}.csv` },
    { type:'phase3-full', icon:'👤', label:'Contact Issues',
      desc:'All contact data issues — missing personas, reps, phones, emails, domain mismatches.',
      action:'Review + import to HubSpot', filename:`cipher-dq-contacts-${d}.csv` },
    { type:'email-repair', icon:'📧', label:'Email Repair Targets',
      desc:'Contacts with bounced or missing emails. Priority list for ZoomInfo lookup.',
      action:'ZoomInfo enrichment or manual research', filename:`cipher-dq-email-repair-${d}.csv` },
    { type:'stale', icon:'🕰', label:'Stale Records',
      desc:'Accounts sorted by days since last activity.',
      action:'Review and assign follow-up actions', filename:`cipher-dq-stale-${d}.csv` },
  ]

  return (
    <Card>
      <CardHead>Downloads & Exports</CardHead>
      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
        <Callout type="info">
          The Field Updates file is the only one that imports directly into HubSpot.
          Everything else (merges, parent/child associations) requires a manual action in HubSpot.
          Review all files before taking action.
        </Callout>
        {EXPORTS.map(exp => (
          <div key={exp.type} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px',
            background:C.card, border:`1px solid ${exp.primary?C.accent:C.border}`, borderRadius:9 }}>
            <span style={{ fontSize:22, flexShrink:0 }}>{exp.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{exp.label}</div>
              <div style={{ fontSize:11, color:C.sub }}>{exp.desc}</div>
              <div style={{ fontSize:10, color:exp.primary?C.accent:C.muted, marginTop:4 }}>
                {exp.action}
              </div>
            </div>
            <Btn variant={exp.primary?'primary':'default'} disabled={!scanResult||exporting[exp.type]}
              onClick={() => doExport(exp.type, exp.filename)}>
              {exporting[exp.type]?'Exporting…':'Download'}
            </Btn>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const [scanning, setScanning]         = useState(false)
  const [scanResult, setScanResult]     = useState(null)
  const [error, setError]               = useState(null)
  const [approved, setApproved]         = useState({})
  const [activeStep, setActiveStep]     = useState('overview')
  const [progress, setProgress]         = useState('')
  const [scope, setScope]               = useState('gold')

  const runScan = useCallback(async () => {
    setScanning(true); setError(null); setScanResult(null); setApproved({})
    try {
      setProgress('Connecting to HubSpot…')
      const tRes = await fetch(`/api/dq-token?userId=${userId}`)
      if (!tRes.ok) { const e = await tRes.json(); throw new Error(e.error||'Token error — sign into Cipher first') }
      const { token } = await tRes.json()

      setProgress(scope==='gold' ? 'Scanning Gold accounts…' : 'Scanning full CRM — this may take a minute…')
      const sRes = await fetch(`/api/dq-scan?scope=${scope}`, { headers:{'x-hs-token':token} })
      if (!sRes.ok) { const e = await sRes.json(); throw new Error(e.error||'Scan failed') }

      setProgress('Analyzing results…')
      const data = await sRes.json()
      setScanResult(data); setActiveStep('overview'); setProgress('')
    } catch(e) { setError(e.message); setProgress('') }
    finally { setScanning(false) }
  }, [userId, scope])

  const handleApprove = useCallback((id, item) => {
    setApproved(p => ({...p,[id]:item}))
  }, [])

  if (!isLoaded) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:C.muted }}>Loading…</div>
  if (!isSignedIn) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh' }}><SignIn /></div>

  const p0 = scanResult?.phase0?.summary
  const p1 = scanResult?.phase1?.summary
  const p2 = scanResult?.phase2?.summary
  const p3 = scanResult?.phase3?.summary
  const p4 = scanResult?.phase4?.summary

  const STEPS = [
    { key:'overview',  label:'Overview' },
    { key:'0',  label:'Pre-Filter',  count:p0?.totalExcluded },
    { key:'1',  label:'Duplicates',  count:p1?.duplicateNames },
    { key:'2',  label:'Hierarchy',   count:p2?.total },
    { key:'3',  label:'Contacts',    count:p3?.total },
    { key:'4',  label:'Stale',       count:(p4?.neverContacted||0)+(p4?.stale1Year||0) },
    { key:'export', label:'Export' },
  ]

  return (
    <>
      <style>{css}</style>
      <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>

        {/* Header */}
        <div style={{ background:C.panel, borderBottom:`1px solid ${C.border}`, padding:'0 24px',
          display:'flex', alignItems:'center', gap:16, height:52, position:'sticky', top:0, zIndex:100 }}>
          <span style={{ fontSize:13, fontWeight:700, fontFamily:'IBM Plex Mono', color:C.accent, letterSpacing:'.04em' }}>CIPHER</span>
          <span style={{ color:C.border }}>|</span>
          <span style={{ fontSize:11, fontWeight:500, color:C.sub, textTransform:'uppercase', letterSpacing:'.08em' }}>Data Quality</span>
          <div style={{ flex:1 }} />
          {scanResult && (
            <span style={{ fontSize:11, color:C.muted, fontFamily:'IBM Plex Mono' }}>
              {scanResult.activeCompanies} active · {scanResult.totalCompanies} total
              {scanResult.totalContacts ? ` · ${scanResult.totalContacts.toLocaleString()} contacts` : ''}
              · {new Date(scanResult.scannedAt).toLocaleTimeString()}
            </span>
          )}
          <div style={{ display:'flex', background:C.card, border:`1px solid ${C.border}`, borderRadius:6, padding:2, gap:1 }}>
            {[{v:'gold',l:'Gold accounts'},{v:'all',l:'Full CRM'}].map(({v,l}) => (
              <button key={v} onClick={() => setScope(v)}
                style={{ padding:'4px 12px', border:'none', borderRadius:4, fontSize:11, cursor:'pointer',
                  background:scope===v?C.borderHi:'transparent', color:scope===v?C.text:C.sub,
                  fontWeight:scope===v?600:400 }}>{l}</button>
            ))}
          </div>
          <Btn variant={scanning?'ghost':'primary'} disabled={scanning} onClick={runScan}>
            {scanning ? progress||'Scanning…' : scanResult ? '↻ Re-scan' : 'Run Scan'}
          </Btn>
        </div>

        {/* Step nav */}
        {scanResult && (
          <div style={{ background:C.panel, borderBottom:`1px solid ${C.border}`,
            padding:'0 24px', display:'flex', gap:0, overflowX:'auto' }}>
            {STEPS.map(step => (
              <button key={step.key} onClick={() => setActiveStep(step.key)}
                style={{ padding:'10px 16px', background:'none', border:'none', cursor:'pointer',
                  fontSize:12, fontWeight:activeStep===step.key?600:400, whiteSpace:'nowrap',
                  color:activeStep===step.key?C.text:C.sub,
                  borderBottom:activeStep===step.key?`2px solid ${C.accent}`:'2px solid transparent',
                  display:'flex', alignItems:'center', gap:6 }}>
                {step.label}
                {step.count > 0 && (
                  <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10,
                    background:`${C.accent}22`, color:C.accent }}>{step.count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ flex:1, padding:24, display:'flex', flexDirection:'column', gap:16,
          maxWidth:1300, margin:'0 auto', width:'100%' }}>

          {/* Empty state */}
          {!scanResult && !scanning && !error && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', flex:1, gap:24, paddingTop:60 }}>
              <div style={{ textAlign:'center', maxWidth:500 }}>
                <div style={{ fontSize:24, fontWeight:700, marginBottom:10, letterSpacing:'-.02em' }}>
                  Cipher Data Quality
                </div>
                <div style={{ fontSize:14, color:C.sub, lineHeight:1.7 }}>
                  Scans your HubSpot companies and contacts, identifies data issues,
                  and produces clean import-ready files. Read-only — nothing changes
                  in HubSpot until you import a file yourself.
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, maxWidth:760 }}>
                {[
                  { icon:'🚫', step:'Step 1', desc:'Pre-filter vendors & retired contacts' },
                  { icon:'🔁', step:'Step 2', desc:'Find and flag duplicate companies' },
                  { icon:'🌳', step:'Step 3', desc:'Map parent/subsidiary hierarchy' },
                  { icon:'👤', step:'Step 4', desc:'Fix contact data & missing fields' },
                  { icon:'🕰', step:'Step 5', desc:'Flag stale & never-contacted accounts' },
                ].map(s => (
                  <div key={s.step} style={{ padding:'16px 14px', background:C.card,
                    border:`1px solid ${C.border}`, borderRadius:10, textAlign:'center' }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>{s.icon}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:4, textTransform:'uppercase', letterSpacing:'.04em' }}>{s.step}</div>
                    <div style={{ fontSize:11, color:C.sub, lineHeight:1.5 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <div style={{ display:'flex', background:C.card, border:`1px solid ${C.border}`, borderRadius:6, padding:2 }}>
                  {[{v:'gold',l:'Start with Gold accounts'},{v:'all',l:'Full CRM'}].map(({v,l}) => (
                    <button key={v} onClick={() => setScope(v)}
                      style={{ padding:'6px 16px', border:'none', borderRadius:4, fontSize:12, cursor:'pointer',
                        background:scope===v?C.borderHi:'transparent', color:scope===v?C.text:C.sub,
                        fontWeight:scope===v?600:400 }}>{l}</button>
                  ))}
                </div>
                <Btn variant="primary" onClick={runScan}>Run Scan →</Btn>
              </div>
            </div>
          )}

          {error && <Callout type="error">✗ {error}</Callout>}

          {scanning && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', flex:1, gap:14, paddingTop:60 }}>
              <div style={{ fontSize:26, opacity:.7 }}>⟳</div>
              <div style={{ fontSize:14, fontWeight:500 }}>{progress||'Scanning…'}</div>
              <div style={{ fontSize:12, color:C.sub }}>
                {scope==='all' ? 'Scanning full CRM — 60–90 seconds.' : 'Scanning Gold accounts — 30–45 seconds.'}
              </div>
            </div>
          )}

          {scanResult && !scanning && (
            <>
              {activeStep === 'overview' && (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  {/* Summary bar */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:1,
                    background:C.border, borderRadius:10, overflow:'hidden' }}>
                    {[
                      { label:'Companies', value:scanResult.totalCompanies },
                      { label:'Active', value:scanResult.activeCompanies, color:C.green },
                      { label:'Contacts', value:(scanResult.totalContacts||0).toLocaleString() },
                      { label:'Dedup issues', value:p1?.duplicateNames||0, color:(p1?.duplicateNames||0)>0?C.amber:C.green },
                      { label:'Contact issues', value:(p3?.total||0).toLocaleString(), color:(p3?.total||0)>0?C.amber:C.green },
                      { label:'Stale accounts', value:(p4?.neverContacted||0)+(p4?.stale1Year||0), color:((p4?.neverContacted||0)+(p4?.stale1Year||0))>0?C.red:C.green },
                    ].map((s,i) => (
                      <div key={i} style={{ background:C.card, padding:'14px 16px', textAlign:'center' }}>
                        <div style={{ fontSize:22, fontWeight:700, fontFamily:'IBM Plex Mono',
                          color:s.color||C.text, marginBottom:4 }}>{s.value}</div>
                        <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:'.04em' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <Step0 data={scanResult.phase0} />
                  <Step1 data={scanResult.phase1} approved={approved} onApprove={handleApprove} />
                  <Step2 data={scanResult.phase2} approved={approved} onApprove={handleApprove} companies={scanResult.companies||[]} />
                  <Step3 data={scanResult.phase3} />
                  <Step4 data={scanResult.phase4} />
                  <ExportPanel scanResult={scanResult} />
                </div>
              )}
              {activeStep === '0' && <Step0 data={scanResult.phase0} />}
              {activeStep === '1' && <Step1 data={scanResult.phase1} approved={approved} onApprove={handleApprove} />}
              {activeStep === '2' && <Step2 data={scanResult.phase2} approved={approved} onApprove={handleApprove} companies={scanResult.companies||[]} />}
              {activeStep === '3' && <Step3 data={scanResult.phase3} />}
              {activeStep === '4' && <Step4 data={scanResult.phase4} />}
              {activeStep === 'export' && <ExportPanel scanResult={scanResult} />}
            </>
          )}
        </div>
      </div>
    </>
  )
}
