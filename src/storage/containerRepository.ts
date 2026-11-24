import type { Inventory, JarPayloadTransfer, StoredJarPayload, XmlEditRecord } from '../core/model'

const DATABASE = 'iris-container-explorer'
const VERSION = 2
const stores = ['containers', 'inventories', 'jars', 'routes', 'properties', 'beans', 'xmlFiles', 'logs', 'searchIndex', 'jarPayloads', 'xmlEdits', 'packaging'] as const
type StoreName = typeof stores[number]

export interface ContainerStats { jars: number; xmlFiles: number; services: number; routes: number; targets: number; beans: number; issues: number }
export interface StoredContainer {
  id: string; name: string; displayName: string; hash: string; type: string; size: number; status: 'ready' | 'error'; processedAt: string
  globalSearchEnabled: boolean; artifactsAvailable: boolean; stats: ContainerStats
}
interface EntityRecord { key: string; containerId: string; value: unknown }
export interface ContainerLog { id: string; containerId: string; createdAt: string; level: 'info' | 'error'; message: string }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      stores.forEach(name => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === 'containers' ? 'id' : name === 'inventories' ? 'containerId' : 'key' }) })
      stores.filter(name => !['containers', 'inventories'].includes(name)).forEach(name => { const store = request.transaction!.objectStore(name); if (!store.indexNames.contains('containerId')) store.createIndex('containerId', 'containerId') })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open browser storage.'))
  })
}
function requestResult<T>(request: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.')) }) }
function transactionDone(transaction: IDBTransaction) { return new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')); transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.')) }) }
function stats(inventory: Inventory): ContainerStats { return { jars: inventory.jars.length, xmlFiles: inventory.xmlFiles.length, services: inventory.services.length, routes: inventory.routes.length, targets: new Set(inventory.routeProperties.filter(x => x.name.toLowerCase() === 'target' && x.value).map(x => x.value)).size, beans: inventory.beanDefinitions.length, issues: inventory.issues.length } }
function records(containerId: string, inventory: Inventory, key: 'jars' | 'routes' | 'properties' | 'beans' | 'xmlFiles'): EntityRecord[] { const values = key === 'jars' ? inventory.jars : key === 'routes' ? inventory.routes : key === 'properties' ? inventory.routeProperties : key === 'beans' ? inventory.beanDefinitions : inventory.xmlFiles; return values.map((value, index) => ({ key: `${containerId}:${key}:${index}`, containerId, value })) }
function deleteByContainer(store: IDBObjectStore, containerId: string) { const index = store.index('containerId'); const request = index.openCursor(IDBKeyRange.only(containerId)); request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue() } } }
function hydrateInventory(value: Inventory): Inventory {
  const archives = value.archives ?? value.jars ?? []
  const jars = (value.jars ?? []).map(jar => ({ ...jar, kind: jar.kind ?? 'jar' as const, signatureStatus: jar.signatureStatus ?? 'unsigned' as const, payloadAvailability: jar.payloadAvailability ?? 'missing' as const }))
  const hydratedArchives = archives.map(archive => ({ ...archive, kind: archive.kind ?? (/\.war$/i.test(archive.name) ? 'war' as const : /\.jar$/i.test(archive.name) ? 'jar' as const : 'zip' as const), signatureStatus: archive.signatureStatus ?? 'unsigned' as const, payloadAvailability: archive.payloadAvailability ?? 'missing' as const }))
  const xmlFiles = (value.xmlFiles ?? []).map(xml => ({ ...xml, entryPath: xml.entryPath ?? xml.xml, classification: xml.classification ?? 'other' as const, encoding: xml.encoding ?? 'UTF-8', bom: xml.bom ?? false, declaration: xml.declaration ?? '', contentHash: xml.contentHash ?? '', visualCompatibility: xml.visualCompatibility ?? (xml.parseStatus === 'error' ? 'invalid-xml' as const : 'unsupported-structure' as const), diagnostics: xml.diagnostics ?? [] }))
  const restEndpoints = (value.restEndpoints ?? []).map(endpoint => ({ ...endpoint, operationId: endpoint.operationId ?? '', routeRef: endpoint.routeRef ?? '', relatedRouteIds: endpoint.relatedRouteIds ?? [], relatedTargetIds: endpoint.relatedTargetIds ?? [] }))
  return { ...value, archives: hydratedArchives, jars, xmlFiles, restEndpoints }
}

