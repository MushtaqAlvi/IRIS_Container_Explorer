import { expect, test } from 'vitest'
import { selectKaotoCatalog } from './catalogSelection'

test('selects the exact catalog when bundled', () => {
  expect(selectKaotoCatalog('4.14.5')).toEqual({ name: 'Camel Main 4.14.5', version: '4.14.5', exact: true })
})

test('uses the nearest bundled patch only in the same major/minor line', () => {
  expect(selectKaotoCatalog('4.10.1')).toEqual({ name: 'Camel Main 4.10.7', version: '4.10.7', exact: false })
  expect(selectKaotoCatalog('4.11.1')).toBeUndefined()
  expect(selectKaotoCatalog('3.22.0')).toBeUndefined()
  expect(selectKaotoCatalog()).toBeUndefined()
})
