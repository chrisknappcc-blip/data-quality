import { useState, useCallback } from 'react'
import { useAuth, SignIn } from '@clerk/clerk-react'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:'#0d0f12', panel:'#13161b', card:'#191d24', border:'#242830',
  text:'#e8eaf0', sub:'#8b91a0', muted:'#4a5060',
  accent:'#4f8ef7', green:'#34c97a', amber:'#f5a623', red:'#f05252', purple:'#a78bfa',
}

const css = `
* { box-sizing:border-box; margin:0; padding:0; }
body { background:${C.bg}; color:${C.text}; font-family:'IBM Plex Sans',sans-serif; font-size:13px; }
::-webkit-scrollbar { width:6px; height:6px; }
::-webkit-scrollbar-track { background:${C.panel}; }
::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
a { color:${C.accent}; text-decoration:none; }
button { font-family:inherit; cursor:pointer; }
input,select { font-family:inherit; }
`

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sev = {
  high:   { color:C.red,   bg:'rgba(240,82,82,.1)',   border:'rgba(240,82,82,.25)' },
  medium: { color:C.amber, bg:'rgba(245,166,35,.1)',  border:'rgba(245,166,35,.25)' },
  low:    { color:C.sub,   bg:'rgba(255,255,255,.04)',border:C.border },
}

function Badge({ children, color, bg, border }) {
  return <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em',
    padding:'2px 6px', borderRadius:3, background:bg, color, border:`1px solid ${border}`, flexShrink:0 }}>{children}</span>
}

function SevBadge({ severity }) {
  const s = sev[severity] || sev.low
  return <Badge color={s.color} bg={s.bg} border={s.border}>{severity}</Badge>
}

function ConfBadge({ confidence }) {
  const color = confidence === 'high' ? C.green : C.amber
  const bg    = confidence === 'high' ? 'rgba(52,201,122,.1)' : 'rgba(245,166,35,.1)'
  const bord  = confidence === 'high' ? 'rgba(52,201,122,.25)' : 'rgba(245,166,35,.25)'
  return <Badge color={color} bg={bg} border={bord}>{confidence}</Badge>
}

function Btn({ children, onClick, variant='default', disabled, small }) {
  const v = {
    default: { background:C.card, border:`1px solid ${C.border}`, color:C.sub },
    primary: { background:C.accent, border:'none', color:'#fff' },
    green:   { background:'rgba(52,201,122,.15)', border:'1px solid rgba(52,201,122,.3)', color:C.green },
    amber:   { background:'rgba(245,166,35,.1)', border:'1px solid rgba(245,166,35,.3)', color:C.amber },
    ghost:   { background:'none', border:`1px solid ${C.border}`, color:C.sub },
  }
  const s = v[variant] || v.default
  return (
    <button disabled={disabled} onClick={onClick}
      style={{ ...s, padding:small?'4px 10px':'7px 14px', borderRadius:6,
        fontSize:small?11:12, fontWeight:500, opacity:disabled?.5:1, transition:'opacity .15s' }}>
      {children}
    </button>
  )
}

function Panel({ children, style }) {
  return <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden', ...style }}>{children}</div>
}

function PHead({ children, right }) {
  return (
    <div style={{ padding:'9px 14px', borderBottom:`1px solid ${C.border}`, background:C.card,
      display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <span style={{ fontSize:10, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:C.sub }}>{children}</span>
      {right && <div style={{ display:'flex', gap:8, alignItems:'center' }}>{right}</div>}
    </div>
  )
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'12px 14px' }}>
      <div style={{ fontSize:22, fontWeight:700, fontFamily:'IBM Plex Mono', color:color||C.text, marginBottom:4 }}>{value??'—'}</div>
      <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</div>
    </div>
  )
}

function InfoBox({ children, color }) {
  color = color || C.accent
  return (
    <div style={{ fontSize:11, padding:'8px 12px', background:`${color}14`,
      border:`1px solid ${color}33`, borderRadius:6, color, lineHeight:1.5 }}>
      ⓘ {children}
    </div>
  )
}

function ExpandRow({ header, children, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
        cursor:'pointer', userSelect:'none' }} onClick={() => setOpen(v => !v)}>
        {header}
        <span style={{ fontSize:10, color:C.accent, marginLeft:'auto' }}>{open?'▲':'▼'}</span>
      </div>
      {open && <div style={{ padding:'0 14px 14px' }}>{children}</div>}
    </div>
  )
}

