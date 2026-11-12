// Minimal RFC 4180 reader for the sheet exported from Excel: quoted fields, "" escapes, CRLF.
// Excel uses `;` instead of `,` in locales where the comma is the decimal separator, so the
// delimiter is picked from the first line.

const QUOTE = '"'

function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  const commas = firstLine.split(',').length
  const semicolons = firstLine.split(';').length
  return semicolons > commas ? ';' : ','
}

/** Splits CSV text into rows of cells. Cells are returned as written (not trimmed). */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let isInsideQuotes = false

  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (isInsideQuotes) {
      const isEscapedQuote = character === QUOTE && text[index + 1] === QUOTE
      if (isEscapedQuote) {
        cell += QUOTE
        index++
      } else if (character === QUOTE) {
        isInsideQuotes = false
      } else {
        cell += character
      }
    } else if (character === QUOTE) {
      isInsideQuotes = true
    } else if (character === delimiter) {
      row.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }

  const hasUnfinishedRow = cell !== '' || row.length > 0
  if (hasUnfinishedRow) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
