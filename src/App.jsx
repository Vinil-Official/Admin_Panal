import { useEffect, useState } from 'react'
import {
  Activity, ArrowDownUp, BarChart3, Check, ChevronLeft, ChevronRight,
  CircleAlert, Download, ExternalLink, FileSpreadsheet, Filter, LayoutDashboard,
  LoaderCircle, LogOut, Menu, Plus, Search, Settings, ShieldCheck, Trash2,
  Users, X,
} from 'lucide-react'
import { supabase } from './lib/supabaseClient'
import { createLead, deleteLead, getLeadStatuses, getLeadStats, getLeads, updateLead } from './services/leadsService'
import { exportLeadsToExcel } from './utils/exportToExcel'
import './App.css'

const emptyLead = {
  owner_id: '', source_lead_id: '', name: '', phone: '', location: '', website: '',
  qualification_status: '', lead_score: '', notes: '',
}

const statsConfig = [
  { label: 'Total leads', key: 'total', icon: Users, tone: 'blue' },
  { label: 'Qualified', key: 'qualified', icon: ShieldCheck, tone: 'green' },
  { label: 'Contacted', key: 'contacted', icon: Activity, tone: 'amber' },
  { label: 'Meetings', key: 'meetings', icon: Users, tone: 'violet' },
  { label: 'Proposals', key: 'proposals', icon: FileSpreadsheet, tone: 'teal' },
  { label: 'Deals', key: 'deals', icon: BarChart3, tone: 'rose' },
]

const ADMIN_LOGIN_KEY = 'northstar-admin-logged-in'
const HARD_CODED_USERNAME = 'techiecrew'
const HARD_CODED_PASSWORD = 'techie123'

