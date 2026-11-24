import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, FileArchive, FileCode2, Network, Route, Search, ServerCog } from 'lucide-react'
import type { ArchiveArtifact, Inventory, RestEndpoint, RestParameter, Route as CamelRoute, Service } from '../../core/model'
import type { SearchResult } from '../../core/search'

type View = { kind: 'jars' } | { kind: 'services'; jarId: string } | { kind: 'service'; jarId: string; serviceId: string }

const serviceMatches = (service: Service, endpoint: RestEndpoint) => service.id === endpoint.id || (service.serviceId === endpoint.serviceId && service.jarPath === endpoint.jarPath && service.xml === endpoint.xml)
const pathMatches = (value: string, query: string) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
const methodClass = (method: string) => `method ${method.toLowerCase()}`

export default function JarExplorer({ inventory, searchResult, onClearSearch, onOpenXml }: { inventory: Inventory; searchResult: SearchResult | null; onClearSearch: () => void; onOpenXml: (xmlId: string) => void }) {
  const [view, setView] = useState<View>({ kind: 'jars' })
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!searchResult) return
    const jarId = searchResult.archiveId
    const service = inventory.services.find(item => item.id === searchResult.id) ?? inventory.services.find(item => item.serviceId === searchResult.id)
    const endpoint = inventory.restEndpoints.find(item => item.id === searchResult.id)
    if (jarId && service) setView({ kind: 'service', jarId, serviceId: service.id })
    else if (jarId && endpoint) {
      const owner = inventory.services.find(item => serviceMatches(item, endpoint))
      setView(owner ? { kind: 'service', jarId, serviceId: owner.id } : { kind: 'services', jarId })
    } else if (jarId) setView({ kind: 'services', jarId })
  }, [inventory, searchResult])

  const title = view.kind === 'jars' ? 'JAR Explorer' : view.kind === 'services' ? inventory.jars.find(jar => jar.id === view.jarId)?.name ?? 'JAR' : inventory.services.find(service => service.id === view.serviceId)?.serviceId || 'Service'
  return <div className="jar-explorer">
    <div className="explorer-heading">
      <div>
        <span className="panel-label">REST discovery</span>
        <h2>{title}</h2>
        <p>{view.kind === 'jars' ? 'Choose a JAR to see its Camel services.' : view.kind === 'services' ? 'Choose a service to inspect its HTTP endpoints, consumers, and routes.' : 'HTTP methods, parameters, consumer routes, and source XML.'}</p>
      </div>
      {view.kind !== 'jars' && <button className="ghost-button" onClick={() => { setView(view.kind === 'service' ? { kind: 'services', jarId: view.jarId } : { kind: 'jars' }); onClearSearch() }}><ArrowLeft size={16} /> Back</button>}
    </div>
    {view.kind === 'jars' && <Jars inventory={inventory} filter={filter} setFilter={setFilter} onChoose={jar => { setView({ kind: 'services', jarId: jar.id }); onClearSearch() }} />}
    {view.kind === 'services' && <Services inventory={inventory} jarId={view.jarId} onChoose={service => { setView({ kind: 'service', jarId: view.jarId, serviceId: service.id }); onClearSearch() }} />}
    {view.kind === 'service' && <ServiceDetail inventory={inventory} jarId={view.jarId} serviceId={view.serviceId} onOpenXml={onOpenXml} />}
  </div>
}

function Jars({ inventory, filter, setFilter, onChoose }: { inventory: Inventory; filter: string; setFilter: (value: string) => void; onChoose: (jar: ArchiveArtifact) => void }) {
  const jars = useMemo(() => inventory.jars.filter(jar => pathMatches(`${jar.name} ${jar.path}`, filter)), [inventory.jars, filter])
  return <section className="jar-list">
    <label className="explorer-filter"><Search size={16} /><input autoFocus value={filter} onChange={event => setFilter(event.target.value)} placeholder="Find a JAR by name or path" /></label>
    <div className="jar-cards">{jars.map(jar => {
      const services = inventory.services.filter(service => service.jarPath === jar.path)
      const endpoints = inventory.restEndpoints.filter(endpoint => endpoint.archiveId === jar.id)
      return <button key={jar.id} className="jar-card" onClick={() => onChoose(jar)}><span className="jar-card-icon"><FileArchive size={21} /></span><span className="jar-card-content"><b>{jar.name}</b><code>{jar.path}</code><small>{services.length} service{services.length === 1 ? '' : 's'} · {endpoints.length} REST endpoint{endpoints.length === 1 ? '' : 's'}</small></span><ChevronRight size={18} /></button>
    })}</div>
    {!jars.length && <div className="empty">No JAR matches this search.</div>}
  </section>
}

