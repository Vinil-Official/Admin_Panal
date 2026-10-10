import { supabase } from '../lib/supabaseClient'

export const LEADS_TABLE = 'qualified_leads'
export const LEAD_COLUMNS = [
  'id',
  'source_lead_id',
  'owner_id',
  'name',
  'phone',
  'location',
  'website',
  'qualification_status',
  'lead_score',
  'notes',
  'created_at',
  'updated_at',
].join(',')

const PAGE_SIZE = 10
const BATCH_SIZE = 1000
const SEARCH_COLUMNS = ['name', 'phone', 'location', 'website']

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured. Add the existing project URL and anon key to .env.local.')
  return supabase
}

function escapeSearch(value) {
  return value.trim().replace(/[(),.%_\\"]/g, ' ').replace(/\s+/g, ' ').trim()
}

function applyFilters(query, { search = '', status = '' } = {}) {
  if (status) query = query.eq('qualification_status', status)
  const safeSearch = escapeSearch(search)
  if (safeSearch) {
    const term = `%${safeSearch}%`
    query = query.or(SEARCH_COLUMNS.map((column) => `${column}.ilike.${term}`).join(','))
  }
  return query
}

export async function getLeads({ page = 0, search = '', status = '', sort = 'created_at', ascending = false } = {}) {
  const allowedSorts = ['created_at', 'name', 'lead_score', 'qualification_status']
  const sortColumn = allowedSorts.includes(sort) ? sort : 'created_at'
  let query = requireClient()
    .from(LEADS_TABLE)
    .select(LEAD_COLUMNS, { count: 'exact' })
  query = applyFilters(query, { search, status })
  const { data, count, error } = await query
    .order(sortColumn, { ascending, nullsFirst: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
  if (error) throw error
  return { data: data ?? [], count: count ?? 0 }
}

async function fetchBatches(columns, filters = {}) {
  const client = requireClient()
  const records = []
  for (let start = 0; ; start += BATCH_SIZE) {
    let query = client.from(LEADS_TABLE).select(columns)
    query = applyFilters(query, filters)
    const { data, error } = await query
      .order('created_at', { ascending: true, nullsFirst: true })
      .range(start, start + BATCH_SIZE - 1)
    if (error) throw error
    records.push(...(data ?? []))
    if (!data || data.length < BATCH_SIZE) break
  }
  return records
}

function isStatus(status, expressions, exclusions = []) {
  const normalized = String(status ?? '').toLowerCase().replace(/[_-]+/g, ' ')
  return !exclusions.some((expression) => expression.test(normalized))
    && expressions.some((expression) => expression.test(normalized))
}

export async function getLeadStats() {
  const records = await fetchBatches('id,qualification_status')
  return records.reduce((counts, lead) => {
    const status = lead.qualification_status
    counts.total += 1
    if (isStatus(status, [/\bqualif(?:ied|ication)\b/], [/\bunqualified\b/, /\bdisqualified\b/, /\bnot qualified\b/])) counts.qualified += 1
    if (isStatus(status, [/\bcontact(?:ed)?\b/, /\bcalled\b/, /\bemailed\b/], [/\buncontacted\b/, /\bnot contacted\b/])) counts.contacted += 1
    if (isStatus(status, [/\bmeetings?\b/, /\bdemos?\b/, /\bscheduled\b/], [/\bunscheduled\b/, /\bnot scheduled\b/])) counts.meetings += 1
    if (isStatus(status, [/\bproposals?\b/, /\bquotes?\b/], [/\bno proposal\b/])) counts.proposals += 1
    if (isStatus(status, [/\bdeals?\b/, /\bwon\b/, /\bclosed\b/], [/\blost\b/, /\bnot won\b/])) counts.deals += 1
    return counts
  }, { total: 0, qualified: 0, contacted: 0, meetings: 0, proposals: 0, deals: 0 })
}

export async function getLeadStatuses() {
  const records = await fetchBatches('qualification_status')
  return [...new Set(records.map((lead) => lead.qualification_status).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second))
}

export function getAllLeads({ search = '', status = '' } = {}) {
  return fetchBatches(LEAD_COLUMNS, { search, status })
}

export async function createLead(values) {
  const { data, error } = await requireClient()
    .from(LEADS_TABLE)
    .insert(values)
    .select('id')
    .single()
  if (error) throw error
  return data
}

export async function updateLead(id, values) {
  const { data, error } = await requireClient()
    .from(LEADS_TABLE)
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No lead was updated. It may no longer exist or your account may not have update access.')
  return data
}

export async function deleteLead(id) {
  const { data, error } = await requireClient()
    .from(LEADS_TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No lead was deleted. It may no longer exist or your account may not have delete access.')
  return data
}