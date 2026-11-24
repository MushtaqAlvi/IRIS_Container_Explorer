import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'
import type { Inventory } from '../core/model'
import { clearAllContainerData, createStoredContainer, deleteContainer, findContainerByHash, getJarPayload, getXmlEdit, loadAllContainers, saveContainer, saveJarPayloads, saveXmlEdit } from './containerRepository'

const inventory = (name: string): Inventory => ({
  container: { name, size: 12, sha256: 'hash', scannedAt: '2026-08-28T00:00:00.000Z', nestedArchives: 0 }, archives: [], jars: [], xmlFiles: [], services: [], restEndpoints: [], restParameters: [], routes: [], routeSteps: [], routeProperties: [], processors: [], beanDefinitions: [], beanReferences: [], dependencies: [], issues: [], errors: [],
})

beforeEach(async () => { await clearAllContainerData() })

test('persists processed containers and restores their indexed inventory', async () => {
  const first = inventory('first.war'); first.routes.push({ id: 'route-1', jar: 'first.jar', jarPath: 'first.war', xml: 'route.xml', serviceId: 'customer', routeId: 'customer.route', fromUri: 'direct:customer', toUris: [], processors: [], beans: [], propertyCount: 0 })
  const firstRecord = createStoredContainer('first', new File(['first'], 'first.war', { type: 'application/java-archive' }), 'first-hash', first)
  const secondRecord = createStoredContainer('second', new File(['second'], 'second.jar', { type: 'application/java-archive' }), 'second-hash', inventory('second.jar'))
  await saveContainer(firstRecord, first)
  await saveContainer(secondRecord, inventory('second.jar'))

  const restored = await loadAllContainers()
  expect(restored).toHaveLength(2)
  expect(restored.find(item => item.container.id === 'first')?.inventory.routes).toHaveLength(1)
  expect((await findContainerByHash('second-hash'))?.id).toBe('second')
})

test('deleting a container removes its stored inventory', async () => {
  const data = inventory('delete-me.war')
  const record = createStoredContainer('delete-me', new File(['x'], 'delete-me.war'), 'delete-hash', data)
  await saveContainer(record, data)
  await deleteContainer(record.id)
  expect(await loadAllContainers()).toHaveLength(0)
  expect(await findContainerByHash('delete-hash')).toBeUndefined()
})

test('persists immutable JAR payloads and recoverable XML drafts', async () => {
  const data = inventory('persist.war')
  data.jars.push({ id: 'jar-1', kind: 'jar', name: 'service.jar', path: 'persist.war!/WEB-INF/lib/service.jar', size: 3, entries: 1, xmlEntries: 1, manifest: {}, signatureStatus: 'unsigned', payloadAvailability: 'missing' })
  data.archives.push(...data.jars)
  const bytes = new Uint8Array([1, 2, 3]).buffer
  expect(await saveJarPayloads('persist', data, [{ artifactId: 'jar-1', bytes }])).toEqual({ stored: 1, failed: [] })
  const payload = await getJarPayload('persist', 'jar-1')
  expect(Array.from(new Uint8Array(await payload!.blob.arrayBuffer()))).toEqual([1, 2, 3])
  expect(payload?.signatureStatus).toBe('unsigned')

  const edit = { key: 'persist:xml-1', containerId: 'persist', xmlId: 'xml-1', archiveId: 'jar-1', originalPath: 'route.xml', appliedPath: 'route.xml', draftPath: 'route.xml', originalRaw: '<route/>', appliedRaw: '<route/>', draftRaw: '<route id="draft"/>', dirty: true, diagnostics: [], editorMode: 'text' as const, updatedAt: '2026-09-01T00:00:00Z' }
  await saveXmlEdit(edit)
  expect(await getXmlEdit('persist', 'xml-1')).toEqual(edit)

  await deleteContainer('persist')
  expect(await getJarPayload('persist', 'jar-1')).toBeUndefined()
  expect(await getXmlEdit('persist', 'xml-1')).toBeUndefined()
})

test('migrates a v1 inventory and marks unavailable historical artifacts', async () => {
  await deleteDatabase()
  const legacyInventory = inventory('legacy.war')
  legacyInventory.jars.push({ id: 'legacy-jar', name: 'legacy.jar', path: 'legacy.war!/legacy.jar', size: 1, entries: 1, xmlEntries: 0, manifest: {} } as Inventory['jars'][number])
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('iris-container-explorer', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('containers', { keyPath: 'id' })
      request.result.createObjectStore('inventories', { keyPath: 'containerId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const transaction = db.transaction(['containers', 'inventories'], 'readwrite')
  transaction.objectStore('containers').put({ id: 'legacy', name: 'legacy.war', displayName: 'legacy.war', hash: 'legacy-hash', type: 'WAR', size: 1, status: 'ready', processedAt: '2026-01-01T00:00:00Z', globalSearchEnabled: true, stats: { jars: 1, xmlFiles: 0, services: 0, routes: 0, targets: 0, beans: 0, issues: 0 } })
  transaction.objectStore('inventories').put({ containerId: 'legacy', inventory: legacyInventory })
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error) })
  db.close()

  const [restored] = await loadAllContainers()
  expect(restored.container.artifactsAvailable).toBe(false)
  expect(restored.inventory.jars[0]).toMatchObject({ kind: 'jar', payloadAvailability: 'missing', signatureStatus: 'unsigned' })
})

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('iris-container-explorer')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB deletion was blocked.'))
  })
}
