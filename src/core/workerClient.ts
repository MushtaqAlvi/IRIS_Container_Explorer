import type { Inventory, PackagingResult, ScanProgress, ScanResult, WorkerRequest, WorkerResponse } from './model'
import ParserWorker from '../workers/parser.worker?worker'

function runWorker<T>(request: WorkerRequest, transfer: Transferable[], complete: (response: WorkerResponse) => T | undefined, onProgress?: (progress: ScanProgress) => void) {
  return new Promise<T>((resolve, reject) => {
    const worker = new ParserWorker()
    const finish = () => worker.terminate()
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      if (response.requestId !== request.requestId) return
      if (response.type === 'progress') { onProgress?.(response.progress); return }
      if (response.type === 'fatal') { finish(); reject(new Error(response.message)); return }
      const result = complete(response)
      if (result !== undefined) { finish(); resolve(result) }
    }
    worker.onerror = () => { finish(); reject(new Error('The local workbench worker stopped unexpectedly.')) }
    worker.postMessage(request, transfer)
  })
}

export function scanContainer(name: string, bytes: ArrayBuffer, onProgress?: (progress: ScanProgress) => void) {
  const request: WorkerRequest = { type: 'scan', requestId: crypto.randomUUID(), name, bytes, sha256: false }
  return runWorker<ScanResult>(request, [bytes], response => response.type === 'complete' ? response.result : undefined, onProgress)
}
export function applyXmlEdit(inventory: Inventory, xmlId: string, path: string, raw: string) {
  const request: WorkerRequest = { type: 'applyXmlEdit', requestId: crypto.randomUUID(), inventory, xmlId, path, raw }
  return runWorker<Inventory>(request, [], response => response.type === 'xmlApplied' ? response.inventory : undefined)
}
export function buildModifiedJar(name: string, bytes: ArrayBuffer, edits: { originalPath: string; outputPath: string; raw: string }[], serviceXmlPaths: string[], onProgress?: (progress: ScanProgress) => void) {
  const request: WorkerRequest = { type: 'buildJar', requestId: crypto.randomUUID(), name, bytes, edits, serviceXmlPaths }
  return runWorker<PackagingResult>(request, [bytes], response => response.type === 'jarBuilt' ? response.result : undefined, onProgress)
}
