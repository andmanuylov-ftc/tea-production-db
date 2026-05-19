import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import {
  UserPlus, UserCheck, UserX, Trash2, X, ShieldCheck, Users,
} from 'lucide-react'

const ROLES = [
  { value: 'manager', label: 'Менеджер' },
  { value: 'admin',   label: 'Администратор' },
]

function roleLabel(r) {
  return ROLES.find(x => x.value === r)?.label ?? r ?? '—'
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminManagers() {
  const { user: currentUser } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null) // user_id, на котором сейчас действие

  // Модалка добавления в managers
  const [addModalUser, setAddModalUser] = useState(null)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formRole, setFormRole] = useState('manager')
  const [formBusy, setFormBusy] = useState(false)

  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    loadData()
    return () => { mounted.current = false }
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('auth_users_managed')
      .select('*')
      .order('auth_created_at', { ascending: true })
    if (!mounted.current) return
    if (err) {
      setError(`Ошибка загрузки: ${err.message}`)
      setRows([])
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }

  // Сводные флаги
  const activeAdmins = rows.filter(r => r.role === 'admin' && r.is_active).length
  const totalManaged = rows.filter(r => r.manager_user_id !== null).length
  const totalAuth = rows.length

  // Действия --------------------------------------------------------

  async function handleAdd() {
    if (!addModalUser) return
    if (!formName.trim()) {
      alert('Укажите ФИО')
      return
    }
    setFormBusy(true)
    const { error: err } = await supabase
      .from('managers')
      .insert({
        user_id: addModalUser.user_id,
        full_name: formName.trim(),
        phone: formPhone.trim() || null,
        role: formRole,
        is_active: true,
        created_by: currentUser.id,
      })
    setFormBusy(false)
    if (err) {
      alert(`Не удалось добавить: ${err.message}`)
      return
    }
    closeAddModal()
    await loadData()
  }

  function openAddModal(row) {
    setAddModalUser(row)
    setFormName('')
    setFormPhone('')
    setFormRole('manager')
  }

  function closeAddModal() {
    if (formBusy) return
    setAddModalUser(null)
  }

  async function toggleActive(row) {
    if (busy) return
    // Защита от самодеактивации
    if (row.user_id === currentUser.id) {
      alert('Нельзя менять свою собственную активность.')
      return
    }
    // Защита последнего активного админа
    if (row.role === 'admin' && row.is_active && activeAdmins <= 1) {
      alert('Это последний активный администратор — деактивировать нельзя.')
      return
    }
    const action = row.is_active ? 'деактивировать' : 'активировать'
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} пользователя «${row.full_name}» (${row.email})?`)) return

    setBusy(row.user_id)
    const { error: err } = await supabase
      .from('managers')
      .update({ is_active: !row.is_active })
      .eq('user_id', row.user_id)
    setBusy(null)
    if (err) {
      alert(`Не удалось: ${err.message}`)
      return
    }
    await loadData()
  }

  async function deleteProfile(row) {
    if (busy) return
    if (row.user_id === currentUser.id) {
      alert('Нельзя удалить свой собственный профиль.')
      return
    }
    if (row.role === 'admin' && row.is_active && activeAdmins <= 1) {
      alert('Это последний активный администратор — удалить нельзя.')
      return
    }
    const msg = `Удалить запись профиля «${row.full_name}»?\n\nПользователь в auth.users ОСТАНЕТСЯ — удалить его полностью можно только в Supabase Dashboard.\n\nИстория скачиваний этого пользователя будет удалена (CASCADE).`
    if (!confirm(msg)) return

    setBusy(row.user_id)
    const { error: err } = await supabase
      .from('managers')
      .delete()
      .eq('user_id', row.user_id)
    setBusy(null)
    if (err) {
      alert(`Не удалось: ${err.message}`)
      return
    }
    await loadData()
  }

  // -------------------------------------------------------------------

  return (
    <div className="p-8">
      <PageHeader
        title="МЕНЕДЖЕРЫ"
        subtitle="Доступ к системе и роли"
        action={
          <div className="flex items-center gap-4 text-muted text-xs font-body">
            <span><Users size={13} className="inline -mt-0.5 mr-1" /><span className="text-cream">{totalManaged}</span> в профилях</span>
            <span className="text-muted/60">из {totalAuth} в auth</span>
            <span><ShieldCheck size={13} className="inline -mt-0.5 mr-1" /><span className="text-cream">{activeAdmins}</span> администратор(ов)</span>
          </div>
        }
      />

      <div className="card mb-6 p-4 bg-forest-light/5 border-forest-light/30">
        <div className="flex items-start gap-3 text-xs text-muted font-body leading-relaxed">
          <UserPlus size={14} className="text-gold flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-cream">Чтобы добавить нового пользователя:</span>
            <ol className="list-decimal list-inside mt-2 space-y-1 ml-2">
              <li>Supabase Dashboard → Authentication → Users → <span className="text-cream">Add user</span> (email, пароль, ✅ Auto Confirm)</li>
              <li>Обновить эту страницу — новый юзер появится в списке без профиля</li>
              <li>Нажать <span className="text-cream">«Добавить в managers»</span>, заполнить ФИО и роль</li>
              <li>Передать email и пароль менеджеру</li>
            </ol>
          </div>
        </div>
      </div>

      {error && (
        <div className="card mb-6 p-3 bg-red-900/20 border-red-700/40 text-red-300 text-sm font-body">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted text-sm font-mono animate-pulse">Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-12 text-muted text-sm font-body">
          Нет пользователей
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forest-light/20 bg-forest-light/5">
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Email</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">ФИО</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Роль</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Статус</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Последний вход</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-left px-4 py-3">Создан</th>
                  <th className="text-muted text-xs uppercase tracking-widest font-body text-right px-4 py-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isSelf = row.user_id === currentUser.id
                  const hasProfile = row.manager_user_id !== null
                  const isLastAdmin = row.role === 'admin' && row.is_active && activeAdmins <= 1
                  const isBusy = busy === row.user_id

                  return (
                    <tr
                      key={row.user_id}
                      className={`border-t border-forest-light/10 ${idx % 2 !== 0 ? 'bg-forest-light/5' : ''} ${isSelf ? 'bg-gold/5' : ''}`}
                    >
                      <td className="px-4 py-3 text-cream font-mono text-xs">
                        {row.email}
                        {isSelf && <span className="ml-2 text-gold text-xs">(вы)</span>}
                      </td>
                      <td className="px-4 py-3 text-cream font-body">
                        {row.full_name ?? <span className="text-muted italic">без профиля</span>}
                      </td>
                      <td className="px-4 py-3">
                        {row.role ? (
                          <span className={`text-xs font-body px-2 py-0.5 rounded border ${
                            row.role === 'admin'
                              ? 'bg-gold/15 text-gold border-gold/30'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {roleLabel(row.role)}
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {!hasProfile ? (
                          <span className="text-muted text-xs italic">—</span>
                        ) : row.is_active ? (
                          <span className="text-emerald-300 text-xs font-mono">активен</span>
                        ) : (
                          <span className="text-muted text-xs font-mono">отключён</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted text-xs font-mono whitespace-nowrap">
                        {formatDate(row.last_sign_in_at)}
                      </td>
                      <td className="px-4 py-3 text-muted text-xs font-mono whitespace-nowrap">
                        {formatDate(row.auth_created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {!hasProfile && (
                            <button
                              onClick={() => openAddModal(row)}
                              disabled={isBusy}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-emerald-500/40
                                         bg-emerald-500/10 text-emerald-300 text-xs font-body
                                         hover:bg-emerald-500/20 transition-colors
                                         disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Создать профиль в managers"
                            >
                              <UserPlus size={12} />
                              Добавить в managers
                            </button>
                          )}

                          {hasProfile && (
                            <>
                              <button
                                onClick={() => toggleActive(row)}
                                disabled={isBusy || isSelf || (row.is_active && isLastAdmin)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-body transition-colors
                                  disabled:opacity-30 disabled:cursor-not-allowed
                                  ${row.is_active
                                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                  }`}
                                title={
                                  isSelf ? 'Нельзя менять свою активность'
                                  : (row.is_active && isLastAdmin) ? 'Нельзя деактивировать последнего админа'
                                  : (row.is_active ? 'Деактивировать' : 'Активировать')
                                }
                              >
                                {row.is_active ? <><UserX size={12} />Деактивировать</> : <><UserCheck size={12} />Активировать</>}
                              </button>

                              <button
                                onClick={() => deleteProfile(row)}
                                disabled={isBusy || isSelf || (row.is_active && isLastAdmin)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-red-700/40
                                           bg-red-900/10 text-red-300 text-xs font-body
                                           hover:bg-red-900/20 transition-colors
                                           disabled:opacity-30 disabled:cursor-not-allowed"
                                title={
                                  isSelf ? 'Нельзя удалить свой профиль'
                                  : (row.is_active && isLastAdmin) ? 'Нельзя удалить последнего админа'
                                  : 'Удалить запись профиля (аккаунт в auth останется)'
                                }
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Модалка добавления в managers */}
      {addModalUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={closeAddModal}>
          <div
            className="bg-forest border border-forest-light/40 rounded-xl p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-cream text-lg">Добавить профиль</h2>
              <button onClick={closeAddModal} disabled={formBusy} className="text-muted hover:text-cream disabled:opacity-40">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 px-3 py-2 rounded-lg bg-forest-dark border border-forest-light/30">
              <div className="text-muted text-xs mb-1">Email</div>
              <div className="text-cream font-mono text-sm">{addModalUser.email}</div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-muted text-xs mb-1.5">ФИО *</label>
                <input
                  type="text"
                  autoFocus
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Иванов Иван Иванович"
                  className="w-full px-3 py-2 rounded-lg bg-forest-dark border border-forest-light/40 text-cream text-sm focus:outline-none focus:border-gold/60 placeholder:text-muted"
                />
              </div>

              <div>
                <label className="block text-muted text-xs mb-1.5">
                  Телефон <span className="text-muted/60">(необязательно)</span>
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={e => setFormPhone(e.target.value)}
                  placeholder="+7…"
                  className="w-full px-3 py-2 rounded-lg bg-forest-dark border border-forest-light/40 text-cream text-sm focus:outline-none focus:border-gold/60 placeholder:text-muted"
                />
              </div>

              <div>
                <label className="block text-muted text-xs mb-1.5">Роль</label>
                <div className="space-y-1.5">
                  {ROLES.map(r => (
                    <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="role"
                        value={r.value}
                        checked={formRole === r.value}
                        onChange={e => setFormRole(e.target.value)}
                        className="accent-gold"
                      />
                      <span className="text-cream text-sm font-body">{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={formBusy || !formName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                           border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-sm font-body
                           hover:bg-emerald-500/20 hover:border-emerald-500/60 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <UserPlus size={14} />
                {formBusy ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
