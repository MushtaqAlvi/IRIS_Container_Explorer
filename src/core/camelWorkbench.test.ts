import { describe, expect, test } from 'vitest'
import { camelWorkbenchJars, visualLabel } from './camelWorkbench'
import type { Inventory } from './model'

const inventory = { jars: [
  { id: 'root', name: 'app.war', path: 'app.war', size: 1, entries: 1, xmlEntries: 0, kind: 'war', manifest: {}, signatureStatus: 'unsigned', payloadAvailability: 'available' },
  { id: 'lib', name: 'service.jar', path: 'app.war!/WEB-INF/lib/service.jar', size: 1, entries: 1, xmlEntries: 1, kind: 'jar', manifest: {}, signatureStatus: 'unsigned', payloadAvailability: 'available' },
] } as Pick<Inventory, 'jars'> & Partial<Inventory>

describe('Camel Workbench selection', () => {
  test('shows only JARs with Camel Spring XML and prioritises WEB-INF/lib', () => {
    const data = { ...inventory, xmlFiles: [
      { id: 'plain', archiveId: 'root', classification: 'other' },
      { id: 'camel', archiveId: 'lib', classification: 'camel-spring' },
    ], routes: [{ jarPath: 'app.war!/WEB-INF/lib/service.jar' }], restEndpoints: [{ archiveId: 'lib' }] } as unknown as Inventory
    const result = camelWorkbenchJars(data)
    expect(result).toHaveLength(1)
    expect(result[0].jar.id).toBe('lib')
    expect(result[0]).toMatchObject({ routeCount: 1, restCount: 1 })
  })

  test('makes the visual fallback explicit', () => {
    expect(visualLabel({ visualCompatibility: 'compatible' } as never)).toBe('Visual editor ready')
    expect(visualLabel({ visualCompatibility: 'legacy-camel' } as never)).toBe('Text editor only')
    expect(visualLabel({ visualCompatibility: 'unsupported-structure' } as never)).toBe('Visualizer available, text-only save')
  })
})
