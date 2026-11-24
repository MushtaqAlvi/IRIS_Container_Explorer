import { DOMParser, XMLSerializer, type Document, type Element, type Node } from '@xmldom/xmldom'

const CAMEL_NS = 'http://camel.apache.org/schema/spring'
const MANAGED = new Set(['route', 'rest'])
const parser = () => new DOMParser({ onError: () => undefined })
const serializer = new XMLSerializer()
const local = (node: Element) => node.localName || node.nodeName.split(':').pop() || ''
const elementChildren = (node: Node) => Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1)
const descendants = (node: Node) => { const found: Element[] = []; const walk = (parent: Node) => elementChildren(parent).forEach(child => { found.push(child); walk(child) }); walk(node); return found }
const isManaged = (element: Element) => element.namespaceURI === CAMEL_NS && MANAGED.has(local(element))

type ManagedIdentity = { id: string; generated: boolean }
export type KaotoPreparation =
  | { ok: true; mode: 'editable' | 'read-only'; reason?: string; workingXml: string; patch: (kaotoXml: string) => string }
  | { ok: false; reason: string }

/** Creates Kaoto's working document from only top-level routes and REST APIs. */
export function prepareKaotoXml(original: string): KaotoPreparation {
  let doc: Document
  try { doc = parser().parseFromString(original, 'application/xml') } catch { return { ok: false, reason: 'The XML is not well formed.' } }
  const root = doc.documentElement
  if (!root) return { ok: false, reason: 'The XML has no document element.' }
  const candidates = camelContexts(root)
  if (candidates.length !== 1) return { ok: false, reason: 'Exactly one Camel context must be isolated for the visualizer.' }
  const context = candidates[0]
  const managed = elementChildren(context).filter(isManaged)
  if (!managed.length) return { ok: false, reason: 'No top-level Camel routes or REST definitions were found.' }
  if (managed.some(element => element.prefix || descendants(element).some(child => child.namespaceURI === CAMEL_NS && child.prefix))) return { ok: false, reason: 'Prefixed managed Camel elements cannot be normalized safely for Kaoto.' }
  const identities = identitiesFor(managed)
  if (!identities) return { ok: false, reason: 'Managed route and REST definitions need unambiguous identities.' }
  const namespaces = namespaceAttributes(root, context)
  const declaration = original.match(/^\s*(<\?xml[^>]*\?>)/i)?.[1]
  const content = managed.map((element, index) => managedXml(element, identities[index])).join('')
  const workingXml = `${declaration ? `${declaration}\n` : ''}<camel xmlns="${CAMEL_NS}"${namespaces}>${content}</camel>`
  const workingRoot = parser().parseFromString(workingXml, 'application/xml').documentElement
  if (!workingRoot || canonicalManaged(managed, identities) !== canonicalManaged(elementChildren(workingRoot), identities)) return { ok: false, reason: 'The visual working document failed its lossless route/REST preflight.' }
  const unsafeForSave = managed.some(containsComment)
  return { ok: true, mode: unsafeForSave ? 'read-only' : 'editable', reason: unsafeForSave ? 'Comments inside a managed route or REST definition are preserved in the source XML, so visual changes are text-only.' : undefined, workingXml, patch: kaotoXml => {
    if (unsafeForSave) throw new Error('Visual changes are disabled because managed comments could be lost. Use Text mode to edit this XML.')
    return patchContext(original, kaotoXml, identities)
  } }
}

function patchContext(original: string, kaotoXml: string, originalIdentities: ManagedIdentity[]) {
  const originalDoc = parser().parseFromString(original, 'application/xml')
  const workingDoc = parser().parseFromString(kaotoXml, 'application/xml')
  const originalRoot = originalDoc.documentElement
  const workingRoot = workingDoc.documentElement
  const context = originalRoot ? camelContexts(originalRoot)[0] : undefined
  if (!context || !workingRoot || local(workingRoot) !== 'camel') throw new Error('Kaoto returned an unsupported XML document.')
  const returned = elementChildren(workingRoot)
  if (returned.some(element => !isManaged(element))) throw new Error('Kaoto returned unsupported top-level Camel content.')
  const returnedById = new Map<string, Element>()
  for (const element of returned) { const id = element.getAttribute('id') || ''; if (!id || returnedById.has(id)) throw new Error('Kaoto returned ambiguous route or REST identities.'); returnedById.set(id, element) }
  const originalManaged = elementChildren(context).filter(isManaged)
  const known = new Set(originalIdentities.map(identity => identity.id))
  const additions = returned.filter(element => !known.has(element.getAttribute('id') || ''))
  if (additions.some(element => (element.getAttribute('id') || '').startsWith('iris-visual-'))) throw new Error('Kaoto returned an invalid generated route or REST identity.')
  originalManaged.forEach((element, index) => { const identity = originalIdentities[index]; const changed = returnedById.get(identity.id); if (!changed) { context.removeChild(element); return }; const replacement = originalDoc.importNode(changed, true) as Element; if (identity.generated) replacement.removeAttribute('id'); context.replaceChild(replacement, element) })
  additions.forEach(element => context.appendChild(originalDoc.importNode(element, true)))
  return serializer.serializeToString(originalDoc)
}

function identitiesFor(elements: Element[]): ManagedIdentity[] | undefined { const seen = new Set<string>(); const identities: ManagedIdentity[] = []; for (let index = 0; index < elements.length; index += 1) { const explicit = elements[index].getAttribute('id'); const id = explicit || `iris-visual-${local(elements[index])}-${index + 1}`; if (seen.has(id)) return undefined; seen.add(id); identities.push({ id, generated: !explicit }) } return identities }
function managedXml(element: Element, identity: ManagedIdentity) { const clone = element.cloneNode(true) as Element; if (identity.generated) clone.setAttribute('id', identity.id); return serializer.serializeToString(clone) }
function camelContexts(root: Element) { return [root, ...descendants(root)].filter(element => element.namespaceURI === CAMEL_NS && ['camel', 'camelContext'].includes(local(element))) }
function canonicalManaged(elements: Element[], identities: ManagedIdentity[]) { return elements.map((element, index) => canonicalElement(element, identities[index]?.generated ? identities[index].id : undefined)).join('') }
function canonicalElement(node: Element, generatedId?: string): string { const attributes = Array.from(node.attributes).filter(attribute => !attribute.name.startsWith('xmlns') && !(generatedId && attribute.name === 'id')).map(attribute => `${attribute.namespaceURI || ''}:${attribute.localName || attribute.name}=${attribute.value}`).sort().join('|'); const content = Array.from(node.childNodes).map(child => child.nodeType === 1 ? canonicalElement(child as Element) : child.nodeType === 3 ? (child.nodeValue || '').trim() : '').join(''); return `<${node.namespaceURI || ''}:${local(node)} ${attributes}>${content}</${local(node)}>` }
function containsComment(node: Node): boolean { return Array.from(node.childNodes).some(child => child.nodeType === 8 || containsComment(child)) }
function namespaceAttributes(...elements: Element[]) { const values = new Map<string, string>(); elements.forEach(element => Array.from(element.attributes).filter(attribute => attribute.name.startsWith('xmlns:')).forEach(attribute => values.set(attribute.name, attribute.value))); return Array.from(values).map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('') }
function escapeAttribute(value: string) { return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
