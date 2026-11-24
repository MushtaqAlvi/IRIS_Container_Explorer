import type { ArchiveArtifact, Inventory, XmlArtifact } from './model'

export interface CamelJarSummary { jar: ArchiveArtifact; xmlFiles: XmlArtifact[]; routeCount: number; restCount: number }

export function camelWorkbenchJars(inventory: Inventory): CamelJarSummary[] {
  return inventory.jars
    .map(jar => {
      const xmlFiles = inventory.xmlFiles.filter(xml => xml.archiveId === jar.id && xml.classification === 'camel-spring')
      return { jar, xmlFiles, routeCount: inventory.routes.filter(route => route.jarPath === jar.path).length, restCount: inventory.restEndpoints.filter(endpoint => endpoint.archiveId === jar.id).length }
    })
    .filter(summary => summary.xmlFiles.length > 0)
    .sort((left, right) => Number(!left.jar.path.includes('/WEB-INF/lib/')) - Number(!right.jar.path.includes('/WEB-INF/lib/')) || left.jar.path.localeCompare(right.jar.path))
}

export function visualLabel(xml: XmlArtifact) {
  if (xml.visualCompatibility === 'compatible') return 'Visual editor ready'
  if (xml.visualCompatibility === 'unknown-version') return 'Choose a local catalog'
  if (xml.visualCompatibility === 'legacy-camel') return 'Text editor only'
  if (xml.visualCompatibility === 'invalid-xml') return 'Text editor only'
  return 'Visualizer available, text-only save'
}
