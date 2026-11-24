import type { XmlArtifact } from './model'

export interface PathProblem { rule: string; message: string; path: string; suggestion?: string }

const SAFE_PATH = /^[A-Za-z0-9._/-]+$/
const SIGNATURE = /^META-INF\/(?:[^/]+\.)?(?:SF|RSA|DSA|EC)$/i

export function isJarSignaturePath(path: string) { return SIGNATURE.test(path) }

export function suggestSafeXmlPath(path: string) {
  const parts = path.replace(/\\/g, '/').split('/').filter(part => part && part !== '.' && part !== '..')
  const safe = parts.map(part => part.trim().replace(/[\s,]+/g, '-').replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[. -]+|[. -]+$/g, '') || 'service')
  const value = safe.join('/') || 'service.xml'
  return /\.xml$/i.test(value) ? value : `${value}.xml`
}

export function validateArchiveEntryPath(path: string, requireXml = false): PathProblem[] {
  const problems: PathProblem[] = []
  const suggestion = suggestSafeXmlPath(path)
  const add = (rule: string, message: string) => problems.push({ rule, message, path, suggestion })
  if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path)) add('Unsafe archive path', 'Absolute or empty archive paths are not allowed.')
  if (path.includes('\\')) add('Unsafe archive path', 'Backslashes are not allowed in JAR entry paths.')
  if (/\s/.test(path)) add('Unsafe service filename', 'Whitespace is not allowed in service XML paths.')
  if (path.includes(',')) add('Unsafe service filename', 'Commas are not allowed in service XML paths.')
  if (/[\u0000-\u001f\u007f]/.test(path)) add('Unsafe archive path', 'Control characters are not allowed in archive paths.')
  if (!SAFE_PATH.test(path)) add('Unsafe service filename', 'Only letters, numbers, dots, underscores, hyphens, and forward slashes are allowed.')
  const segments = path.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) add('Unsafe archive path', 'Empty, current-directory, and parent-directory segments are not allowed.')
  if (segments.some(segment => segment.startsWith('.') || segment.endsWith('.') || segment !== segment.trim())) add('Unsafe service filename', 'Path segments cannot start or end with dots or spaces.')
  if (segments.some(segment => new TextEncoder().encode(segment).byteLength > 255)) add('Oversized archive path', 'A path segment exceeds 255 UTF-8 bytes.')
  if (new TextEncoder().encode(path).byteLength > 1024) add('Oversized archive path', 'The full entry path exceeds 1024 UTF-8 bytes.')
  if (requireXml && !/\.xml$/i.test(path)) add('Invalid service extension', 'A service XML entry must end in .xml.')
  return dedupeProblems(problems)
}

export function validatePackagingPaths(entries: string[], serviceXml: Pick<XmlArtifact, 'entryPath' | 'classification'>[], renamed: Record<string, string> = {}) {
  const problems: PathProblem[] = []
  const outputs = entries.map(path => renamed[path] ?? path)
  serviceXml.filter(xml => xml.classification === 'camel-spring').forEach(xml => problems.push(...validateArchiveEntryPath(renamed[xml.entryPath] ?? xml.entryPath, true)))
  outputs.forEach(path => problems.push(...validateArchiveEntryPath(path, false).filter(problem => problem.rule === 'Unsafe archive path' || problem.rule === 'Oversized archive path')))
  const normalized = new Map<string, string>()
  outputs.forEach(path => {
    const key = path.normalize('NFC').toLowerCase()
    const previous = normalized.get(key)
    if (previous) problems.push({ rule: 'Archive path collision', message: `“${path}” collides with “${previous}” after case/Unicode normalization.`, path })
    else normalized.set(key, path)
  })
  return dedupeProblems(problems)
}

function dedupeProblems(problems: PathProblem[]) {
  const seen = new Set<string>()
  return problems.filter(problem => { const key = `${problem.rule}:${problem.path}:${problem.message}`; if (seen.has(key)) return false; seen.add(key); return true })
}
