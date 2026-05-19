import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { X, KeyRound, Check } from 'lucide-react'

export default function ChangePasswordModal({ onClose }) {
  const { user } = useAuth()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('Новый пароль — минимум 6 символов')
      return
    }
    if (newPassword !== newPassword2) {
      setError('Пароли не совпадают')
      return
    }
    if (newPassword === oldPassword) {
      setError('Новый пароль должен отличаться от старого')
      return
    }

    setBusy(true)

    // 1) Проверяем текущий пароль (через повторный сигн-ин с этим же email)
    const { error: signinErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    })
    if (signinErr) {
      setBusy(false)
      setError('Неверный текущий пароль')
      return
    }

    // 2) Обновляем пароль
    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword })
    setBusy(false)

    if (updErr) {
      setError(`Ошибка: ${updErr.message}`)
      return
    }

    setSuccess(true)
    setTimeout(() => onClose(), 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={busy ? undefined : onClose}>
      <div
        className="bg-forest border border-forest-light/40 rounded-xl p-6 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-gold" />
            <h2 className="font-display text-cream text-lg">Сменить пароль</h2>
          </div>
          <button onClick={onClose} disabled={busy} className="text-muted hover:text-cream disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check size={20} className="text-emerald-300" />
            </div>
            <div className="text-emerald-300 text-sm font-body">Пароль сменён</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-muted text-xs mb-1.5">Текущий пароль</label>
              <input
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-forest-dark border border-forest-light/40 text-cream text-sm focus:outline-none focus:border-gold/60"
              />
            </div>

            <div>
              <label className="block text-muted text-xs mb-1.5">Новый пароль <span className="text-muted/60">(мин. 6 символов)</span></label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-forest-dark border border-forest-light/40 text-cream text-sm focus:outline-none focus:border-gold/60"
              />
            </div>

            <div>
              <label className="block text-muted text-xs mb-1.5">Повторите новый пароль</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword2}
                onChange={e => setNewPassword2(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-forest-dark border border-forest-light/40 text-cream text-sm focus:outline-none focus:border-gold/60"
              />
            </div>

            {error && (
              <div className="text-sm text-red-300 bg-red-900/20 border border-red-700/40 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gold/15 text-gold border border-gold/30 text-sm font-body hover:bg-gold/25 transition-all disabled:opacity-50"
            >
              <KeyRound size={14} />
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
