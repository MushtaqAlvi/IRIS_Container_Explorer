import { expect, test } from 'vitest'
import { detectCamelVersion } from './camelVersion'

test('does not call match on missing manifest fields', () => {
  expect(detectCamelVersion('<beans/>', {}, 'customer.jar')).toBeUndefined()
})

test('detects Camel from manifest, library filename, and schema declarations', () => {
  expect(detectCamelVersion('', { 'Camel-Version': '4.10.7' }, 'service.jar')).toBe('4.10.7')
  expect(detectCamelVersion('', {}, 'camel-spring-3.22.4.jar')).toBe('3.22.4')
  expect(detectCamelVersion('<beans schemaLocation="camel-spring-4.14.5.xsd"/>', {}, 'service.jar')).toBe('4.14.5')
})
