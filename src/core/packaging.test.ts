import { unzipSync, zipSync } from 'fflate'
import { describe, expect, test } from 'vitest'
import { buildJarPackage, readCentralDirectoryNames } from './packaging'

const bytes = (signed = false) => zipSync({
  'META-INF/MANIFEST.MF': new TextEncoder().encode('Manifest-Version: 1.0\n'),
  'camel/service.xml': new TextEncoder().encode('<camel><route id="old"/></camel>'),
  'data/unchanged.bin': new Uint8Array([0, 255, 3, 9]),
  ...(signed ? { 'META-INF/APP.SF': new Uint8Array([1]) } : {}),
})

describe('modified JAR packaging', () => {
  test('replaces only approved XML and verifies unchanged entry content', async () => {
    const original = bytes()
    const result = await buildJarPackage('service.jar', original, [{ originalPath: 'camel/service.xml', outputPath: 'camel/service.xml', raw: '<camel><route id="new"/></camel>' }], ['camel/service.xml'])
    const output = unzipSync(new Uint8Array(result.bytes))
    expect(new TextDecoder().decode(output['camel/service.xml'])).toContain('id="new"')
    expect(Array.from(output['data/unchanged.bin'])).toEqual([0, 255, 3, 9])
    expect(result.filename).toBe('service.modified.jar')
    expect(result.changes).toEqual([{ action: 'replace', originalPath: 'camel/service.xml', outputPath: 'camel/service.xml' }])
  })

  test('supports an explicit safe rename', async () => {
    const result = await buildJarPackage('service.jar', bytes(), [{ originalPath: 'camel/service.xml', outputPath: 'camel/customer.xml', raw: '<camel><route id="new"/></camel>' }], ['camel/service.xml'])
    const output = unzipSync(new Uint8Array(result.bytes))
    expect(output['camel/service.xml']).toBeUndefined()
    expect(output['camel/customer.xml']).toBeDefined()
  })

  test('blocks signed JARs, invalid XML, and unsafe service names', async () => {
    await expect(buildJarPackage('signed.jar', bytes(true), [{ originalPath: 'camel/service.xml', outputPath: 'camel/service.xml', raw: '<camel />' }], ['camel/service.xml'])).rejects.toThrow(/signed/i)
    await expect(buildJarPackage('invalid.jar', bytes(), [{ originalPath: 'camel/service.xml', outputPath: 'camel/service.xml', raw: '<camel>' }], ['camel/service.xml'])).rejects.toThrow(/invalid/i)
    await expect(buildJarPackage('unsafe.jar', bytes(), [{ originalPath: 'camel/service.xml', outputPath: 'camel/bad service.xml', raw: '<camel />' }], ['camel/service.xml'])).rejects.toThrow(/Whitespace/i)
  })

  test('reads central-directory names for duplicate-aware validation', () => {
    expect(readCentralDirectoryNames(bytes())).toEqual(expect.arrayContaining(['camel/service.xml', 'data/unchanged.bin']))
  })
})
