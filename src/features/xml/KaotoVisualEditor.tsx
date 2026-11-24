import '@patternfly/react-core/dist/styles/base.css'
import KaotoRouteVisualization from './KaotoRouteVisualization'

// The Vite copy target publishes the bundled catalog at /camel-catalog.
// A missing path is handled by SPA fallback as index.html, which Kaoto then
// reports as an "Unexpected token '<'" JSON error.
const CATALOG_URL = `${import.meta.env.BASE_URL}camel-catalog/index.json`

export default function KaotoVisualEditor({ value, onChange, catalogName }: { value: string; onChange: (value: string) => void; catalogName: string }) {
  return <div className="kaoto-editor-host"><KaotoRouteVisualization catalogUrl={CATALOG_URL} runtimeCatalogName={catalogName} testingCatalogName="Citrus 4.10.0" code={value} codeChange={onChange} className="iris-kaoto-canvas" /></div>
}
