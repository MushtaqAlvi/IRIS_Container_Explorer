import { describe, expect, test } from 'vitest'
import { isJarSignaturePath, suggestSafeXmlPath, validateArchiveEntryPath, validatePackagingPaths } from './archiveSafety'

describe('IRIS archive safety profile', () => {
  test.each([
    'service name.xml', 'service,name.xml', '../service.xml', '/service.xml', 'C:/service.xml',
    'folder\\service.xml', '.hidden/service.xml', 'service/../route.xml', 'service/route-ä.xml',
  ])('rejects unsafe service path %s', path => {
    expect(validateArchiveEntryPath(path, true).length).toBeGreaterThan(0)
  })

  test('accepts a safe nested service XML path', () => {
    expect(validateArchiveEntryPath('META-INF/camel/customer_service-1.xml', true)).toEqual([])
  })

  test('suggests a safe XML filename without renaming automatically', () => {
    expect(suggestSafeXmlPath('services/Customer, service ü')).toBe('services/Customer-service.xml')
  })

  test('detects every supported JAR signature sidecar', () => {
    for (const path of ['META-INF/APP.SF', 'META-INF/APP.RSA', 'META-INF/APP.DSA', 'META-INF/APP.EC']) expect(isJarSignaturePath(path)).toBe(true)
    expect(isJarSignaturePath('META-INF/MANIFEST.MF')).toBe(false)
  })

  test('rejects case-insensitive and Unicode-normalized path collisions', () => {
    const problems = validatePackagingPaths(['routes/A.xml', 'routes/a.xml'], [], {})
    expect(problems.some(problem => problem.rule === 'Archive path collision')).toBe(true)
  })

  test('validates every Camel service path, not only renamed entries', () => {
    const problems = validatePackagingPaths(['safe.xml', 'bad service.xml'], [{ entryPath: 'bad service.xml', classification: 'camel-spring' }])
    expect(problems.some(problem => problem.rule === 'Unsafe service filename')).toBe(true)
  })
})
