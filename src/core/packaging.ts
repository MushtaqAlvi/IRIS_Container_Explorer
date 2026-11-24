import { unzipSync, zipSync } from 'fflate'
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import type { PackagingResult } from './model'
import { isJarSignaturePath, validatePackagingPaths } from './archiveSafety'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const MAX_JAR_BYTES = 1_000_000_000
const MAX_ENTRY_BYTES = 100_000_000

export interface PackagingEdit { originalPath: string; outputPath: string; raw: string }

export async function buildJarPackage(name: string, data: Uint8Array, edits: PackagingEdit[], serviceXmlPaths: string[]): Promise<PackagingResult> {
  if (data.byteLength > MAX_JAR_BYTES) throw new Error('The JAR exceeds the packaging size limit.')
  const centralDirectoryNames = readCentralDirectoryNames(data)
  const entries = unzipSync(data)
  const names = centralDirectoryNames.length ? centralDirectoryNames : Object.keys(entries)
  if (names.some(isJarSignaturePath)) throw new Error('Modified JAR generation is blocked because this JAR is signed.')
  const renamed = Object.fromEntries(edits.map(edit => [edit.originalPath, edit.outputPath]))
  const serviceXml = serviceXmlPaths.map(entryPath => ({ entryPath, classification: 'camel-spring' as const }))
  const problems = validatePackagingPaths(names, serviceXml, renamed)
  if (problems.length) throw new Error(problems.map(problem => `${problem.path}: ${problem.message}`).join(' '))
  const changes = edits.map(edit => ({ action: edit.originalPath === edit.outputPath ? 'replace' as const : 'rename' as const, originalPath: edit.originalPath, outputPath: edit.outputPath }))
  for (const edit of edits) {
    if (!Object.prototype.hasOwnProperty.call(entries, edit.originalPath)) throw new Error(`JAR entry not found: ${edit.originalPath}`)
    const bytes = encoder.encode(edit.raw)
    if (bytes.byteLength > MAX_ENTRY_BYTES) throw new Error(`Edited XML exceeds the per-entry size limit: ${edit.outputPath}`)
    assertWellFormedXml(edit.raw, edit.outputPath)
    if (edit.outputPath !== edit.originalPath) delete entries[edit.originalPath]
    entries[edit.outputPath] = bytes
  }
  const zipped = zipSync(entries, { level: 6 })
  const verified = unzipSync(zipped)
  for (const edit of edits) {
    if (!verified[edit.outputPath] || decoder.decode(verified[edit.outputPath]) !== edit.raw) throw new Error(`Modified JAR verification failed for ${edit.outputPath}.`)
  }
  const bytes = copyBuffer(zipped)
  return { bytes, filename: name.replace(/\.jar$/i, '') + '.modified.jar', sha256: await digest(bytes), changes, untouchedEntries: Math.max(0, names.length - new Set(edits.map(edit => edit.originalPath)).size) }
}

export function readCentralDirectoryNames(data: Uint8Array) {
  const names: string[] = []
  for (let offset = 0; offset + 46 <= data.byteLength;) {
    const signature = read32(data, offset)
    if (signature !== 0x02014b50) { offset += 1; continue }
    const nameLength = read16(data, offset + 28)
    const extraLength = read16(data, offset + 30)
    const commentLength = read16(data, offset + 32)
    if (offset + 46 + nameLength + extraLength + commentLength > data.byteLength) break
    names.push(decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength)))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return names
}

function assertWellFormedXml(raw: string, path: string) {
  let problem = ''
  let hasRoot = false
  try {
    const parser = new XmlDomParser({ onError: (level, message) => { if (level !== 'warning') problem ||= message } })
    hasRoot = !!parser.parseFromString(raw, 'application/xml').documentElement
  } catch (error) { problem ||= error instanceof Error ? error.message : String(error) }
  if (problem || !hasRoot) throw new Error(`Changed XML is invalid (${path}): ${problem || 'missing root element'}`)
}
function read16(data: Uint8Array, offset: number) { return data[offset] | data[offset + 1] << 8 }
function read32(data: Uint8Array, offset: number) { return (read16(data, offset) | read16(data, offset + 2) << 16) >>> 0 }
function copyBuffer(bytes: Uint8Array) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }
async function digest(bytes: ArrayBuffer) { const hash = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('') }
