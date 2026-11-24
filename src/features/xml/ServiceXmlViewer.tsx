import { ArrowLeft, Download, FileCode2 } from 'lucide-react'
import type { XmlArtifact } from '../../core/model'
import { downloadText } from '../../core/download'

export default function ServiceXmlViewer({ xml, onClose }: { xml: XmlArtifact; onClose: () => void }) {
  return <section className="service-xml-viewer"><header><div><span className="panel-label">Service XML</span><h2>{xml.entryPath}</h2><p>{xml.jarPath}</p></div><div><button className="ghost-button" onClick={onClose}><ArrowLeft size={16} /> Explorer</button><button className="primary-button" onClick={() => downloadText(xml.raw, xml.entryPath.split('/').pop() || 'service.xml')}><Download size={16} /> Download XML</button></div></header><div className="xml-readonly"><FileCode2 size={17} /><pre>{xml.raw}</pre></div></section>
}
