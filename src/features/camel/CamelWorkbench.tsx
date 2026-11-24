import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, FileCode2, Route, ShieldAlert, Sparkles } from 'lucide-react'
import type { Inventory } from '../../core/model'
import { camelWorkbenchJars, visualLabel } from '../../core/camelWorkbench'

export default function CamelWorkbench({ inventory, onOpenXml, onOpenVisual, onExplorer }: { inventory: Inventory; onOpenXml: (xmlId: string) => void; onOpenVisual: (xmlId: string) => void; onExplorer: () => void }) {
  const jars = useMemo(() => camelWorkbenchJars(inventory), [inventory])
  const [jarId, setJarId] = useState('')
  useEffect(() => { if (!jars.some(summary => summary.jar.id === jarId)) setJarId(jars[0]?.jar.id ?? '') }, [jars, jarId])
  const selected = jars.find(summary => summary.jar.id === jarId)
  return <div className="camel-workbench">
    <header className="camel-workbench-header"><div><span className="panel-label">Recommended Camel path</span><h1>Camel Workbench</h1><p>Select a library JAR, then open one of its Apache Camel Spring XML files.</p></div><button className="ghost-button" onClick={onExplorer}>Open general Explorer <ArrowRight size={15} /></button></header>
    {!jars.length ? <section className="empty-state"><Sparkles size={34} /><h3>No Camel Spring XML found</h3><p>This view lists only JARs with `camel-spring` XML. Use the general Explorer to inspect all files.</p><button className="primary-button" onClick={onExplorer}>Open Explorer</button></section> : <div className="camel-workbench-layout">
      <section className="camel-jar-list" aria-label="Camel JARs">{jars.map(summary => <button key={summary.jar.id} className={`camel-jar-row ${summary.jar.id === jarId ? 'selected' : ''}`} onClick={() => setJarId(summary.jar.id)}><Route size={18} /><span><b>{summary.jar.name}</b><small>{summary.jar.path}</small><em>{summary.xmlFiles.length} XML · {summary.restCount} REST · {summary.routeCount} routes</em></span>{summary.jar.signatureStatus === 'signed' && <ShieldAlert size={15} />}</button>)}</section>
      <section className="panel camel-xml-list">{selected && <><div className="panel-heading"><div><span className="panel-label">Selected JAR</span><h3>{selected.jar.name}</h3><small>{selected.jar.path} · {selected.jar.signatureStatus}</small></div></div><div className="camel-xml-rows">{selected.xmlFiles.map(xml => { const routes = inventory.routes.filter(route => route.jarPath === selected.jar.path && route.xml === xml.xml).length; const rest = inventory.restEndpoints.filter(endpoint => endpoint.archiveId === selected.jar.id && endpoint.xml === xml.xml).length; const canVisual = xml.visualCompatibility === 'compatible' || xml.visualCompatibility === 'unknown-version' || xml.visualCompatibility === 'unsupported-structure'; return <article key={xml.id}><FileCode2 size={19} /><div><b>{xml.entryPath}</b><small>{routes} routes · {rest} REST endpoints · {xml.camelVersion ? `Camel ${xml.camelVersion}` : 'Camel version unknown'}</small><span className={`visual-status ${xml.visualCompatibility}`}>{visualLabel(xml)}</span></div><div className="camel-xml-actions"><button className="ghost-button" onClick={() => onOpenXml(xml.id)}>Text</button><button className="primary-button" disabled={!canVisual} onClick={() => onOpenVisual(xml.id)}>{canVisual ? 'Open Visualizer' : 'Text only'}</button></div></article> })}</div></>}</section>
    </div>}
  </div>
}
