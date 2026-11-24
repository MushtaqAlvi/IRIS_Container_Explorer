export function detectCamelVersion(raw: string, manifest: Record<string, string | undefined> = {}, jarName = '') {
  const camelManifest = /apache camel|org\.apache\.camel/i.test(`${manifest['Implementation-Title'] ?? ''} ${manifest['Bundle-SymbolicName'] ?? ''}`)
  const candidates = [
    manifest['Camel-Version'],
    camelManifest ? manifest['Implementation-Version'] : undefined,
    camelManifest ? manifest['Bundle-Version'] : undefined,
    jarName.match(/camel-(?:core|spring)[^-]*-([0-9][\w.-]*)\.jar/i)?.[1],
    raw.match(/camel-spring-([0-9]+(?:\.[0-9]+)*)\.xsd/i)?.[1],
  ]
  return candidates.flatMap(value => typeof value === 'string' ? [value.match(/\d+(?:\.\d+){1,3}(?:[.-][\w-]+)*/)?.[0]] : []).find((value): value is string => !!value)
}
