import Editor from '@monaco-editor/react'

export default function MonacoXmlEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Editor height="100%" defaultLanguage="xml" value={value} onChange={next => onChange(next ?? '')} theme="vs" options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 13, lineNumbersMinChars: 3, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2, formatOnPaste: true, formatOnType: true }} />
}