// ─── Phase 0 ─────────────────────────────────────────────────────────────────
function Phase0Panel({ data }) {
  if (!data) return null
  const { excludedCompanies, excludedContacts, emailRepairTargets, summary } = data
  const needsTag = excludedCompanies.filter(c => c.flaggedForTag)

  return (
    <Panel>
      <PHead right={<span style={{ fontSize:11, color:C.sub }}>{summary.totalExcluded} records excluded from enrichment</span>}>
        Phase 0 — Pre-Filter
      </PHead>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, padding:12 }}>
        <KpiCard label="Vendor Companies"   value={summary.vendorCompanies}    color={C.amber} />
        <KpiCard label="Needs Vendor Tag"   value={summary.needsVendorTag}     color={C.amber} />
        <KpiCard label="Excluded Contacts"  value={summary.excludedContacts}   color={C.amber} />
        <KpiCard label="Email Repair"       value={summary.emailRepairTargets} color={C.red} />
        <KpiCard label="Total Excluded"     value={summary.totalExcluded}      color={C.sub} />
      </div>

      {needsTag.length > 0 && (
        <div style={{ padding:'0 12px 12px' }}>
          <InfoBox color={C.amber}>
            {needsTag.length} companies detected as vendors but not yet tagged in HubSpot.
            Export the Vendor List CSV and review — import to tag them as Vendor/Supplier before enrichment.
          </InfoBox>
          <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
            {needsTag.slice(0,10).map((co,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 10px',
                background:C.card, borderRadius:6, border:`1px solid ${C.border}` }}>
                <span style={{ flex:1, fontSize:12 }}>{co.name}</span>
                <span style={{ fontSize:10, color:C.sub }}>{co.reason}</span>
                <a href={co.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:10 }}>Open →</a>
              </div>
            ))}
            {needsTag.length > 10 && <div style={{ fontSize:11, color:C.muted, padding:'4px 0' }}>+ {needsTag.length-10} more in export</div>}
          </div>
        </div>
      )}

      {emailRepairTargets.length > 0 && (
        <div style={{ padding:'0 12px 12px' }}>
          <InfoBox color={C.red}>
            {emailRepairTargets.length} contacts have bounced or missing emails — these are repair targets, not exclusions.
            Export the Email Repair CSV to track them for ZoomInfo or web search enrichment.
          </InfoBox>
        </div>
      )}
    </Panel>
  )
}

// ─── Phase 1 ─────────────────────────────────────────────────────────────────
function Phase1Panel({ data, approved, onApprove }) {
  if (!data) return null
  const { issues, summary, analyzedCompanies } = data

  return (
    <Panel>
      <PHead right={<span style={{ fontSize:11, color:C.sub }}>{analyzedCompanies} companies analyzed · {issues.length} issues</span>}>
        Phase 1 — Company Dedup + Domain Cleanup
      </PHead>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, padding:12 }}>
        <KpiCard label="Duplicate Names"   value={summary.duplicateNames}  color={summary.duplicateNames>0?C.red:C.green} />
        <KpiCard label="Same Domain"       value={summary.sameDomain}      color={summary.sameDomain>0?C.amber:C.green} />
        <KpiCard label="Missing Domain"    value={summary.missingDomain}   color={summary.missingDomain>0?C.amber:C.green} />
        <KpiCard label="Manual Merges"     value={summary.mergesRequired}  color={summary.mergesRequired>0?C.red:C.green} />
      </div>
      {issues.length === 0
        ? <div style={{ padding:'16px 14px', color:C.sub, textAlign:'center' }}>✓ No issues found</div>
        : issues.map((issue, i) => (
          <div key={issue.issueId} style={{ borderTop:`1px solid ${C.border}`,
            background:approved[issue.issueId]?'rgba(52,201,122,.04)':'transparent' }}>
            <ExpandRow header={
              <>
                <SevBadge severity={issue.severity} />
                <span style={{ fontSize:12, fontWeight:500, flex:1 }}>{issue.label}</span>
                <span style={{ fontSize:10, color:C.muted }}>{issue.records.length} record{issue.records.length>1?'s':''}</span>
              </>
            }>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <p style={{ fontSize:11, color:C.sub }}>{issue.description}</p>
                {issue.records.map((rec,j) => (
                  <div key={j} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
                    background:C.card, borderRadius:6, border:`1px solid ${C.border}` }}>
                    <div style={{ flex:1 }}>
                      <a href={rec.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight:500 }}>{rec.name}</a>
                      <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{rec.tier} · {rec.domain||'no domain'} · {rec.contacts} contacts</div>
                    </div>
                    {j===0 && issue.action==='MERGE_MANUAL' && <Badge color={C.green} bg="rgba(52,201,122,.1)" border="rgba(52,201,122,.25)">KEEP</Badge>}
                    {j>0  && issue.action==='MERGE_MANUAL' && <Badge color={C.red} bg="rgba(240,82,82,.1)" border="rgba(240,82,82,.25)">MERGE INTO PRIMARY</Badge>}
                  </div>
                ))}
                {issue.manualNote && <InfoBox>{issue.manualNote}</InfoBox>}
                <div style={{ display:'flex', gap:8 }}>
                  {!approved[issue.issueId]
                    ? <Btn small variant="green" onClick={() => onApprove(issue.issueId, issue)}>Mark Reviewed ✓</Btn>
                    : <span style={{ fontSize:11, color:C.green }}>✓ Reviewed</span>
                  }
                  <Btn small onClick={() => window.open(issue.records[0].url,'_blank')}>Open in HubSpot →</Btn>
                </div>
              </div>
            </ExpandRow>
          </div>
        ))
      }
    </Panel>
  )
}

