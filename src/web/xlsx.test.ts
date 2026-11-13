import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { xlsxBytes } from './xlsx'

describe('xlsxBytes', () => {
  it('writes an Excel workbook with the text cells at their positions', () => {
    const files = unzipSync(
      xlsxBytes([
        ['Horário', '1/11/2026'],
        ['', 'Banking'],
        ['0:00', 'a & b', '', 'kite'],
      ]),
    )
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'] as Uint8Array)
    expect(sheet).toContain('<c r="B1" t="inlineStr"><is><t>1/11/2026</t></is></c>')
    expect(sheet).toContain('<c r="B3" t="inlineStr"><is><t>a &amp; b</t></is></c>')
    expect(sheet).toContain('<c r="D3" t="inlineStr"><is><t>kite</t></is></c>')
    expect(sheet).not.toContain('r="A2"')
  })

  it('names columns past Z like Excel', () => {
    const row = Array.from({ length: 28 }, (_, index) => (index === 27 ? 'x' : ''))
    const sheet = strFromU8(unzipSync(xlsxBytes([row]))['xl/worksheets/sheet1.xml'] as Uint8Array)
    expect(sheet).toContain('r="AB1"')
  })
})
