import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FlaskConical,
  Package,
  Leaf,
  Layers,
  Wrench,
  FolderOpen,
  FileText,
  BookText,
  Users,
  KeyRound,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAssortment } from '../contexts/AssortmentContext'
import ChangePasswordModal from './ChangePasswordModal'

const nav = [
  { to: '/assortments',     label: 'Ассортименты', icon: Layers,          adminOnly: true },
  { to: '/dashboard',       label: 'Дашборд',      icon: LayoutDashboard, adminOnly: true },
  { to: '/recipes',         label: 'Рецепты',      icon: FlaskConical,    adminOnly: true },
  { to: '/skus',            label: 'SKU',          icon: Package,         adminOnly: true },
  { to: '/materials',       label: 'Сырьё',        icon: Leaf,            adminOnly: true },
  { to: '/constructor',     label: 'Конструктор',  icon: Wrench,          adminOnly: true },
  { to: '/project',         label: 'Проект',       icon: FolderOpen,      adminOnly: true },
  { to: '/descriptions',    label: 'Описания',     icon: BookText,        adminOnly: true },
  { to: '/pricelists',      label: 'Прайс лист',   icon: FileText,        adminOnly: false },
  { to: '/admin/managers',  label: 'Менеджеры',    icon: Users,           adminOnly: true },
]

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const { assortment } = useAssortment()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const items = nav.filter((i) => {
    if (i.adminOnly && !isAdmin) return false
    // Прайс-лист — только в старом ассортименте (у админа); менеджеры видят всегда
    if (i.to === '/pricelists' && isAdmin && assortment?.code !== 'OLD_TEA') return false
    return true
  })
  const [showChangePassword, setShowChangePassword] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-60 flex-shrink-0 bg-forest border-r border-forest-light/40 flex flex-col">
        <div className="px-6 py-6 border-b border-forest-light/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center">
              <Leaf size={16} className="text-gold" />
            </div>
            <div>
              <div className="font-display font-semibold text-cream text-sm leading-tight">ПЧК/ADDIS</div>
              <div className="text-muted text-xs">Производство</div>
            </div>
          </div>
        </div>

        {isAdmin && assortment && (
          <button
            onClick={() => navigate('/assortments')}
            title="Сменить ассортимент"
            className="mx-3 mt-3 mb-1 px-3 py-2.5 rounded-lg bg-gold/10 border border-gold/20 text-left hover:bg-gold/15 transition-all"
          >
            <div className="text-muted text-[10px] font-body uppercase tracking-widest">Ассортимент</div>
            <div className="text-gold text-sm font-display font-semibold leading-tight truncate">{assortment.name}</div>
            <div className="text-muted text-[10px] font-body mt-0.5">Сменить →</div>
          </button>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-all ${
                  isActive
                    ? 'bg-gold/15 text-gold border border-gold/20'
                    : 'text-muted hover:text-cream hover:bg-forest-light/50'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-forest-light/40">
          {profile && (
            <div className="px-3 mb-3">
              <div className="text-cream text-sm font-body truncate">{profile.full_name}</div>
              <div className="text-muted text-xs">
                {profile.role === 'admin' ? 'Администратор' : 'Менеджер'}
              </div>
            </div>
          )}
          <button
            onClick={() => setShowChangePassword(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body text-muted hover:text-cream hover:bg-forest-light/50 transition-all"
          >
            <KeyRound size={16} />
            Сменить пароль
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body text-muted hover:text-cream hover:bg-forest-light/50 transition-all"
          >
            <LogOut size={16} />
            Выйти
          </button>
          <div className="text-muted text-xs font-mono mt-3 px-3">v0.7.0</div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-forest-dark">
        {children}
      </main>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  )
}
