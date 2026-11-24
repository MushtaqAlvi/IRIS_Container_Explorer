export type Severity = 'error' | 'warning' | 'info'
export type ArchiveKind = 'war' | 'jar' | 'zip'
export type XmlClassification = 'camel-spring' | 'spring-beans' | 'other'
export type SignatureStatus = 'signed' | 'unsigned'
export type PayloadAvailability = 'available' | 'missing' | 'partial'
export type VisualCompatibility = 'compatible' | 'legacy-camel' | 'unknown-version' | 'invalid-xml' | 'unsupported-structure'

export interface Source { jar: string; jarPath: string; xml: string; serviceId?: string; routeId?: string; fromUri?: string }
export interface ArchiveArtifact {
  id: string; kind: ArchiveKind; parentArchiveId?: string; name: string; path: string; size: number; entries: number; xmlEntries: number
  sha256?: string; manifest: Record<string, string>; signatureStatus: SignatureStatus; payloadAvailability: PayloadAvailability
}
export interface XmlDiagnostic { severity: Severity; message: string; line?: number; column?: number }
export interface XmlArtifact extends Source {
  id: string; archiveId?: string; entryPath: string; size: number; root: string; namespace: string; classification: XmlClassification
  encoding: string; bom: boolean; declaration: string; contentHash: string; camelVersion?: string; visualCompatibility: VisualCompatibility
  parseStatus: 'ok' | 'error'; error?: string; diagnostics: XmlDiagnostic[]; raw: string
}
export interface Service extends Source { id: string; routeCount: number; restCount: number; onExceptionCount: number }
export interface RestEndpoint extends Source {
  id: string; archiveId?: string; restParentId: string; operationId: string; method: string; path: string; toUri: string; routeRef: string
  consumes: string; produces: string; requestType: string; responseType: string; relatedRouteIds: string[]; relatedTargetIds: string[]
}
export interface RestParameter extends Source { id: string; endpointId: string; name: string; type: string; dataType: string; required: string; description: string; defaultValue: string }
export interface Route extends Source { id: string; routeId: string; fromUri: string; toUris: string[]; processors: string[]; beans: string[]; propertyCount: number }
export interface RouteStep extends Source { id: string; routeId: string; index: number; depth: number; element: string; uri: string; ref: string; name: string; text: string; attributes: Record<string, string> }
export interface RouteProperty extends Source { id: string; routeId: string; name: string; value: string; expressionType: string }
export interface ProcessorReference extends Source { id: string; routeId: string; ref: string }
export interface BeanDefinition extends Source { id: string; beanId: string; className: string; scope: string; parent: string; dependsOn: string; factoryMethod: string; factoryBean: string }
export interface BeanReference extends Source { id: string; routeId: string; beanRef: string; method: string; beanType: string }
export interface Dependency { id: string; sourceId: string; targetId: string; relationship: 'CONTAINS' | 'CALLS' | 'USES' | 'EXPOSES' | 'REFERENCES' | 'ROUTES_TO' | 'PROCESSED_BY' | 'TARGETS'; label: string }
export interface ValidationIssue extends Source { id: string; severity: Severity; rule: string; message: string; entity: string; entityId: string }
export interface Inventory {
  container: { name: string; size: number; sha256: string; scannedAt: string; nestedArchives: number }
  archives: ArchiveArtifact[]; jars: ArchiveArtifact[]; xmlFiles: XmlArtifact[]; services: Service[]; restEndpoints: RestEndpoint[]; restParameters: RestParameter[]
  routes: Route[]; routeSteps: RouteStep[]; routeProperties: RouteProperty[]; processors: ProcessorReference[]; beanDefinitions: BeanDefinition[]; beanReferences: BeanReference[]
  dependencies: Dependency[]; issues: ValidationIssue[]; errors: { id: string; source: Partial<Source>; message: string }[]
}
export interface ScanProgress { phase: string; current: number; total: number; message: string }
export interface JarPayloadTransfer { artifactId: string; bytes: ArrayBuffer }
export interface ScanResult { inventory: Inventory; jarPayloads: JarPayloadTransfer[] }

export interface XmlEditRecord {
  key: string; containerId: string; xmlId: string; archiveId?: string; originalPath: string; appliedPath: string; draftPath: string
  originalRaw: string; appliedRaw: string; draftRaw: string; dirty: boolean; diagnostics: XmlDiagnostic[]; editorMode: 'text' | 'visual'; updatedAt: string
}
export interface StoredJarPayload {
  key: string; containerId: string; artifactId: string; name: string; path: string; blob: Blob; sha256: string; size: number
  signatureStatus: SignatureStatus; storedAt: string
}
export interface PackagingChange { action: 'replace' | 'rename'; originalPath: string; outputPath: string }
export interface PackagingResult { bytes: ArrayBuffer; filename: string; sha256: string; changes: PackagingChange[]; untouchedEntries: number }

export type WorkerRequest =
  | { type: 'scan'; requestId: string; name: string; bytes: ArrayBuffer; sha256?: boolean }
  | { type: 'applyXmlEdit'; requestId: string; inventory: Inventory; xmlId: string; path: string; raw: string }
  | { type: 'buildJar'; requestId: string; name: string; bytes: ArrayBuffer; edits: { originalPath: string; outputPath: string; raw: string }[]; serviceXmlPaths: string[] }
  | { type: 'cancel'; requestId: string }

export type WorkerResponse =
  | { type: 'progress'; requestId: string; progress: ScanProgress }
  | { type: 'complete'; requestId: string; result: ScanResult }
  | { type: 'xmlApplied'; requestId: string; inventory: Inventory }
  | { type: 'jarBuilt'; requestId: string; result: PackagingResult }
  | { type: 'fatal'; requestId: string; message: string }
