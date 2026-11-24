import { describe, expect, test } from 'vitest'
import { prepareKaotoXml } from './kaotoAdapter'

const camelNamespace = 'http://camel.apache.org/schema/spring'

describe('route/REST focused Kaoto adapter', () => {
  test('patches managed routes while preserving Spring and Camel wrapper content', () => {
    const source = `<beans xmlns="http://www.springframework.org/schema/beans"><bean id="outside" class="KeepMe"/><!-- keep --><camelContext xmlns="${camelNamespace}" id="ctx"><onException><exception>java.lang.Exception</exception></onException><routeConfiguration id="shared"/><route id="route-a"><from uri="direct:a"/></route><rest id="api"><get uri="/customers"/></rest></camelContext></beans>`
    const prepared = prepareKaotoXml(source)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.mode).toBe('editable')
    expect(prepared.workingXml).not.toContain('onException')
    const patched = prepared.patch(prepared.workingXml.replace('direct:a', 'direct:changed'))
    expect(patched).toContain('class="KeepMe"')
    expect(patched).toContain('<!-- keep -->')
    expect(patched).toContain('<onException>')
    expect(patched).toContain('routeConfiguration')
    expect(patched).toContain('direct:changed')
  })

  test('uses temporary identities without writing them to the Spring XML', () => {
    const source = `<camelContext xmlns="${camelNamespace}"><route><from uri="direct:a"/></route><rest><get uri="/a"/></rest></camelContext>`
    const prepared = prepareKaotoXml(source)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.workingXml).toContain('iris-visual-route-1')
    expect(prepared.patch(prepared.workingXml.replace('direct:a', 'direct:b'))).not.toContain('iris-visual-')
  })

  test('keeps comments in a managed node visual-only and rejects ambiguous identities', () => {
    const comments = prepareKaotoXml(`<camel xmlns="${camelNamespace}"><route id="a"><!-- important --><from uri="direct:a"/></route></camel>`)
    expect(comments.ok).toBe(true)
    if (comments.ok) expect(comments.mode).toBe('read-only')
    expect(prepareKaotoXml(`<camel xmlns="${camelNamespace}"><route id="a"/><route id="a"/></camel>`).ok).toBe(false)
  })
})