// ─── Phase 2 ─────────────────────────────────────────────────────────────────
function Phase2Panel({ data, approved, onApprove }) {
  if (!data) return null
  const { proposals, summary, analyzedCompanies } = data

  return (
    <Panel>
      <PHead right={<span style={{ fontSize:11, color:C.sub }}>{analyzedCompanies} analyzed · {proposals.length} proposals</span>}>
        Phase 2 — Parent/Subsidiary Hierarchy Mapping
      </PHead>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, padding:12 }}>
        <KpiCard label="Total Proposals"    value={summary.total}              />
        <KpiCard label="High Confidence"    value={summary.highConfidence}     color={C.green} />
        <KpiCard label="CSV Exportable"     value={summary.csvExportable}      color={C.accent} />
        <KpiCard label="Need Association"   value={summary.requireAssociation} color={C.amber} />
      </div>
      {summary.requireAssociation > 0 && (
        <div style={{ padding:'0 12px 12px' }}>
          <InfoBox color={C.purple}>
            {summary.requireAssociation} companies need parent/child associations set in HubSpot UI after importing CSV.
            Export the Parent/Child CSV for the list of manual actions.
          </InfoBox>
        </div>
      )}
      {proposals.length === 0
        ? <div style={{ padding:'16px 14px', color:C.sub, textAlign:'center' }}>✓ All companies already have hierarchy assigned</div>
        : proposals.map((p,i) => (
          <div key={p.proposalId} style={{ borderTop:`1px solid ${C.border}`,
            background:approved[p.proposalId]?'rgba(52,201,122,.04)':'transparent' }}>
            <ExpandRow header={
              <>
                <ConfBadge confidence={p.confidence} />
                <span style={{ fontSize:12, fontWeight:500, flex:1 }}>{p.companyName}</span>
                <span style={{ fontSize:10, color:C.muted }}>{p.tier}</span>
              </>
            }>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ fontSize:11, color:C.sub }}>Source: {p.source}</div>
                {p.notes && <InfoBox color={C.amber}>{p.notes}</InfoBox>}
                {(p.fieldUpdates||[]).map((u,j) => (
                  <div key={j} style={{ display:'grid', gridTemplateColumns:'150px 1fr 1fr', gap:8,
                    padding:'7px 10px', background:C.card, borderRadius:6, border:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:11, fontWeight:600, color:C.sub, fontFamily:'IBM Plex Mono' }}>{u.field}</span>
                    <span style={{ fontSize:11, color:C.muted }}><em>current: </em>{u.currentValue||<em>empty</em>}</span>
                    <span style={{ fontSize:11, color:C.green }}><em>proposed: </em>{u.proposedValue}</span>
                  </div>
                ))}
                {p.associationRequired && (
                  <InfoBox color={C.purple}>
                    After importing CSV: open this record in HubSpot → Company Information → Parent Company → set "{p.parentCompanyName}"
                  </InfoBox>
                )}
                <div style={{ display:'flex', gap:8 }}>
                  {!approved[p.proposalId]
                    ? <Btn small variant="green" onClick={() => onApprove(p.proposalId, p)}>Approve ✓</Btn>
                    : <span style={{ fontSize:11, color:C.green }}>✓ Approved</span>
                  }
                  <Btn small onClick={() => window.open(p.url,'_blank')}>Open in HubSpot →</Btn>
                </div>
              </div>
            </ExpandRow>
          </div>
        ))
      }
    </Panel>
  )
}

