import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Leaf, LogIn } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn, user, profile, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && user && profile) {
      const target =
        location.state?.from?.pathname ||
        (profile.role === 'admin' ? '/assortments' : '/pricelists')
      navigate(target, { replace: true })
    }
  }, [loading, user, profile])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error: err } = await signIn(email.trim(), password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-forest-dark px-4">
      <div className="w-full max-w-sm bg-forest border border-forest-light/40 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
            <Leaf size={20} className="text-gold" />
          </div>
          <div>
            <div className="font-display font-semibold text-cream">ПЧК/ADDIS</div>
            <div className="text-muted text-xs">Вход в систему</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-muted text-xs mb-1.5">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-forest-dark border border-forest-light/40 text-cream text-sm focus:outline-none focus:border-gold/60"
            />
          </div>

          <div>
            <label className="block text-muted text-xs mb-1.5">Пароль</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-forest-dark border border-forest-light/40 text-cream text-sm focus:outline-none focus:border-gold/60"
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
            <LogIn size={16} />
            {busy ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
