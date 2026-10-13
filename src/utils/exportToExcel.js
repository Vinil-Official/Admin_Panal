import * as XLSX from 'xlsx'
import { getAllLeads } from '../services/leadsService'

const exportColumns = [
  ['name', 'Business Name'],
  ['phone', 'Phone Number'],
  ['location', 'Location'],
  ['website', 'Website'],
  ['qualification_status', 'Qualification Status'],
  ['lead_score', 'Lead Score'],
  ['notes', 'Notes'],
  ['created_at', 'Created Date'],
  ['updated_at', 'Updated Date'],
]

function excelDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date
}

export async function exportLeadsToExcel(filters = {}) {
  const leads = await getAllLeads(filters)
  const rows = leads.map((lead) => Object.fromEntries(exportColumns.map(([column, label]) => [
    label,
    column.endsWith('_at') ? excelDate(lead[column]) : lead[column] ?? '',
  ])))
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: exportColumns.map(([, label]) => label),
    cellDates: true,
  })
  worksheet['!cols'] = [
    { wch: 38 }, { wch: 22 }, { wch: 30 }, { wch: 28 }, { wch: 26 },
    { wch: 18 }, { wch: 44 }, { wch: 22 }, { wch: 22 },
  ]
  worksheet['!autofilter'] = { ref: worksheet['!ref'] || 'A1:I1' }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Qualified Leads')
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `leads_export_${date}.xlsx`, { compression: true })
  return leads.length
}