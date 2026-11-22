import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { reviewStatuses } from '../../models/workspace'
import type { Workspace } from '../../models/workspace'
import { Modal } from '../layout/Modal'
import './report.css'

export function AnalysisReport({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const [created] = useState(() => new Date())
  const name = workspace.integrationName || 'Untitled integration'
  useEffect(() => {
    const previous = document.title
    document.title = `${name} — Analysis report`
    return () => { document.title = previous }
  }, [name])

  return createPortal(<Modal title="Analysis report" className="report-modal" initialFocus=".report-print" onClose={onClose}>
    <div className="report-controls">
      <p>Choose Save as PDF in your browser’s print dialog to download a copy. Export Excel to keep an editable workspace.</p>
      <div><button className="button" onClick={onClose}><X />Close</button><button className="button primary report-print" onClick={() => window.print()}><Printer />Print / Save PDF</button></div>
    </div>
    <article className="analysis-report" aria-label="Integration analysis report">
      <header className="report-heading"><div><span className="report-brand">MaptelaBridge · Integration analysis</span><h1>{name}</h1></div><time dateTime={created.toISOString()}>{created.toLocaleString()}</time></header>
      <dl className="report-systems"><div><dt>Source system</dt><dd>{workspace.source.system || 'Source System'}</dd><dd className="report-format">{workspace.source.format}</dd></div><div><dt>Target system</dt><dd>{workspace.target.system || 'Target System'}</dd><dd className="report-format">{workspace.target.format}</dd></div></dl>
      <div className="report-summary" aria-label="Mapping review summary"><strong>{workspace.mappings.length} mappings</strong><span>{workspace.mappings.filter(row => row.required).length} required</span>{reviewStatuses.map(status => <span key={status} className="report-status" data-status={status}>{status}: {workspace.mappings.filter(row => row.reviewStatus === status).length}</span>)}</div>
      <section className="report-section"><h2>Field Mapping</h2><p className="report-caption">All mappings are included. Review states record analysis decisions; transformation rules are documentation only.</p>
        {workspace.mappings.length ? <table className="report-table"><colgroup>{[3, 14, 14, 11, 12, 6, 12, 28].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup><thead><tr><th scope="col">No</th><th scope="col">Source Field</th><th scope="col">Target Field</th><th scope="col">Transformation Rule</th><th scope="col">Review Status</th><th scope="col">Required</th><th scope="col">Default Value</th><th scope="col">Description</th></tr></thead><tbody>{workspace.mappings.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td className="report-path">{row.source || '—'}</td><td className="report-path">{row.target || '—'}</td><td>{row.rule}</td><td>{row.reviewStatus}</td><td>{row.required ? 'Yes' : 'No'}</td><td>{row.defaultValue || '—'}</td><td>{row.description || '—'}</td></tr>)}</tbody></table> : <p className="report-empty">No mappings recorded.</p>}
      </section>
      <section className="report-section"><h2>Analysis Notes</h2>{workspace.notes ? <div className="report-notes">{workspace.notes}</div> : <p className="report-empty">No analysis notes recorded.</p>}</section>
      {(['source', 'target'] as const).map(side => <section key={side} className="report-section report-payload" aria-label={`${side} payload report`}><h2>{side === 'source' ? 'Source Request' : 'Target Request'}</h2><p className="report-caption">{workspace[side].system || (side === 'source' ? 'Source System' : 'Target System')} · {workspace[side].format}</p>{workspace[side].content ? <pre>{workspace[side].content}</pre> : <p className="report-empty">No payload recorded.</p>}</section>)}
      <footer className="report-end">Prepared with MaptelaBridge · Integration Mapping Workspace</footer>
    </article>
  </Modal>, document.body)
}
