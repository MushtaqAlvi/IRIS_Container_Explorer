import { useContext, useEffect, useLayoutEffect, useMemo } from 'react'
import { Visualization } from '@kaoto/kaoto'
import { VisualizationProvider } from '@patternfly/react-topology'
import { ControllerService } from '../../../node_modules/@kaoto/kaoto/lib/components/Visualization/Canvas/controller.service.js'
import { CatalogLoaderProvider } from '../../../node_modules/@kaoto/kaoto/lib/dynamic-catalog/catalog.provider.js'
import { CatalogModalProvider } from '../../../node_modules/@kaoto/kaoto/lib/dynamic-catalog/catalog-modal.provider.js'
import { CatalogTilesProvider } from '../../../node_modules/@kaoto/kaoto/lib/dynamic-catalog/catalog-tiles.provider.js'
import { EntitiesContext, EntitiesProvider } from '../../../node_modules/@kaoto/kaoto/lib/providers/entities.provider.js'
import { KaotoResourceProvider } from '../../../node_modules/@kaoto/kaoto/lib/providers/kaoto-resource.provider.js'
import { ReloadProvider } from '../../../node_modules/@kaoto/kaoto/lib/providers/reload.provider.js'
import { RuntimeProvider } from '../../../node_modules/@kaoto/kaoto/lib/providers/runtime.provider.js'
import { SchemasLoaderProvider } from '../../../node_modules/@kaoto/kaoto/lib/providers/schemas.provider.js'
import { VisibleFlowsContext, VisibleFlowsProvider } from '../../../node_modules/@kaoto/kaoto/lib/providers/visible-flows.provider.js'
import { EventNotifier } from '../../../node_modules/@kaoto/kaoto/lib/utils/event-notifier.js'

/**
 * Kaoto 2.11's exported RouteVisualization omits CatalogModalProvider. Its
 * canvas then crashes when a node performs a compatibility check. This wrapper
 * mirrors that component and supplies the two required catalog providers.
 */
export default function KaotoRouteVisualization({ catalogUrl, runtimeCatalogName, testingCatalogName, code, codeChange, className }: { catalogUrl: string; runtimeCatalogName: string; testingCatalogName: string; code: string; codeChange: (code: string) => void; className?: string }) {
  const notifier = EventNotifier.getInstance()
  useLayoutEffect(() => notifier.subscribe('entities:updated', (updated: string) => codeChange(updated)), [notifier, codeChange])
  useEffect(() => { notifier.next('code:updated', { code }) }, [code, notifier])
  const controller = useMemo(() => ControllerService.createController(), [])
  return <ReloadProvider><KaotoResourceProvider><RuntimeProvider catalogUrl={catalogUrl} runtimeCatalogName={runtimeCatalogName} testingCatalogName={testingCatalogName}><SchemasLoaderProvider><CatalogLoaderProvider><CatalogTilesProvider><EntitiesProvider><CatalogModalProvider><VisualizationProvider controller={controller}><VisibleFlowsProvider><VisibleFlowsVisualization className={className} /></VisibleFlowsProvider></VisualizationProvider></CatalogModalProvider></EntitiesProvider></CatalogTilesProvider></CatalogLoaderProvider></SchemasLoaderProvider></RuntimeProvider></KaotoResourceProvider></ReloadProvider>
}

function VisibleFlowsVisualization({ className = '' }: { className?: string }) {
  const flowContext = useContext(VisibleFlowsContext)
  const entities = useContext(EntitiesContext)
  useEffect(() => { flowContext?.visualFlowsApi.showFlows() }, [flowContext?.visualFlowsApi])
  return <Visualization className={`canvas-page ${className}`} entities={entities?.visualEntities ?? []} />
}