export async function loadAllContainers(): Promise<{ container: StoredContainer; inventory: Inventory }[]> {
  const db = await openDatabase()
  try {
    const transaction = db.transaction(['containers', 'inventories'], 'readonly'); const containerRows = await requestResult(transaction.objectStore('containers').getAll() as IDBRequest<StoredContainer[]>); const inventoryRows = await requestResult(transaction.objectStore('inventories').getAll() as IDBRequest<{ containerId: string; inventory: Inventory }[]>); const inventories = new Map(inventoryRows.map(row => [row.containerId, hydrateInventory(row.inventory)]))
    return containerRows.filter(row => inventories.has(row.id)).sort((a, b) => b.processedAt.localeCompare(a.processedAt)).map(container => ({ container: { ...container, artifactsAvailable: container.artifactsAvailable ?? false }, inventory: inventories.get(container.id)! }))
  } finally { db.close() }
}
export async function findContainerByHash(hash: string) { const db = await openDatabase(); try { const rows = await requestResult(db.transaction('containers', 'readonly').objectStore('containers').getAll() as IDBRequest<StoredContainer[]>); return rows.find(row => row.hash === hash) } finally { db.close() } }
export async function saveContainer(container: StoredContainer, inventory: Inventory, logMessage = 'Container processed and indexed locally.') {
  const db = await openDatabase()
  try {
    const transaction = db.transaction(['containers', 'inventories', 'jars', 'routes', 'properties', 'beans', 'xmlFiles', 'logs', 'searchIndex'], 'readwrite'); transaction.objectStore('containers').put(container); transaction.objectStore('inventories').put({ containerId: container.id, inventory }); (['jars', 'routes', 'properties', 'beans', 'xmlFiles'] as const).forEach(name => { const store = transaction.objectStore(name); deleteByContainer(store, container.id); records(container.id, inventory, name).forEach(row => store.put(row)) }); const logs = transaction.objectStore('logs'); deleteByContainer(logs, container.id); logs.put({ key: `${container.id}:log:${Date.now()}`, containerId: container.id, value: { id: crypto.randomUUID(), createdAt: new Date().toISOString(), level: 'info', message: logMessage } satisfies Omit<ContainerLog, 'containerId'> } satisfies EntityRecord); const search = transaction.objectStore('searchIndex'); deleteByContainer(search, container.id); search.put({ key: `${container.id}:search`, containerId: container.id, value: { routeCount: inventory.routes.length, endpointCount: inventory.restEndpoints.length, propertyCount: inventory.routeProperties.length, beanCount: inventory.beanDefinitions.length } } satisfies EntityRecord); await transactionDone(transaction)
  } finally { db.close() }
}
export async function saveInventory(containerId: string, inventory: Inventory) {
  const db = await openDatabase()
  try { const transaction = db.transaction(['containers', 'inventories'], 'readwrite'); transaction.objectStore('inventories').put({ containerId, inventory }); const store = transaction.objectStore('containers'); const container = await requestResult(store.get(containerId) as IDBRequest<StoredContainer | undefined>); if (container) store.put({ ...container, stats: stats(inventory), processedAt: new Date().toISOString() }); await transactionDone(transaction) } finally { db.close() }
}
async function sha256(bytes: ArrayBuffer) { const digest = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') }
export async function saveJarPayloads(containerId: string, inventory: Inventory, payloads: JarPayloadTransfer[]) {
  let stored = 0; const failed: string[] = []
  for (const payload of payloads) {
    const artifact = inventory.jars.find(jar => jar.id === payload.artifactId); if (!artifact) continue
    const payloadHash = await sha256(payload.bytes); const payloadBlob = new Blob([payload.bytes], { type: 'application/java-archive' })
    const db = await openDatabase()
    try { const transaction = db.transaction('jarPayloads', 'readwrite'); const row: StoredJarPayload = { key: `${containerId}:${artifact.id}`, containerId, artifactId: artifact.id, name: artifact.name, path: artifact.path, blob: payloadBlob, sha256: payloadHash, size: payload.bytes.byteLength, signatureStatus: artifact.signatureStatus, storedAt: new Date().toISOString() }; transaction.objectStore('jarPayloads').put(row); await transactionDone(transaction); artifact.sha256 = row.sha256; artifact.payloadAvailability = 'available'; stored += 1 } catch { artifact.payloadAvailability = 'missing'; failed.push(payload.artifactId) } finally { db.close() }
  }
  return { stored, failed }
}
export async function getJarPayload(containerId: string, artifactId: string) { const db = await openDatabase(); try { return await requestResult(db.transaction('jarPayloads', 'readonly').objectStore('jarPayloads').get(`${containerId}:${artifactId}`) as IDBRequest<StoredJarPayload | undefined>) } finally { db.close() } }
export async function saveXmlEdit(edit: XmlEditRecord) { const db = await openDatabase(); try { const transaction = db.transaction('xmlEdits', 'readwrite'); transaction.objectStore('xmlEdits').put(edit); await transactionDone(transaction) } finally { db.close() } }
export async function getXmlEdit(containerId: string, xmlId: string) { const db = await openDatabase(); try { return await requestResult(db.transaction('xmlEdits', 'readonly').objectStore('xmlEdits').get(`${containerId}:${xmlId}`) as IDBRequest<XmlEditRecord | undefined>) } finally { db.close() } }
export async function getXmlEdits(containerId: string) { const db = await openDatabase(); try { const rows = await requestResult(db.transaction('xmlEdits', 'readonly').objectStore('xmlEdits').index('containerId').getAll(IDBKeyRange.only(containerId)) as IDBRequest<XmlEditRecord[]>); return rows } finally { db.close() } }
export async function deleteXmlEdit(containerId: string, xmlId: string) { const db = await openDatabase(); try { const transaction = db.transaction('xmlEdits', 'readwrite'); transaction.objectStore('xmlEdits').delete(`${containerId}:${xmlId}`); await transactionDone(transaction) } finally { db.close() } }
export async function deleteContainer(containerId: string) { const db = await openDatabase(); try { const transaction = db.transaction(stores, 'readwrite'); transaction.objectStore('containers').delete(containerId); transaction.objectStore('inventories').delete(containerId); stores.filter(name => !['containers', 'inventories'].includes(name)).forEach(name => deleteByContainer(transaction.objectStore(name), containerId)); await transactionDone(transaction) } finally { db.close() } }
export async function updateContainer(container: StoredContainer) { const db = await openDatabase(); try { const transaction = db.transaction('containers', 'readwrite'); transaction.objectStore('containers').put(container); await transactionDone(transaction) } finally { db.close() } }
export async function clearContainerLogs(containerId: string) { const db = await openDatabase(); try { const transaction = db.transaction('logs', 'readwrite'); deleteByContainer(transaction.objectStore('logs'), containerId); await transactionDone(transaction) } finally { db.close() } }
export async function clearAllContainerData() { const db = await openDatabase(); try { const transaction = db.transaction(stores, 'readwrite'); stores.forEach(name => transaction.objectStore(name).clear()); await transactionDone(transaction) } finally { db.close() } }
export async function getStorageUsage() { const estimate = await navigator.storage?.estimate?.(); return { usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0 } }
export function createStoredContainer(id: string, file: File, hash: string, inventory: Inventory): StoredContainer { return { id, name: file.name, displayName: file.name, hash, type: file.name.split('.').pop()?.toUpperCase() || 'FILE', size: file.size, status: 'ready', processedAt: new Date().toISOString(), globalSearchEnabled: true, artifactsAvailable: inventory.jars.length > 0, stats: stats(inventory) } }
