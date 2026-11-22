export function excelFilename(name: string, date = new Date()): string {
  const clean = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[ .]+$/g, '').trim().slice(0, 100) || 'MaptelaBridge'
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return `${clean}_${stamp}.xlsx`
}
