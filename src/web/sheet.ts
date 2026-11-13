// The manager's sheet, exported as CSV, read in the browser before it goes to the API.

/** Excel saves the sheet's CSV in Windows-1252 (decisions #16). */
export const readSheet = async (file: File) =>
  new TextDecoder('windows-1252').decode(await file.arrayBuffer())
