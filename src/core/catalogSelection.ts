const CAMEL_MAIN_CATALOGS = ['4.20.0', '4.18.2', '4.14.5', '4.10.7'] as const

export function selectKaotoCatalog(camelVersion?: string) {
  const match = camelVersion?.match(/^(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!match || match[1] !== '4') return undefined
  const sameLine = CAMEL_MAIN_CATALOGS.filter(version => version.startsWith(`${match[1]}.${match[2]}.`))
  if (!sameLine.length) return undefined
  const exact = sameLine.find(version => version === `${match[1]}.${match[2]}.${match[3] ?? '0'}`)
  const selected = exact ?? sameLine[0]
  return { name: `Camel Main ${selected}`, version: selected, exact: exact !== undefined }
}

export const kaotoCatalogVersions = [...CAMEL_MAIN_CATALOGS]