function Services({ inventory, jarId, onChoose }: { inventory: Inventory; jarId: string; onChoose: (service: Service) => void }) {
  const jar = inventory.jars.find(item => item.id === jarId)
  const services = inventory.services.filter(service => service.jarPath === jar?.path)
  return <section className="service-cards">{services.map(service => {
    const endpoints = inventory.restEndpoints.filter(endpoint => serviceMatches(service, endpoint))
    const routes = inventory.routes.filter(route => route.serviceId === service.serviceId && route.jarPath === service.jarPath && route.xml === service.xml)
    return <button className="service-card" key={service.id} onClick={() => onChoose(service)}><span className="service-card-icon"><ServerCog size={20} /></span><span><b>{service.serviceId || '(unnamed service)'}</b><code>{service.xml}</code><small>{endpoints.length} REST endpoint{endpoints.length === 1 ? '' : 's'} · {routes.length} route{routes.length === 1 ? '' : 's'}</small></span><ChevronRight size={18} /></button>
  })}</section>
}

function ServiceDetail({ inventory, jarId, serviceId, onOpenXml }: { inventory: Inventory; jarId: string; serviceId: string; onOpenXml: (xmlId: string) => void }) {
  const service = inventory.services.find(item => item.id === serviceId)
  const xml = service && inventory.xmlFiles.find(item => item.jarPath === service.jarPath && item.xml === service.xml)
  const endpoints = service ? inventory.restEndpoints.filter(endpoint => serviceMatches(service, endpoint)) : []
  const routes = service ? inventory.routes.filter(route => route.serviceId === service.serviceId && route.jarPath === service.jarPath && route.xml === service.xml) : []
  const consumers = routes.filter(route => route.fromUri).map(route => route.fromUri)
  if (!service) return <div className="empty">This service is no longer available.</div>
  return <div className="service-detail">
    <section className="service-overview">
      <div><span className="panel-label">Service source</span><code>{service.xml}</code></div>
      {xml && <button className="primary-button" onClick={() => onOpenXml(xml.id)}><FileCode2 size={16} /> View full XML</button>}
    </section>
    <section className="detail-section"><div className="detail-section-title"><Network size={17} /><div><span className="panel-label">Consumers</span><h3>Incoming routes</h3></div></div>{consumers.length ? <div className="consumer-list">{consumers.map((uri, index) => <code key={`${uri}-${index}`}>{uri}</code>)}</div> : <p className="muted-copy">No Camel route consumer was found for this service.</p>}</section>
    <section className="detail-section"><div className="detail-section-title"><ServerCog size={17} /><div><span className="panel-label">REST endpoints</span><h3>{endpoints.length} HTTP contract{endpoints.length === 1 ? '' : 's'}</h3></div></div>{endpoints.length ? <div className="endpoint-list">{endpoints.map(endpoint => <Endpoint key={endpoint.id} endpoint={endpoint} parameters={inventory.restParameters.filter(parameter => parameter.endpointId === endpoint.id)} routes={routes.filter(route => endpoint.relatedRouteIds.includes(route.id))} />)}</div> : <p className="muted-copy">No REST endpoint was found in this service.</p>}</section>
    <section className="detail-section"><div className="detail-section-title"><Route size={17} /><div><span className="panel-label">Routes</span><h3>{routes.length} Camel route{routes.length === 1 ? '' : 's'}</h3></div></div><div className="route-summary-list">{routes.map(route => <div key={route.id}><b>{route.routeId || '(unnamed route)'}</b><code>{route.fromUri || 'No consumer URI'}</code>{route.toUris.length > 0 && <small>to: {route.toUris.join(', ')}</small>}</div>)}</div>{!routes.length && <p className="muted-copy">No routes were found in this service.</p>}</section>
  </div>
}

function Endpoint({ endpoint, parameters, routes }: { endpoint: RestEndpoint; parameters: RestParameter[]; routes: CamelRoute[] }) {
  return <details className="endpoint-card" open><summary><span className={methodClass(endpoint.method)}>{endpoint.method}</span><b>{endpoint.path}</b><code>{endpoint.toUri || endpoint.routeRef || 'No linked route'}</code><ChevronRight size={16} /></summary><div className="endpoint-body"><div className="endpoint-meta"><span><b>Consumes</b>{endpoint.consumes || '—'}</span><span><b>Produces</b>{endpoint.produces || '—'}</span><span><b>Request type</b>{endpoint.requestType || '—'}</span><span><b>Response type</b>{endpoint.responseType || '—'}</span></div><h4>Parameters</h4>{parameters.length ? <div className="parameter-grid">{parameters.map(parameter => <div key={parameter.id}><b>{parameter.name || '(unnamed)'}</b><small>{[parameter.type, parameter.dataType, parameter.required === 'true' ? 'required' : 'optional'].filter(Boolean).join(' · ')}</small>{parameter.defaultValue && <code>default: {parameter.defaultValue}</code>}{parameter.description && <p>{parameter.description}</p>}</div>)}</div> : <p className="muted-copy">No route parameters declared.</p>}{routes.length > 0 && <><h4>Linked route</h4><div className="consumer-list">{routes.map(route => <code key={route.id}>{route.routeId}: {route.fromUri}</code>)}</div></>}</div></details>
}
