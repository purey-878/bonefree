import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Download, FileArchive, LogOut, RefreshCw, Search, ShieldCheck, Trash2, Users, XCircle } from 'lucide-react'
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'

import ConfirmDialog from '../components/ui/ConfirmDialog'
import CustomSelect from '../components/ui/CustomSelect'
import { useToast } from '../components/ui/toastContext'
import { AdminSessionProvider } from '../context/AdminSessionProvider'
import { useAdminSession } from '../context/admin-session-context'
import {
  cancelDataAccessExport,
  createDataAccessCustomerExport,
  createDataAccessOrganizationExport,
  downloadDataAccessExport,
  listDataAccessCustomers,
  listDataAccessExports,
  readDataAccessPrivacyOverview,
  readDataAccessSession,
  regenerateDataAccessExport,
  requestDataAccessOtp,
  verifyDataAccessOtp,
  type CustomerAdminResponse,
  type DataAccessSessionResponse,
  type DataExportResponse,
  type OrganizationDataExportKind,
  type PrivacyOverviewResponse,
} from '../services/dataAccessService'
import './frozen-application.css'


type FrozenOrganization = {
  name: string
  dataAccessExpiresAt: string
}

const exportKinds: OrganizationDataExportKind[] = ['tenant', 'customers', 'orders', 'catalog', 'media']
const exportKindLabel: Record<OrganizationDataExportKind, string> = {
  tenant: 'Todos os dados da organização',
  customers: 'Dados dos clientes',
  orders: 'Pedidos',
  catalog: 'Catálogo',
  media: 'Imagens',
}

function formatDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
}

function statusLabel(status: DataExportResponse['status']) {
  return ({
    pending: 'A preparar ficheiro',
    processing: 'A preparar ficheiro',
    ready: 'Pronto para baixar',
    cancelled: 'Cancelado e ficheiro eliminado',
    failed: 'Não foi possível preparar',
    expired: 'Prazo do ficheiro terminado',
  } as const)[status]
}

function DataAccessLogin({ organization }: { organization: FrozenOrganization }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { isAuthenticated, mode, login, logout } = useAdminSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated && mode === 'operational') logout()
    if (isAuthenticated && mode === 'data_access') navigate('/admin/dashboard?tab=privacy', { replace: true })
  }, [isAuthenticated, logout, mode, navigate])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir o acesso.')
    } finally {
      setBusy(false)
    }
  }

  const submitCredentials = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const challenge = await requestDataAccessOtp(email, password)
      setChallengeId(challenge.challenge_id)
      setPassword('')
    })
  }

  const submitCode = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const response = await verifyDataAccessOtp(challengeId, code)
      login({
        token: response.access_token,
        name: response.owner.name || response.owner.email,
        role: 'owner',
        mode: 'data_access',
      })
      navigate('/admin/dashboard?tab=privacy', { replace: true })
    })
  }

  return (
    <main className="data-access-login">
      <section className="data-access-login-copy">
        <span>{organization.name}</span>
        <h1>Acesso temporário às cópias dos dados</h1>
        <p>A loja já está encerrada. Durante este período, somente o proprietário pode consultar clientes e guardar as cópias no próprio computador.</p>
        <strong><ShieldCheck /> Acesso até {formatDate(organization.dataAccessExpiresAt)}</strong>
        <small>Mantenha o DNS deste domínio apontado para a plataforma até concluir os downloads. Os ficheiros nunca são enviados por e-mail.</small>
      </section>
      <section className="data-access-login-card">
        <h2>{challengeId ? 'Confirmar código' : 'Entrar como proprietário'}</h2>
        {error && <div className="data-access-error" role="alert">{error}</div>}
        {!challengeId ? (
          <form onSubmit={submitCredentials}>
            <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Palavra-passe<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <button disabled={busy}>{busy ? 'A validar…' : 'Receber código por e-mail'}</button>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <p>Enviámos um código de seis dígitos para o e-mail do proprietário.</p>
            <label>Código<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /></label>
            <button disabled={busy || code.length !== 6}>{busy ? 'A confirmar…' : 'Confirmar e entrar'}</button>
            <button type="button" className="data-access-link-button" onClick={() => { setChallengeId(''); setCode('') }}>Voltar</button>
          </form>
        )}
      </section>
    </main>
  )
}

function ProtectedDataAccessRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, role, mode } = useAdminSession()
  if (!isAuthenticated || role !== 'owner' || mode !== 'data_access') return <Navigate to="/admin/login" replace />
  return <>{children}</>
}