// ─── Phase 3 ─────────────────────────────────────────────────────────────────
function Phase3Panel({ data }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  if (!data) return null
  const { issues, summary } = data

  const FILTERS = [
    { key:'all',                  label:'All' },
    { key:'EMAIL_REPAIR',         label:'Email Repair' },
    { key:'MISSING_PERSONA',      label:'Missing Persona' },
    { key:'MISSING_PRIMARY_REP',  label:'Missing Rep' },
    { key:'MISSING_PHONE',        label:'Missing Phone' },
    { key:'MISSING_PRIMARY_ENTITY',label:'Missing Entity' },
    { key:'DOMAIN_MISMATCH',      label:'Domain Mismatch' },
  ]

  const filtered = issues.filter(i => {
    if (filter !== 'all' && i.type !== filter) return false
    if (search && !i.contactName?.toLowerCase().includes(search.toLowerCase()) &&
        !i.companyName?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const typeColor = {
    EMAIL_REPAIR:'#f05252', MISSING_PERSONA:'#f5a623',
    MISSING_PRIMARY_REP:'#f5a623', MISSING_PHONE:'#8b91a0',
    MISSING_PRIMARY_ENTITY:'#8b91a0', DOMAIN_MISMATCH:'#8b91a0',
  }

  return (
    <Panel>
      <PHead right={<span style={{ fontSize:11, color:C.sub }}>{summary.total} issues</span>}>
        Phase 3 — Contact Data Fixes
      </PHead>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, padding:12 }}>
        <KpiCard label="Email Repair"    value={summary.emailRepair}       color={summary.emailRepair>0?C.red:C.green} />
        <KpiCard label="Missing Persona" value={summary.missingPersona}    color={summary.missingPersona>0?C.amber:C.green} />
        <KpiCard label="Missing Rep"     value={summary.missingPrimaryRep} color={summary.missingPrimaryRep>0?C.amber:C.green} />
        <KpiCard label="Missing Phone"   value={summary.missingPhone}      color={C.sub} />
        <KpiCard label="Missing Entity"  value={summary.missingEntity}     color={C.sub} />
        <KpiCard label="Auto-Fixable"    value={summary.withProposedValue} color={C.accent} />
      </div>
      <div style={{ padding:'0 12px 10px', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ fontSize:11, padding:'4px 10px', borderRadius:4, cursor:'pointer',
              border:`1px solid ${filter===f.key?C.accent:C.border}`,
              background:filter===f.key?'rgba(79,142,247,.12)':'transparent',
              color:filter===f.key?C.accent:C.sub }}>
            {f.label}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search contact or company…"
          style={{ flex:1, minWidth:150, padding:'4px 8px', background:C.card,
            border:`1px solid ${C.border}`, borderRadius:4, fontSize:11, color:C.text, outline:'none' }} />
      </div>
      <div style={{ maxHeight:400, overflowY:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead>
            <tr style={{ background:C.card }}>
              {['Contact','Title','Company','Issue','Proposed Fix','Note'].map(h => (
                <th key={h} style={{ padding:'6px 12px', fontSize:9, fontWeight:600, textTransform:'uppercase',
                  letterSpacing:'.05em', color:C.muted, borderBottom:`1px solid ${C.border}`, textAlign:'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0,100).map((issue,i) => (
              <tr key={issue.issueId} style={{ borderBottom:`1px solid ${C.border}` }}
                onMouseEnter={e => e.currentTarget.style.background=C.card}
                onMouseLeave={e => e.currentTarget.style.background=''}>
                <td style={{ padding:'7px 12px', fontWeight:500 }}>
                  <a href={issue.url} target="_blank" rel="noopener noreferrer" style={{ color:C.accent }}>
                    {issue.contactName||issue.contactEmail||'—'}
                  </a>
                </td>
                <td style={{ padding:'7px 12px', color:C.sub }}>{issue.contactTitle||'—'}</td>
                <td style={{ padding:'7px 12px', color:C.sub }}>{issue.companyName}</td>
                <td style={{ padding:'7px 12px' }}>
                  <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', color:typeColor[issue.type]||C.sub }}>
                    {issue.type.replace(/_/g,' ')}
                  </span>
                </td>
                <td style={{ padding:'7px 12px', color:issue.proposedValue?C.green:C.muted }}>
                  {issue.proposedValue
                    ? <><span style={{ fontSize:9, color:C.muted, fontFamily:'IBM Plex Mono' }}>{issue.field}: </span>{issue.proposedValue}</>
                    : <em style={{ color:C.muted }}>manual</em>
                  }
                </td>
                <td style={{ padding:'7px 12px', color:C.muted, maxWidth:200, overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={issue.note}>{issue.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <div style={{ padding:'8px 14px', fontSize:11, color:C.muted, textAlign:'center' }}>
            Showing 100 of {filtered.length} — export CSV for full list
          </div>
        )}
        {filtered.length === 0 && (
          <div style={{ padding:'16px', color:C.sub, textAlign:'center' }}>No issues match filter</div>
        )}
      </div>
    </Panel>
  )
}

// ─── Phase 4 ─────────────────────────────────────────────────────────────────
function Phase4Panel({ data }) {
  if (!data) return null
  const { records, summary } = data
  const statusColor = { NEVER_CONTACTED:C.red, STALE_1YEAR:C.red, STALE_6MONTHS:C.amber, STALE_90DAYS:C.amber, ACTIVE:C.green }
  const statusLabel = { NEVER_CONTACTED:'Never', STALE_1YEAR:'1yr+', STALE_6MONTHS:'6mo+', STALE_90DAYS:'90d+', ACTIVE:'Active' }

  return (
    <Panel>
      <PHead right={<span style={{ fontSize:11, color:C.sub }}>{records.length} accounts</span>}>
        Phase 4 — Stale Record Flagging
      </PHead>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, padding:12 }}>
        <KpiCard label="Never Contacted" value={summary.neverContacted} color={C.red} />
        <KpiCard label="Stale 1yr+"      value={summary.stale1Year}     color={C.red} />
        <KpiCard label="Stale 6mo+"      value={summary.stale6Months}   color={C.amber} />
        <KpiCard label="Stale 90d+"      value={summary.stale90Days}    color={C.amber} />
        <KpiCard label="Active"          value={summary.active}         color={C.green} />
      </div>
      <div style={{ maxHeight:400, overflowY:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead>
            <tr style={{ background:C.card }}>
              {['Account','Tier','BDR','Contacts','Days Inactive','Last Activity','Status'].map(h => (
                <th key={h} style={{ padding:'6px 12px', fontSize:9, fontWeight:600, textTransform:'uppercase',
                  letterSpacing:'.05em', color:C.muted, borderBottom:`1px solid ${C.border}`, textAlign:'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r,i) => (
              <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}
                onMouseEnter={e => e.currentTarget.style.background=C.card}
                onMouseLeave={e => e.currentTarget.style.background=''}>
                <td style={{ padding:'7px 12px', fontWeight:500 }}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color:C.accent }}>{r.name}</a>
                </td>
                <td style={{ padding:'7px 12px', color:C.sub, fontFamily:'IBM Plex Mono', fontSize:10 }}>{r.tier}</td>
                <td style={{ padding:'7px 12px', color:C.sub }}>{r.assignedBdr||'—'}</td>
                <td style={{ padding:'7px 12px' }}>{r.contacts}</td>
                <td style={{ padding:'7px 12px', fontFamily:'IBM Plex Mono', fontWeight:600,
                  color:statusColor[r.status] }}>{r.daysSince!=null?`${r.daysSince}d`:'Never'}</td>
                <td style={{ padding:'7px 12px', color:C.muted }}>{r.lastActivity?new Date(r.lastActivity).toLocaleDateString():'—'}</td>
                <td style={{ padding:'7px 12px' }}>
                  <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', color:statusColor[r.status] }}>
                    {statusLabel[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

// ─── Export Panel ─────────────────────────────────────────────────────────────
function ExportPanel({ scanResult }) {
  const [exporting, setExporting] = useState({})

  const doExport = async (type, filename) => {
    setExporting(p => ({ ...p, [type]:true }))
    try {
      const res = await fetch('/api/dq-export', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ type, scanResult }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
    } catch(e) { alert('Export error: ' + e.message) }
    finally { setExporting(p => ({ ...p, [type]:false })) }
  }

  const d = new Date().toISOString().slice(0,10)

  const EXPORTS = [
    { type:'field-updates', label:'Field Updates CSV', icon:'📥',
      desc:'Import directly into HubSpot. Contains company_type, parent_system_name, primary_outreach_rep, vendor tagging, and all other field updates.',
      action:'Import → HubSpot Settings → Import → Companies/Contacts', filename:`cipher-dq-field-updates-${d}.csv`, variant:'primary' },
    { type:'merge-list', label:'Merge List', icon:'🔀',
      desc:'Company pairs to merge manually. Open each in HubSpot → Actions → Merge.',
      action:'Manual: HubSpot UI merge tool', filename:`cipher-dq-merge-list-${d}.csv` },
    { type:'parent-child', label:'Parent/Child Associations', icon:'🌳',
      desc:'Subsidiaries that need a Parent Company set. Open each record in HubSpot → Company Information → Parent Company.',
      action:'Manual: HubSpot UI per record', filename:`cipher-dq-parent-child-${d}.csv` },
    { type:'vendor-list', label:'Vendor Exclusion List', icon:'🚫',
      desc:'Companies and contacts flagged as vendors — review before tagging. Included in Field Updates CSV once confirmed.',
      action:'Review then import', filename:`cipher-dq-vendor-list-${d}.csv` },
    { type:'phase3-full', label:'Contact Issues (Full)', icon:'👤',
      desc:'All Phase 3 contact issues — missing personas, reps, phones, emails, domain mismatches.',
      action:'Review + Import', filename:`cipher-dq-contacts-${d}.csv` },
    { type:'email-repair', label:'Email Repair Targets', icon:'📧',
      desc:'Contacts with bounced or missing emails. Priority list for ZoomInfo enrichment or web search.',
      action:'ZoomInfo lookup or manual research', filename:`cipher-dq-email-repair-${d}.csv` },
    { type:'stale', label:'Stale Records', icon:'🕰',
      desc:'Phase 4 stale accounts sorted by days since activity.',
      action:'Review and action', filename:`cipher-dq-stale-${d}.csv` },
  ]

  return (
    <Panel>
      <PHead>Export Files</PHead>
      <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
        <InfoBox>
          Download all files and review before actioning. The Field Updates CSV is the only one that imports directly into HubSpot.
          Everything else (merges, parent/child associations) requires manual action in HubSpot UI.
        </InfoBox>
        {EXPORTS.map(exp => (
          <div key={exp.type} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px',
            background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
            <span style={{ fontSize:20, flexShrink:0 }}>{exp.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600 }}>{exp.label}</div>
              <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{exp.desc}</div>
              <div style={{ fontSize:10, color:C.accent, marginTop:4 }}>Action: {exp.action}</div>
            </div>
            <Btn variant={exp.variant||'default'} disabled={!scanResult||exporting[exp.type]}
              onClick={() => doExport(exp.type, exp.filename)}>
              {exporting[exp.type]?'Exporting…':'Download CSV'}
            </Btn>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const [scanning, setScanning]   = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [error, setError]         = useState(null)
  const [approved, setApproved]   = useState({})
  const [activePhase, setActivePhase] = useState('overview')
  const [progress, setProgress]   = useState('')
  const [scope, setScope]         = useState('gold')

  const runScan = useCallback(async () => {
    setScanning(true); setError(null); setScanResult(null); setApproved({})
    try {
      setProgress('Getting HubSpot token…')
      const tRes = await fetch(`/api/dq-token?userId=${userId}`)
      if (!tRes.ok) { const e = await tRes.json(); throw new Error(e.error||'Token error — authorize via Cipher first') }
      const { token } = await tRes.json()

      setProgress(scope==='gold' ? 'Fetching Gold accounts…' : 'Fetching all CRM companies (this may take a minute)…')
      const sRes = await fetch(`/api/dq-scan?scope=${scope}`, { headers:{ 'x-hs-token':token } })
      if (!sRes.ok) { const e = await sRes.json(); throw new Error(e.error||'Scan failed') }

      setProgress('Processing results…')
      const data = await sRes.json()
      setScanResult(data)
      setActivePhase('overview')
      setProgress('')
    } catch(e) { setError(e.message); setProgress('') }
    finally { setScanning(false) }
  }, [userId, scope])

  const handleApprove = useCallback((id, item) => {
    setApproved(p => ({ ...p, [id]:item }))
  }, [])

  if (!isLoaded) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:C.muted }}>Loading…</div>
  if (!isSignedIn) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh' }}><SignIn /></div>

  const p0 = scanResult?.phase0?.summary
  const p1 = scanResult?.phase1?.summary
  const p2 = scanResult?.phase2?.summary
  const p3 = scanResult?.phase3?.summary
  const p4 = scanResult?.phase4?.summary

  const PHASES = [
    { key:'overview', label:'Overview' },
    { key:'0', label:'Phase 0 · Pre-Filter', count:p0?.totalExcluded },
    { key:'1', label:'Phase 1 · Dedup',      count:p1?.duplicateNames },
    { key:'2', label:'Phase 2 · Hierarchy',  count:p2?.total },
    { key:'3', label:'Phase 3 · Contacts',   count:p3?.total },
    { key:'4', label:'Phase 4 · Stale',      count:(p4?.neverContacted||0)+(p4?.stale1Year||0) },
    { key:'export', label:'Export' },
  ]

  return (
    <>
      <style>{css}</style>
      <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>

        {/* Header */}
        <div style={{ background:C.panel, borderBottom:`1px solid ${C.border}`, padding:'0 24px',
          display:'flex', alignItems:'center', gap:16, height:52, position:'sticky', top:0, zIndex:100 }}>
          <span style={{ fontSize:13, fontWeight:700, fontFamily:'IBM Plex Mono', color:C.accent }}>CIPHER</span>
          <span style={{ fontSize:11, color:C.border }}>|</span>
          <span style={{ fontSize:11, fontWeight:500, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em' }}>Data Quality</span>
          <div style={{ flex:1 }} />
          {scanResult && (
            <span style={{ fontSize:11, color:C.muted, fontFamily:'IBM Plex Mono' }}>
              {scanResult.activeCompanies} active · {scanResult.totalCompanies} total · scanned {new Date(scanResult.scannedAt).toLocaleTimeString()}
            </span>
          )}
          {/* Scope selector */}
          <div style={{ display:'flex', background:C.card, border:`1px solid ${C.border}`, borderRadius:6, padding:2, gap:1 }}>
            {[{v:'gold',l:'Gold Only'},{v:'all',l:'Full CRM'}].map(({v,l}) => (
              <button key={v} onClick={() => setScope(v)}
                style={{ padding:'4px 12px', border:'none', borderRadius:4, fontSize:11, cursor:'pointer',
                  background:scope===v?C.border:'transparent', color:scope===v?C.text:C.sub,
                  fontWeight:scope===v?500:400 }}>
                {l}
              </button>
            ))}
          </div>
          <Btn variant={scanning?'ghost':'primary'} disabled={scanning} onClick={runScan}>
            {scanning ? progress||'Scanning…' : scanResult ? 'Re-scan' : 'Run Scan'}
          </Btn>
        </div>

        {/* Phase nav */}
        {scanResult && (
          <div style={{ background:C.panel, borderBottom:`1px solid ${C.border}`, padding:'0 24px', display:'flex', gap:0 }}>
            {PHASES.map(ph => (
              <button key={ph.key} onClick={() => setActivePhase(ph.key)}
                style={{ padding:'10px 14px', background:'none', border:'none', cursor:'pointer',
                  fontSize:12, fontWeight:activePhase===ph.key?600:400,
                  color:activePhase===ph.key?C.text:C.sub,
                  borderBottom:activePhase===ph.key?`2px solid ${C.accent}`:'2px solid transparent',
                  display:'flex', alignItems:'center', gap:5 }}>
                {ph.label}
                {ph.count>0 && (
                  <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:8,
                    background:'rgba(79,142,247,.2)', color:C.accent }}>{ph.count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ flex:1, padding:24, display:'flex', flexDirection:'column', gap:16, maxWidth:1400, margin:'0 auto', width:'100%' }}>

          {/* Empty */}
          {!scanResult && !scanning && !error && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              flex:1, gap:20, paddingTop:80 }}>
              <div style={{ fontSize:32 }}>🔍</div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>Cipher Data Quality</div>
                <div style={{ fontSize:13, color:C.sub, maxWidth:440, lineHeight:1.7 }}>
                  Full CRM cleanup tool. Scans companies and contacts in HubSpot,
                  identifies issues, proposes fixes, and exports review-ready CSVs.
                  Read-only — nothing writes to HubSpot without you importing the file.
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, maxWidth:820 }}>
                {[
                  { icon:'🚫', title:'Phase 0', desc:'Pre-filter vendors + retired contacts' },
                  { icon:'🔁', title:'Phase 1', desc:'Company dedup + domain cleanup' },
                  { icon:'🌳', title:'Phase 2', desc:'Parent/subsidiary hierarchy' },
                  { icon:'👤', title:'Phase 3', desc:'Contact data fixes + email repair' },
                  { icon:'🕰', title:'Phase 4', desc:'Stale record flagging' },
                ].map(p => (
                  <div key={p.title} style={{ padding:'14px', background:C.card, border:`1px solid ${C.border}`,
                    borderRadius:8, textAlign:'center' }}>
                    <div style={{ fontSize:22, marginBottom:6 }}>{p.icon}</div>
                    <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>{p.title}</div>
                    <div style={{ fontSize:11, color:C.sub }}>{p.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ display:'flex', background:C.card, border:`1px solid ${C.border}`, borderRadius:6, padding:2 }}>
                  {[{v:'gold',l:'Start with Gold Accounts'},{v:'all',l:'Full CRM'}].map(({v,l}) => (
                    <button key={v} onClick={() => setScope(v)}
                      style={{ padding:'6px 16px', border:'none', borderRadius:4, fontSize:12, cursor:'pointer',
                        background:scope===v?C.border:'transparent', color:scope===v?C.text:C.sub,
                        fontWeight:scope===v?500:400 }}>{l}</button>
                  ))}
                </div>
                <Btn variant="primary" onClick={runScan}>Run Scan →</Btn>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding:14, background:'rgba(240,82,82,.08)', border:'1px solid rgba(240,82,82,.25)', borderRadius:8, color:C.red }}>
              ✗ {error}
            </div>
          )}

          {scanning && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              flex:1, gap:16, paddingTop:80 }}>
              <div style={{ fontSize:28, animation:'spin 1s linear infinite' }}>⟳</div>
              <div style={{ fontSize:14, fontWeight:500 }}>{progress||'Scanning…'}</div>
              <div style={{ fontSize:12, color:C.sub }}>
                {scope==='all'
                  ? 'Scanning full CRM — fetching companies and contacts. This may take 60–90 seconds.'
                  : 'Scanning Gold accounts. This may take 30–45 seconds.'
                }
              </div>
            </div>
          )}

          {scanResult && !scanning && (
            <>
              {activePhase === 'overview' && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
                    <KpiCard label="Companies Scanned" value={scanResult.totalCompanies} />
                    <KpiCard label="Active (non-vendor)" value={scanResult.activeCompanies} color={C.green} />
                    <KpiCard label="Contacts Scanned"   value={scanResult.totalContacts||'—'} />
                    <KpiCard label="P1 Issues"  value={p1?.duplicateNames||0} color={(p1?.duplicateNames||0)>0?C.amber:C.green} />
                    <KpiCard label="P2 Proposals" value={p2?.total||0}       color={(p2?.total||0)>0?C.accent:C.green} />
                    <KpiCard label="P3 Contacts" value={p3?.total||0}        color={(p3?.total||0)>0?C.amber:C.green} />
                  </div>
                  <Phase0Panel data={scanResult.phase0} />
                  <Phase1Panel data={scanResult.phase1} approved={approved} onApprove={handleApprove} />
                  <Phase2Panel data={scanResult.phase2} approved={approved} onApprove={handleApprove} />
                  <Phase3Panel data={scanResult.phase3} />
                  <Phase4Panel data={scanResult.phase4} />
                  <ExportPanel scanResult={scanResult} />
                </>
              )}
              {activePhase === '0' && <Phase0Panel data={scanResult.phase0} />}
              {activePhase === '1' && <Phase1Panel data={scanResult.phase1} approved={approved} onApprove={handleApprove} />}
              {activePhase === '2' && <Phase2Panel data={scanResult.phase2} approved={approved} onApprove={handleApprove} />}
              {activePhase === '3' && <Phase3Panel data={scanResult.phase3} />}
              {activePhase === '4' && <Phase4Panel data={scanResult.phase4} />}
              {activePhase === 'export' && <ExportPanel scanResult={scanResult} />}
            </>
          )}
        </div>
      </div>
    </>
  )
}