function App() {
  const [session, setSession] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_LOGIN_KEY) === 'true'
        ? { user: { id: 'hardcoded-admin-user', email: HARD_CODED_USERNAME, app_metadata: { role: 'admin' } } }
        : null
    } catch {
      return null
    }
  })
  const [authReady, setAuthReady] = useState(true)
  const [authError, setAuthError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [activeView, setActiveView] = useState('Dashboard')
  const [leads, setLeads] = useState([])
  const [statuses, setStatuses] = useState([])
  const [stats, setStats] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState('created_at')
  const [ascending, setAscending] = useState(false)
  const [loadedRequestKey, setLoadedRequestKey] = useState('')
  const [exporting, setExporting] = useState(false)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyLead)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState(null)
  const [mobileMenu, setMobileMenu] = useState(false)

  const authorized = Boolean(session?.user?.app_metadata?.role === 'admin')
  const requestKey = JSON.stringify({ page, search, status: statusFilter, sort, ascending })
  const loading = authorized && loadedRequestKey !== requestKey

  useEffect(() => {
    try {
      if (session?.user?.app_metadata?.role === 'admin') {
        localStorage.setItem(ADMIN_LOGIN_KEY, 'true')
      } else {
        localStorage.removeItem(ADMIN_LOGIN_KEY)
      }
    } catch {
      // Ignore localStorage access failures and fall back to in-memory auth only.
    }
  }, [session])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) setAuthError(error.message)
      if (data?.session && data.session.user.app_metadata?.role !== 'admin') {
        setAuthError('This account is not authorized for admin access. Ask an administrator to grant the trusted admin role.')
      }
      setSession((currentSession) => currentSession ?? (data?.session ?? null))
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession && nextSession.user.app_metadata?.role !== 'admin') {
        setAuthError('This account is not authorized for admin access. Ask an administrator to grant the trusted admin role.')
      }
      setSession(nextSession)
    })
    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (session && !authorized && supabase) {
      supabase.auth.signOut()
    }
  }, [session, authorized])

  useEffect(() => {
    if (!authorized) return
    let alive = true
    const params = JSON.parse(requestKey)
    Promise.all([
      getLeads(params),
      getLeadStats(),
      getLeadStatuses(),
    ]).then(([pageResult, nextStats, nextStatuses]) => {
      if (!alive) return
      setLeads(pageResult.data)
      setTotal(pageResult.count)
      setStats(nextStats)
      setStatuses(nextStatuses)
      setAuthError('')
      setLoadedRequestKey(requestKey)
    }).catch((error) => {
      if (alive) {
        setAuthError(error.message || 'Could not load leads from Supabase.')
        setLoadedRequestKey(requestKey)
      }
    })
    return () => { alive = false }
  }, [authorized, requestKey])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  function openCreate() {
    setForm({ ...emptyLead, qualification_status: statuses[0] || '' })
    setModal({ type: 'form' })
  }

  function openEdit(lead) {
    setForm({ ...emptyLead, ...lead, lead_score: lead.lead_score ?? '' })
    setModal({ type: 'form', lead })
  }

  async function refreshData() {
    const [pageResult, nextStats, nextStatuses] = await Promise.all([
      getLeads({ page, search, status: statusFilter, sort, ascending }),
      getLeadStats(),
      getLeadStatuses(),
    ])
    setLeads(pageResult.data)
    setTotal(pageResult.count)
    setStats(nextStats)
    setStatuses(nextStatuses)
  }

  async function saveLead(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = {
        owner_id: form.owner_id.trim() || null,
        source_lead_id: form.source_lead_id.trim() || null,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        location: form.location.trim() || null,
        website: form.website.trim() || null,
        qualification_status: form.qualification_status.trim() || null,
        lead_score: form.lead_score === '' ? null : Number(form.lead_score),
        notes: form.notes.trim() || null,
      }
      if (!payload.name) throw new Error('Business name is required.')
      if (payload.lead_score !== null && (!Number.isInteger(payload.lead_score) || payload.lead_score < -2147483648 || payload.lead_score > 2147483647)) {
        throw new Error('Lead score must be a whole number supported by the database.')
      }
      if (modal.lead) await updateLead(modal.lead.id, payload)
      else await createLead(payload)
      setModal(null)
      setToast({ type: 'success', message: modal.lead ? 'Lead updated.' : 'Lead added.' })
      try {
        await refreshData()
      } catch (error) {
        setToast({ type: 'error', message: `Saved, but the table could not refresh: ${error.message}` })
      }
    } catch (error) {
      setToast({ type: 'error', message: error.message || 'The lead could not be saved.' })
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteLead(modal.lead.id)
      setModal(null)
      setToast({ type: 'success', message: 'Lead deleted.' })
      try {
        await refreshData()
      } catch (error) {
        setToast({ type: 'error', message: `Deleted, but the table could not refresh: ${error.message}` })
      }
    } catch (error) {
      setToast({ type: 'error', message: error.message || 'The lead could not be deleted.' })
    } finally {
      setDeleting(false)
    }
  }

  async function exportData() {
    setExporting(true)
    try {
      await exportLeadsToExcel({ search, status: statusFilter })
      setToast({ type: 'success', message: 'Excel export downloaded.' })
    } catch (error) {
      setToast({ type: 'error', message: error.message || 'Export failed.' })
    } finally {
      setExporting(false)
    }
  }

  async function signIn(event) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')

    if (!email.trim() || !password.trim()) {
      setAuthError('Please enter both username and password.')
      setAuthBusy(false)
      return
    }

    if (email.trim() === HARD_CODED_USERNAME && password === HARD_CODED_PASSWORD) {
      setSession({
        user: {
          id: 'hardcoded-admin-user',
          email: email.trim(),
          app_metadata: { role: 'admin' },
        },
      })
      setAuthBusy(false)
      return
    }

    setAuthError('Invalid username or password')
    setAuthBusy(false)
  }

  async function signOut() {
    if (supabase) {
      await supabase.auth.signOut()
    }
    setSession(null)
    setAuthError('')
    setLeads([])
    setStats(null)
    setEmail('')
    setPassword('')
    setShowPassword(false)
  }

  if (!authorized) {
    return <main className="login-screen">
      <div className="login-panel">
        <div className="brand-mark"><BarChart3 size={22} /></div>
        <p className="eyebrow">LEAD OPERATIONS</p>
        <h1>Admin sign in</h1>
        <p className="login-copy">Sign in with your authorized administrator account.</p>
        <form onSubmit={signIn} className="login-form" noValidate>
          <label>
            Username
            <input type="text" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="techiecrew" />
          </label>
          <label>
            Password
            <div className="password-field-wrap">
              <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          {authError && <div className="inline-error"><CircleAlert size={16} />{authError}</div>}
          <button className="button button-primary login-submit" disabled={authBusy}>
            {authBusy ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />}
            Sign in securely
          </button>
        </form>
        <div className="login-foot"><ShieldCheck size={14} />Hardcoded prototype login for admin access</div>
      </div>
      <div className="login-side"><span className="side-kicker">PIPELINE OVERVIEW</span><h2>Every lead,<br />in one clear view.</h2><p>Track qualification, activity, and deal progress from your existing Supabase records.</p><div className="side-stat"><span>LIVE DATA</span><strong>{supabase ? 'Supabase connected' : 'Local demo mode'}</strong></div></div>
    </main>
  }

  const pages = Math.max(1, Math.ceil(total / 10))
  const start = total === 0 ? 0 : page * 10 + 1
  const end = Math.min((page + 1) * 10, total)
  const title = activeView === 'Dashboard' ? 'Dashboard' : activeView === 'Manage Leads' ? 'Manage leads' : activeView

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#dashboard" onClick={() => setActiveView('Dashboard')}><span className="brand-mark"><BarChart3 size={20} /></span><span>Northstar<span className="brand-sub">LEAD DESK</span></span></a>
      <span className="nav-label">WORKSPACE</span>
      <nav className="primary-nav">
        <NavItem icon={LayoutDashboard} label="Dashboard" active={activeView === 'Dashboard'} onClick={() => { setActiveView('Dashboard'); setMobileMenu(false) }} />
        <NavItem icon={Users} label="Manage Leads" active={activeView === 'Manage Leads'} onClick={() => { setActiveView('Manage Leads'); setMobileMenu(false) }} />
        <NavItem icon={Plus} label="Add New Lead" onClick={() => { openCreate(); setMobileMenu(false) }} />
        <NavItem icon={Download} label="Export Data" onClick={exportData} busy={exporting} />
      </nav>
      <div className="sidebar-bottom">
        <NavItem icon={Settings} label="Settings" active={activeView === 'Settings'} onClick={() => { setActiveView('Settings'); setMobileMenu(false) }} />
        <div className="sidebar-user"><div className="avatar">{(session.user.email || 'A')[0].toUpperCase()}</div><div className="user-info"><strong>{session.user.email?.split('@')[0]}</strong><span>Administrator</span></div><button className="icon-button logout-button" aria-label="Log out" title="Log out" onClick={signOut}><LogOut size={17} /></button></div>
      </div>
    </aside>
    {mobileMenu && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu-button" aria-label="Open menu" onClick={() => setMobileMenu(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{title}</strong></div><div className="topbar-right"><span className="live-indicator"><i /> Live data</span><div className="topbar-avatar">{(session.user.email || 'A')[0].toUpperCase()}</div></div></header>
      <div className="page-content">
        {authError && <div className="banner-error"><CircleAlert size={17} />{authError}<button aria-label="Dismiss" onClick={() => setAuthError('')}><X size={16} /></button></div>}
        <div className="page-heading"><div><p className="eyebrow">OVERVIEW</p><h1>{title}</h1><p className="page-subtitle">Your pipeline at a glance, updated from Supabase.</p></div><button className="button button-primary" onClick={openCreate}><Plus size={17} />Add lead</button></div>
        {activeView === 'Settings' ? <section className="settings-panel"><div className="settings-icon"><ShieldCheck size={20} /></div><div><h2>Workspace security</h2><p>Signed in as {session.user.email}. Administrator access is checked using trusted Supabase user metadata and enforced for every data request by your table's RLS policies.</p><span className="connection-badge"><i /> Supabase session active</span></div></section> : <>
          <section className="stats-grid" aria-label="Lead statistics">
            {statsConfig.map(({ label, key, icon: Icon, tone }) => <article className="stat-card" key={key}><div className={`stat-icon ${tone}`}><Icon size={18} /></div><span className="stat-label">{label}</span><strong className="stat-value">{stats ? stats[key] : <span className="skeleton skeleton-number" />}</strong><span className="stat-caption">All records</span></article>)}
          </section>
          <section className="table-panel">
            <div className="table-heading"><div><h2>{activeView === 'Dashboard' ? 'Recent leads' : 'All leads'}</h2><p>{total.toLocaleString()} records in this view</p></div><button className="button button-quiet export-button" onClick={exportData} disabled={exporting}>{exporting ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}{exporting ? 'Preparing…' : 'Export .xlsx'}</button></div>
            <div className="table-toolbar"><label className="search-box"><Search size={17} /><input type="search" placeholder="Search business, phone, location…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} /></label><label className="filter-select"><Filter size={16} /><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0) }}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="sort-select"><ArrowDownUp size={16} /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="created_at">Created date</option><option value="name">Business name</option><option value="lead_score">Lead score</option><option value="qualification_status">Status</option></select></label><button className={`icon-button sort-direction ${ascending ? 'is-ascending' : ''}`} title={ascending ? 'Sort ascending' : 'Sort descending'} aria-label="Toggle sort direction" onClick={() => setAscending((value) => !value)}><ArrowDownUp size={16} /></button></div>
            <div className="table-wrap"><table><thead><tr><th>BUSINESS</th><th>PHONE</th><th>LOCATION</th><th>WEBSITE</th><th>STATUS</th><th>SCORE</th><th>CREATED</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
              {loading ? Array.from({ length: 5 }, (_, index) => <tr className="loading-row" key={index}><td colSpan="8"><span className="skeleton skeleton-row" /></td></tr>) : leads.map((lead) => <tr key={lead.id}><td><div className="business-cell"><strong>{lead.name || 'Unnamed business'}</strong><span>{lead.id}</span></div></td><td>{lead.phone || <span className="muted">—</span>}</td><td>{lead.location || <span className="muted">—</span>}</td><td>{lead.website ? <a className="website-link" href={/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" title={lead.website}><ExternalLink size={12} />{lead.website.replace(/^https?:\/\/(www\.)?/i, '')}</a> : <span className="muted">—</span>}</td><td><StatusBadge status={lead.qualification_status} /></td><td><span className="score-value">{lead.lead_score ?? '—'}</span></td><td>{formatDate(lead.created_at)}</td><td><div className="row-actions"><button className="icon-button" title="Edit lead" aria-label={`Edit ${lead.name || 'lead'}`} onClick={() => openEdit(lead)}><Settings size={15} /></button><button className="icon-button danger-action" title="Delete lead" aria-label={`Delete ${lead.name || 'lead'}`} onClick={() => setModal({ type: 'delete', lead })}><Trash2 size={15} /></button></div></td></tr>)}
              {!loading && leads.length === 0 && <tr><td colSpan="8"><div className="empty-state"><div className="empty-icon"><Search size={20} /></div><strong>{search || statusFilter ? 'No matching leads' : 'No leads yet'}</strong><p>{search || statusFilter ? 'Try a different search or status filter.' : 'New records from your Supabase table will appear here.'}</p>{!search && !statusFilter && <button className="button button-secondary" onClick={openCreate}><Plus size={16} />Add your first lead</button>}</div></td></tr>}
            </tbody></table></div>
            <footer className="table-footer"><span>Showing <strong>{start}–{end}</strong> of <strong>{total.toLocaleString()}</strong> leads</span><div className="pagination"><button className="icon-button" aria-label="Previous page" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(value - 1, 0))}><ChevronLeft size={17} /></button><span>Page {page + 1} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={page + 1 >= pages || loading} onClick={() => setPage((value) => Math.min(value + 1, pages - 1))}><ChevronRight size={17} /></button></div></footer>
          </section>
        </>}
        <footer className="page-footer"><span>Northstar Lead Desk</span><span>Connected to <strong>public.qualified_leads</strong></span></footer>
      </div>
    </main>
    {modal?.type === 'form' && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title"><header className="modal-header"><div><p className="eyebrow">LEAD RECORD</p><h2 id="lead-modal-title">{modal.lead ? 'Edit lead' : 'Add a lead'}</h2></div><button className="icon-button" aria-label="Close" onClick={() => setModal(null)}><X size={18} /></button></header><form onSubmit={saveLead}><div className="form-grid"><FormField label="Business name" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><FormField label="Phone number" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} /><FormField label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} /><FormField label="Website" type="url" value={form.website} onChange={(value) => setForm({ ...form, website: value })} /><label className="form-field"><span>Qualification status</span><input value={form.qualification_status} list="known-statuses" onChange={(event) => setForm({ ...form, qualification_status: event.target.value })} placeholder="Select or enter a status" /><datalist id="known-statuses">{statuses.map((status) => <option key={status} value={status} />)}</datalist></label><FormField label="Lead score" type="number" min="0" value={form.lead_score} onChange={(value) => setForm({ ...form, lead_score: value })} /><FormField label="Owner ID" value={form.owner_id} onChange={(value) => setForm({ ...form, owner_id: value })} /><FormField label="Source lead ID" value={form.source_lead_id} onChange={(value) => setForm({ ...form, source_lead_id: value })} /><label className="form-field form-field-wide"><span>Notes</span><textarea rows="4" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label></div><div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving && <LoaderCircle size={16} className="spin" />}{modal.lead ? 'Save changes' : 'Create lead'}</button></div></form></section></div>}
    {modal?.type === 'delete' && <div className="modal-backdrop"><section className="modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><div className="delete-icon"><Trash2 size={20} /></div><h2 id="delete-title">Delete this lead?</h2><p><strong>{modal.lead.name || 'This lead'}</strong> will be removed from the database. This action cannot be undone.</p><div className="modal-actions"><button className="button button-quiet" onClick={() => setModal(null)}>Keep lead</button><button className="button button-danger" onClick={confirmDelete} disabled={deleting}>{deleting && <LoaderCircle size={16} className="spin" />}Delete lead</button></div></section></div>}
    {toast && <div className={`toast toast-${toast.type}`} role="status">{toast.type === 'success' ? <Check size={17} /> : <CircleAlert size={17} />}{toast.message}<button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div>}
  </div>
}

function NavItem({ icon: Icon, label, active = false, onClick, busy = false }) {
  return <button className={`nav-item ${active ? 'nav-active' : ''}`} onClick={onClick}><Icon size={18} />{label}{busy && <LoaderCircle className="nav-spinner spin" size={14} />}</button>
}

function FormField({ label, value, onChange, type = 'text', required = false, min }) {
  return <label className="form-field"><span>{label}{required && <i> *</i>}</span><input type={type} value={value ?? ''} min={min} required={required} onChange={(event) => onChange(event.target.value)} /></label>
}

function StatusBadge({ status }) {
  const value = String(status || 'Unassigned')
  const normalized = value.toLowerCase()
  const tone = /deal|won|closed/.test(normalized) ? 'green' : /proposal/.test(normalized) ? 'violet' : /meeting|scheduled/.test(normalized) ? 'blue' : /contact|called|emailed/.test(normalized) ? 'amber' : /qualified/.test(normalized) ? 'teal' : 'neutral'
  return <span className={`status-badge status-${tone}`}><i />{value}</span>
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function SetupNotice() {
  return <main className="setup-screen"><div className="setup-card"><div className="brand-mark"><BarChart3 size={22} /></div><p className="eyebrow">CONFIGURATION REQUIRED</p><h1>Connect Supabase</h1><p>The dashboard needs the existing project's Vite environment variables. Add them to <code>my-Lead/.env.local</code>; this screen never uses or requests a service-role key.</p><pre>VITE_SUPABASE_URL=https://your-project.supabase.co<br />VITE_SUPABASE_ANON_KEY=your-existing-anon-key</pre><p>Restart the Vite development server after configuring the values.</p></div></main>
}

export default App