function DataAccessDashboard({ organization }: { organization: FrozenOrganization }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [session, setSession] = useState<DataAccessSessionResponse | null>(null)
  const [customers, setCustomers] = useState<CustomerAdminResponse[]>([])
  const [exports, setExports] = useState<DataExportResponse[]>([])
  const [overview, setOverview] = useState<PrivacyOverviewResponse | null>(null)
  const [search, setSearch] = useState('')
  const [selectedKind, setSelectedKind] = useState<OrganizationDataExportKind>('tenant')
  const [exportToRemove, setExportToRemove] = useState<DataExportResponse | null>(null)
  const [confirmCopy, setConfirmCopy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { name, logout } = useAdminSession()
  const toast = useToast()
  const navigate = useNavigate()
  const view = searchParams.get('tab') === 'clientes' ? 'clientes' : 'privacy'

  const load = useCallback(async (customerSearch = search) => {
    const [currentSession, customerPage, exportList, privacy] = await Promise.all([
      readDataAccessSession(),
      listDataAccessCustomers(1, customerSearch),
      listDataAccessExports(),
      readDataAccessPrivacyOverview(),
    ])
    setSession(currentSession)
    setCustomers(customerPage.items ?? [])
    setExports(exportList)
    setOverview(privacy)
  }, [search])

  useEffect(() => {
    void load().catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os dados.')
      logout()
      navigate('/admin/login', { replace: true })
    })
  }, [load, logout, navigate])

  const hasPreparing = exports.some((item) => item.status === 'pending' || item.status === 'processing')
  useEffect(() => {
    if (!hasPreparing) return
    const timer = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(timer)
  }, [hasPreparing, load])

  const run = async (action: () => Promise<unknown>, successMessage?: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
      if (successMessage) toast.success(successMessage)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.')
    } finally {
      setBusy(false)
    }
  }

  const activeOrganizationExports = exports.filter((item) => (
    item.kind !== 'customer'
    && (
      item.status === 'pending'
      || item.status === 'processing'
      || (item.status === 'ready' && item.can_download)
      || (item.status === 'cancelled' && Boolean(item.expires_at) && new Date(item.expires_at as string).getTime() > Date.now())
    )
  ))
  const kindBlocked = (kind: OrganizationDataExportKind) => (
    kind === 'tenant'
      ? activeOrganizationExports.length > 0
      : activeOrganizationExports.some((item) => item.kind === 'tenant' || item.kind === kind)
  )
  const selectedBlocked = kindBlocked(selectedKind)
  const options = exportKinds.map((kind) => ({
    value: kind,
    label: `${exportKindLabel[kind]}${kindBlocked(kind) ? ' — indisponível' : ''}`,
    disabled: kindBlocked(kind),
  }))

  return (
    <div className="data-access-dashboard">
      <header>
        <div><span>{organization.name}</span><strong>Área de administração</strong></div>
        <div><span>{name} · Proprietário</span><button onClick={() => { logout(); navigate('/admin/login') }}><LogOut size={16} /> Terminar sessão</button></div>
      </header>
      <aside aria-label="Navegação da administração">
        <button className={view === 'clientes' ? 'active' : ''} onClick={() => setSearchParams({ tab: 'clientes' })}><Users size={18} /> Clientes</button>
        <button className={view === 'privacy' ? 'active' : ''} onClick={() => setSearchParams({ tab: 'privacy' })}><ShieldCheck size={18} /> Dados e privacidade</button>
      </aside>
      <main>
        {error && <div className="data-access-error" role="alert">{error}</div>}
        <div className="data-access-heading">
          <div><span>Acesso restrito</span><h1>{view === 'clientes' ? 'Clientes' : 'Cópia dos dados'}</h1><p>Disponível até {formatDate(session?.data_access_expires_at || organization.dataAccessExpiresAt)}</p></div>
          <button onClick={() => void run(() => load())}><RefreshCw size={16} /> Atualizar</button>
        </div>
        {view === 'clientes' ? (
          <>
            <form className="data-access-search" onSubmit={(event) => { event.preventDefault(); void run(() => load(search)) }}><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por nome ou e-mail" /><button>Pesquisar</button></form>
            <div className="data-access-customer-grid">
              {customers.map((customer) => (
                <article key={customer.customer_id}>
                  <div><span>CLI-{customer.customer_id}</span><h2>{[customer.name, customer.last_name].filter(Boolean).join(' ') || 'Cliente sem nome'}</h2><a href={`mailto:${customer.email}`}>{customer.email}</a></div>
                  <dl><div><dt>Telefone</dt><dd>{customer.phone || '—'}</dd></div><div><dt>NIF</dt><dd>{customer.tax_id || '—'}</dd></div><div><dt>Estado</dt><dd>{customer.status}</dd></div></dl>
                  <button disabled={busy} onClick={() => void run(() => createDataAccessCustomerExport(customer.customer_id))}><FileArchive size={16} /> Preparar dados deste cliente</button>
                </article>
              ))}
            </div>
          </>
        ) : (
          <>
            <section className="data-access-copy-card">
              <div><h2>Gerar uma cópia</h2><p>Escolha os dados que pretende guardar no seu computador. Cada opção pode ser usada uma vez a cada 24 horas.</p></div>
              <div>
                <CustomSelect aria-label="Dados a incluir na cópia" value={selectedKind} onChange={(value) => setSelectedKind(String(value) as OrganizationDataExportKind)} options={options} />
                <button disabled={busy || selectedBlocked} onClick={() => setConfirmCopy(true)}><FileArchive size={16} /> {selectedBlocked ? 'Indisponível durante 24 horas' : 'Gerar cópia selecionada'}</button>
              </div>
            </section>
            <section className="data-access-history">
              <h2>Fila e histórico de cópias</h2>
              <p>Os ficheiros ficam numa área privada durante 24 horas e nunca são enviados por e-mail.</p>
              {overview?.privacy_contact_email && <small>Contacto de privacidade: {overview.privacy_contact_email}</small>}
              <div>
                {exports.length === 0 && <p>Ainda não foi preparada nenhuma cópia.</p>}
                {exports.map((item) => (
                  <article key={item.export_id}>
                    <div><strong>{item.kind === 'customer' ? `Dados do cliente ${item.customer_id}` : exportKindLabel[item.kind as OrganizationDataExportKind]}</strong><span className={`is-${item.status}`}>{statusLabel(item.status)}</span><small>Pedido em {formatDate(item.created_at)}</small>{item.can_download && <small>Disponível até {formatDate(item.expires_at)}</small>}</div>
                    <div className="data-access-export-actions">
                      {item.can_download && <button onClick={() => void run(() => downloadDataAccessExport(item))}><Download size={15} /> Guardar no computador</button>}
                      {(item.status === 'pending' || item.status === 'processing') && <button className="is-danger" disabled={busy} onClick={() => setExportToRemove(item)}><XCircle size={15} /> Cancelar</button>}
                      {item.can_download && <button className="is-danger" disabled={busy} onClick={() => setExportToRemove(item)}><Trash2 size={15} /> Eliminar ficheiro</button>}
                      {!item.can_download && item.kind === 'customer' && !['pending', 'processing'].includes(item.status) && <button onClick={() => void run(() => regenerateDataAccessExport(item.export_id))}>Preparar novamente</button>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
      <ConfirmDialog
        open={confirmCopy}
        title={`Gerar “${exportKindLabel[selectedKind]}”?`}
        description="Esta opção ficará indisponível durante 24 horas. Acompanhe a preparação no histórico e guarde o ficheiro quando estiver pronto."
        confirmText="Sim, gerar cópia"
        cancelText="Cancelar"
        loading={busy}
        onCancel={() => setConfirmCopy(false)}
        onConfirm={() => { setConfirmCopy(false); void run(() => createDataAccessOrganizationExport(selectedKind)) }}
      />
      <ConfirmDialog
        open={Boolean(exportToRemove)}
        title={exportToRemove?.status === 'ready' ? 'Eliminar este ficheiro?' : 'Cancelar esta cópia?'}
        description={exportToRemove?.status === 'ready'
          ? 'O ficheiro privado será eliminado imediatamente e deixará de estar disponível para baixar.'
          : 'A preparação será cancelada e qualquer ficheiro que já tenha sido criado será eliminado.'}
        confirmText={exportToRemove?.status === 'ready' ? 'Sim, eliminar ficheiro' : 'Sim, cancelar cópia'}
        cancelText="Manter cópia"
        danger
        loading={busy}
        onCancel={() => setExportToRemove(null)}
        onConfirm={() => {
          if (!exportToRemove) return
          const selected = exportToRemove
          setExportToRemove(null)
          void run(
            () => cancelDataAccessExport(selected.export_id),
            selected.status === 'ready'
              ? 'O ficheiro foi eliminado.'
              : 'A cópia foi cancelada e os ficheiros foram eliminados.',
          )
        }}
      />
    </div>
  )
}

export default function FrozenApplication({ organization }: { organization: FrozenOrganization }) {
  return (
    <AdminSessionProvider>
      <Routes>
        <Route path="/admin/login" element={<DataAccessLogin organization={organization} />} />
        <Route path="/admin/dashboard" element={<ProtectedDataAccessRoute><DataAccessDashboard organization={organization} /></ProtectedDataAccessRoute>} />
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </AdminSessionProvider>
  )
}
