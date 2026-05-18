import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('managers')
      .select('user_id, full_name, phone, role, is_active')
      .eq('user_id', userId)
      .maybeSingle()
    if (!data || !data.is_active) return null
    return data
  }

  useEffect(() => {
    let mounted = true

    // Первичная проверка сессии. getSession() освобождает auth-lock к моменту, когда
    // выполняется .then(), поэтому загружать профиль внутри безопасно.
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!mounted) return
        if (session?.user) {
          const prof = await loadProfile(session.user.id)
          if (!mounted) return
          if (!prof) {
            await supabase.auth.signOut()
            setUser(null)
            setProfile(null)
          } else {
            setUser(session.user)
            setProfile(prof)
          }
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Ошибка getSession:', err)
        if (mounted) setLoading(false)
      })

    // ВАЖНО: коллбэк onAuthStateChange — синхронный (НЕ async).
    // Любые supabase-запросы внутри оборачиваем в setTimeout(0), иначе deadlock:
    // gotrue держит lock, пока коллбэк не вернётся, а запрос внутри ждёт этот lock.
    // https://supabase.com/docs/reference/javascript/auth-onauthstatechange
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setTimeout(async () => {
        if (!mounted) return
        if (session?.user) {
          const prof = await loadProfile(session.user.id)
          if (!mounted) return
          if (!prof) {
            await supabase.auth.signOut()
            setUser(null)
            setProfile(null)
          } else {
            setUser(session.user)
            setProfile(prof)
          }
        } else {
          setUser(null)
          setProfile(null)
        }
      }, 0)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    const prof = await loadProfile(data.user.id)
    if (!prof) {
      await supabase.auth.signOut()
      return { error: 'Доступ закрыт. Обратитесь к администратору.' }
    }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
