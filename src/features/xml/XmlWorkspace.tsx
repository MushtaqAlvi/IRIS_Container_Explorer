import { Component, lazy, Suspense, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Download, FileArchive, FileCode2, GitCompareArrows, LoaderCircle, MoreHorizontal, RotateCcw, Save, ShieldAlert } from 'lucide-react'
import type { Inventory, XmlArtifact, XmlEditRecord } from '../../core/model'
import { validateArchiveEntryPath } from '../../core/archiveSafety'
import { kaotoCatalogVersions, selectKaotoCatalog } from '../../core/catalogSelection'
import { prepareKaotoXml } from '../../core/kaotoAdapter'
import { downloadBlob, downloadText } from '../../core/download'
import { applyXmlEdit, buildModifiedJar } from '../../core/workerClient'
import { getJarPayload, getXmlEdit, getXmlEdits, saveInventory, saveXmlEdit } from '../../storage/containerRepository'

const MonacoXmlEditor = lazy(() => import('./MonacoXmlEditor'))
const KaotoVisualEditor = lazy(() => import('./KaotoVisualEditor'))
type Tab = 'text' | 'visual' | 'diff' | 'problems'

class EditorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* keep optional editor failures inside the workspace */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export default function XmlWorkspace({ containerId, inventory, xml, onClose, onInventory, initialTab = 'text', onVisualModeChange }: { containerId: string; inventory: Inventory; xml: XmlArtifact; onClose: () => void; onInventory: (inventory: Inventory) => void; initialTab?: 'text' | 'visual'; onVisualModeChange?: (visual: boolean) => void }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [record, setRecord] = useState<XmlEditRecord | null>(null)
  const [draft, setDraft] = useState(xml.raw)
  const [draftPath, setDraftPath] = useState(xml.entryPath)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [manualCatalog, setManualCatalog] = useState('')
  const jar = inventory.jars.find(item => item.id === xml.archiveId)
  const sourceIssues = inventory.issues.filter(issue => issue.jarPath === xml.jarPath && issue.xml === xml.xml)
  const pathProblems = useMemo(() => validateArchiveEntryPath(draftPath, xml.classification === 'camel-spring'), [draftPath, xml.classification])
  const automaticCatalog = selectKaotoCatalog(xml.camelVersion)
  const selectedCatalog = automaticCatalog ?? (!xml.camelVersion && manualCatalog ? { name: `Camel Main ${manualCatalog}`, version: manualCatalog, exact: true } : undefined)
  const visualPreparation = useMemo(() => prepareKaotoXml(draft), [draft])
  const visualAvailable = xml.visualCompatibility !== 'legacy-camel' && xml.visualCompatibility !== 'invalid-xml' && !!selectedCatalog && visualPreparation.ok
  const visualCanSave = visualAvailable && visualPreparation.ok && visualPreparation.mode === 'editable'

  useEffect(() => { setTab(initialTab) }, [xml.id, initialTab])
  useEffect(() => { onVisualModeChange?.(tab === 'visual') }, [tab, onVisualModeChange])
  useEffect(() => {
    let current = true
    setLoaded(false); setManualCatalog('')
    getXmlEdit(containerId, xml.id).then(saved => { if (!current) return; const next = saved ?? makeEdit(containerId, xml); setRecord(next); setDraft(next.draftRaw); setDraftPath(next.draftPath); setLoaded(true) })
    return () => { current = false }
  }, [containerId, xml.id])
  useEffect(() => {
    if (!loaded || !record) return
    const next: XmlEditRecord = { ...record, draftRaw: draft, draftPath, dirty: draft !== record.appliedRaw || draftPath !== record.appliedPath, updatedAt: new Date().toISOString() }
    const timer = setTimeout(() => { void saveXmlEdit(next); setRecord(next) }, 450)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, draftPath, loaded])

  const apply = async () => {
    if (!record || pathProblems.length) { setMessage(pathProblems[0]?.message ?? 'The draft is not ready to apply.'); return }
    setBusy(true); setMessage('')
    try { const updated = await applyXmlEdit(inventory, xml.id, draftPath, draft); const next: XmlEditRecord = { ...record, appliedPath: draftPath, draftPath, appliedRaw: draft, draftRaw: draft, dirty: false, diagnostics: [], updatedAt: new Date().toISOString() }; await saveXmlEdit(next); await saveInventory(containerId, updated); setRecord(next); onInventory(updated); setMessage('Applied. Search, routes, REST points, targets, and validation now use this XML.') } catch (error) { setMessage(error instanceof Error ? error.message : 'The XML could not be applied.') } finally { setBusy(false) }
  }
  const revert = () => { if (!record) return; setDraft(record.appliedRaw); setDraftPath(record.appliedPath); setMessage('Draft reverted to the last applied version.') }
  const originalJar = async () => { if (!jar) return; const payload = await getJarPayload(containerId, jar.id); if (!payload) { setMessage('Original JAR bytes are unavailable. Reprocess the source container.'); return }; downloadBlob(payload.blob, payload.name) }
  const modifiedJar = async () => {
    if (!jar || jar.signatureStatus === 'signed') { setMessage('Modified JAR generation is blocked for signed JARs.'); return }
    setBusy(true); setMessage('')
    try {
      const payload = await getJarPayload(containerId, jar.id); if (!payload) throw new Error('Original JAR bytes are unavailable. Reprocess the source container.')
      const storedEdits = (await getXmlEdits(containerId)).filter(edit => edit.archiveId === jar.id)
      const edits = storedEdits.filter(edit => edit.appliedRaw !== edit.originalRaw || edit.appliedPath !== edit.originalPath).map(edit => ({ originalPath: edit.originalPath, outputPath: edit.appliedPath, raw: edit.appliedRaw }))
      if (!edits.length) throw new Error('Apply at least one XML change before building a modified JAR.')
      const blocking = inventory.issues.filter(issue => issue.severity === 'error' && issue.jarPath === jar.path); if (blocking.length) throw new Error(`Resolve ${blocking.length} blocking problem${blocking.length === 1 ? '' : 's'} in this JAR before packaging.`)
      const serviceXmlPaths = inventory.xmlFiles.filter(item => item.archiveId === jar.id && item.classification === 'camel-spring').map(item => storedEdits.find(edit => edit.appliedPath === item.entryPath)?.originalPath ?? item.entryPath)
      const result = await buildModifiedJar(jar.name, await payload.blob.arrayBuffer(), edits, serviceXmlPaths)
      downloadBlob(new Blob([result.bytes], { type: 'application/java-archive' }), result.filename); setMessage(`Built ${result.filename} · SHA-256 ${result.sha256.slice(0, 16)}… · ${result.changes.length} changed.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The modified JAR could not be built.') } finally { setBusy(false) }
  }
  const visual = () => {
    if (!visualAvailable || !visualPreparation.ok || !selectedCatalog) return <VisualFallback copy={!selectedCatalog && !xml.camelVersion ? 'Choose the exact local Camel 4 catalog for this session before opening the visualizer.' : !visualPreparation.ok ? visualPreparation.reason : visualReason(xml)} catalog={!selectedCatalog && !xml.camelVersion ? <CatalogChoice value={manualCatalog} onChange={setManualCatalog} /> : undefined} />
    return <EditorBoundary fallback={<VisualFallback copy="Kaoto could not safely render this document. Continue in Text mode." />}><Suspense fallback={<EditorLoading />}><KaotoVisualEditor value={visualPreparation.workingXml} onChange={code => { if (!visualCanSave) { setMessage(visualPreparation.reason ?? 'Visualizer changes are not saved for this XML. Use Text mode.'); return }; try { setDraft(visualPreparation.patch(code)); setMessage('') } catch (error) { setMessage(error instanceof Error ? error.message : 'The visual change could not be patched safely.') } }} catalogName={selectedCatalog.name} /></Suspense></EditorBoundary>
  }
  if (!loaded || !record) return <div className="xml-workspace-loading"><LoaderCircle className="export-spinner" /> Loading local XML draft…</div>
  if (tab === 'visual') return <div className="xml-workspace visual-canvas"><header className="visual-canvas-header"><button className="ghost-button" onClick={onClose}><ArrowLeft size={16} /> Back</button><div><small>{jar?.name ?? xml.jar}</small><b>{record.appliedPath.split('/').pop()}</b></div><div><button className="ghost-button" onClick={() => setTab('text')}><FileCode2 size={15} /> Text</button><button className="visual-tab-active">Visual</button><details className="visual-overflow"><summary aria-label="More visualizer actions"><MoreHorizontal size={19} /></summary><div><button onClick={revert} disabled={!record.dirty || busy}><RotateCcw size={14} /> Revert draft</button><button onClick={() => void apply()} disabled={!record.dirty || busy || !!pathProblems.length}><Save size={14} /> Apply changes</button><button onClick={() => downloadText(record.appliedRaw, record.appliedPath.split('/').pop() || 'service.xml')}><Download size={14} /> Download XML</button><button onClick={() => void originalJar()} disabled={!jar}><FileArchive size={14} /> Original JAR</button><button onClick={() => void modifiedJar()} disabled={!jar || busy || jar.signatureStatus === 'signed'}><FileArchive size={14} /> Modified JAR</button>{!visualCanSave && <small>{visualPreparation.ok ? visualPreparation.reason ?? 'Visualizer is read-only; save from Text mode.' : 'Visualizer cannot save this XML.'}</small>}</div></details></div></header><section className="visual-canvas-body">{visual()}</section>{message && <div className="visual-message">{message}</div>}</div>
  return <div className="xml-workspace">
    <header className="xml-workspace-header"><button className="ghost-button" onClick={onClose}><ArrowLeft size={16} /> Workbench</button><div><span>{jar?.name ?? xml.jar}</span><b>{record.appliedPath}</b><small>{xml.classification} · {xml.camelVersion ? `Camel ${xml.camelVersion}` : 'Camel version unknown'} · {xml.encoding}</small></div><div className="xml-workspace-actions"><button className="ghost-button" onClick={() => downloadText(record.appliedRaw, record.appliedPath.split('/').pop() || 'service.xml')}><Download size={15} /> XML</button><button className="ghost-button" disabled={!jar} onClick={() => void originalJar()}><FileArchive size={15} /> Original JAR</button><button className="primary-button" disabled={!jar || busy || jar?.signatureStatus === 'signed'} onClick={() => void modifiedJar()}>{busy ? <LoaderCircle className="export-spinner" size={15} /> : <FileArchive size={15} />} Modified JAR</button></div></header>
    <div className="xml-workspace-meta"><label>Entry path<input value={draftPath} onChange={event => setDraftPath(event.target.value)} /></label>{record.dirty && <span className="draft-badge">Unapplied draft</span>}{jar?.signatureStatus === 'signed' && <span className="signed-badge"><ShieldAlert size={14} /> Signed JAR: rebuild blocked</span>}{pathProblems[0] && <span className="path-error"><AlertCircle size={14} /> {pathProblems[0].message} Suggested: {pathProblems[0].suggestion}</span>}<div><button className="ghost-button" disabled={!record.dirty || busy} onClick={revert}><RotateCcw size={15} /> Revert</button><button className="primary-button" disabled={!record.dirty || busy || !!pathProblems.length} onClick={() => void apply()}>{busy ? <LoaderCircle className="export-spinner" size={15} /> : <Save size={15} />} Apply</button></div></div>
    <nav className="xml-tabs"><button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}><FileCode2 size={15} /> Text</button><button onClick={() => setTab('visual')}>Visual</button><button className={tab === 'diff' ? 'active' : ''} onClick={() => setTab('diff')}><GitCompareArrows size={15} /> Diff</button><button className={tab === 'problems' ? 'active' : ''} onClick={() => setTab('problems')}>Problems ({sourceIssues.length + pathProblems.length})</button></nav>
    <section className="xml-editor-body">{tab === 'text' ? <Suspense fallback={<EditorLoading />}><MonacoXmlEditor value={draft} onChange={setDraft} /></Suspense> : tab === 'diff' ? <div className="xml-diff"><div><span>Original</span><pre>{record.originalRaw}</pre></div><div><span>Applied / draft</span><pre>{draft}</pre></div></div> : <div className="xml-problems">{pathProblems.map(problem => <article key={`${problem.rule}:${problem.message}`}><b>{problem.rule}</b><p>{problem.message}</p><code>{problem.path}</code></article>)}{sourceIssues.map(issue => <article key={issue.id} className={issue.severity}><b>{issue.rule}</b><p>{issue.message}</p></article>)}{!pathProblems.length && !sourceIssues.length && <p>No problems are recorded for this XML.</p>}</div>}</section>
    {message && <div className="xml-workspace-message">{message}</div>}
  </div>
}

function makeEdit(containerId: string, xml: XmlArtifact): XmlEditRecord { return { key: `${containerId}:${xml.id}`, containerId, xmlId: xml.id, archiveId: xml.archiveId, originalPath: xml.entryPath, appliedPath: xml.entryPath, draftPath: xml.entryPath, originalRaw: xml.raw, appliedRaw: xml.raw, draftRaw: xml.raw, dirty: false, diagnostics: xml.diagnostics, editorMode: 'text', updatedAt: new Date().toISOString() } }
function EditorLoading() { return <div className="xml-workspace-loading"><LoaderCircle className="export-spinner" /> Loading editor locally…</div> }
function CatalogChoice({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <label className="catalog-choice">Local Camel 4 catalog<select value={value} onChange={event => onChange(event.target.value)}><option value="">Choose catalog…</option>{kaotoCatalogVersions.map(version => <option key={version} value={version}>Camel Main {version}</option>)}</select></label> }
function VisualFallback({ copy, catalog }: { copy: string; catalog?: ReactNode }) { return <div className="visual-fallback"><AlertCircle size={30} /><h3>Visualizer is unavailable</h3><p>{copy}</p>{catalog}</div> }
function visualReason(xml: XmlArtifact) { if (xml.visualCompatibility === 'legacy-camel') return `Camel ${xml.camelVersion} remains text-editable, but the installed Kaoto catalog supports Camel 4.`; if (xml.visualCompatibility === 'unknown-version') return 'A local Camel 4 catalog must be selected before enabling visual changes.'; if (xml.visualCompatibility === 'invalid-xml') return 'Fix XML syntax errors in Text mode before opening the visual editor.'; return 'The visualizer cannot safely isolate the route or REST nodes in this Spring XML.' }
