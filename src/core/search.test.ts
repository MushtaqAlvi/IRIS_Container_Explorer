import { describe, expect, test } from 'vitest'
import type { Inventory, Source } from './model'
import { searchInventory } from './search'

const source: Source = { jar: 'customer.jar', jarPath: 'app.war!/WEB-INF/lib/customer.jar', xml: 'camel/customer.xml', serviceId: 'customer-service' }
const inventory: Inventory = {
  container: { name: 'app.war', size: 1, sha256: 'hash', scannedAt: '2026-09-01T00:00:00Z', nestedArchives: 1 },
  archives: [{ id: 'jar-1', kind: 'jar', name: 'customer.jar', path: source.jarPath, size: 1, entries: 1, xmlEntries: 1, manifest: {}, signatureStatus: 'unsigned', payloadAvailability: 'available' }],
  jars: [{ id: 'jar-1', kind: 'jar', name: 'customer.jar', path: source.jarPath, size: 1, entries: 1, xmlEntries: 1, manifest: {}, signatureStatus: 'unsigned', payloadAvailability: 'available' }],
  xmlFiles: [{ ...source, id: 'xml-1', archiveId: 'jar-1', entryPath: source.xml, size: 1, root: 'camel', namespace: 'http://camel.apache.org/schema/spring', classification: 'camel-spring', encoding: 'UTF-8', bom: false, declaration: '', contentHash: 'xmlhash', camelVersion: '4.10.7', visualCompatibility: 'compatible', parseStatus: 'ok', diagnostics: [], raw: '<camel />' }],
  services: [{ ...source, id: 'service-1', routeCount: 1, restCount: 1, onExceptionCount: 0 }],
  restEndpoints: [{ ...source, id: 'rest-1', archiveId: 'jar-1', restParentId: 'customers', operationId: 'getCustomer', method: 'GET', path: '/customers/{id}', toUri: 'direct:getCustomer', routeRef: '', consumes: '', produces: 'application/json', requestType: '', responseType: 'Customer', relatedRouteIds: ['route-1'], relatedTargetIds: ['target-1'] }],
  restParameters: [],
  routes: [{ ...source, id: 'route-1', routeId: 'get-customer-route', fromUri: 'direct:getCustomer', toUris: ['bean:customerProcessor'], processors: ['customerProcessor'], beans: ['customerBean'], propertyCount: 1 }],
  routeSteps: [],
  routeProperties: [{ ...source, id: 'target-1', routeId: 'get-customer-route', name: 'target', value: 'CUSTOMER.API', expressionType: 'constant' }],
  processors: [{ ...source, id: 'processor-1', routeId: 'get-customer-route', ref: 'customerProcessor' }],
  beanDefinitions: [{ ...source, id: 'bean-1', beanId: 'customerBean', className: 'org.example.CustomerBean', scope: 'singleton', parent: '', dependsOn: '', factoryMethod: '', factoryBean: '' }],
  beanReferences: [], dependencies: [], issues: [], errors: [],
}

describe('action-ready archive search', () => {
  test.each([
    ['rest:getCustomer', 'REST endpoint'], ['method:get', 'REST endpoint'], ['path:/customers', 'REST endpoint'],
    ['to:direct:getCustomer', 'REST endpoint'], ['target:CUSTOMER.API', 'Target'], ['route:get-customer', 'Route'],
    ['service:customer-service', 'Service'], ['jar:customer.jar', 'JAR'], ['xml:customer.xml', 'XML'],
    ['bean:CustomerBean', 'Bean'], ['processor:customerProcessor', 'Processor'], ['property:CUSTOMER.API', 'Target'],
  ])('supports %s', (query, expectedKind) => {
    expect(searchInventory(inventory, query).some(result => result.kind === expectedKind)).toBe(true)
  })

  test('returns REST-to-target ownership and actions without display-string reconstruction', () => {
    const endpoint = searchInventory(inventory, 'path:/customers/{id}').find(result => result.kind === 'REST endpoint')!
    expect(endpoint).toMatchObject({ archiveId: 'jar-1', xmlId: 'xml-1', relatedRouteIds: ['route-1'], relatedTargetIds: ['target-1'] })
    expect(endpoint.actions).toEqual(expect.arrayContaining(['open-xml', 'download-xml', 'download-jar']))
  })

  test('supports combined structured filters', () => {
    const results = searchInventory(inventory, 'method:GET target:CUSTOMER.API jar:customer')
    expect(results.map(result => result.kind)).toContain('REST endpoint')
  })
})
