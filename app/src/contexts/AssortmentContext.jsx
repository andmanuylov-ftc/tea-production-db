import { createContext, useContext, useState } from 'react'

const AssortmentContext = createContext({ assortment: null, setAssortment: () => {} })
const STORAGE_KEY = 'activeAssortment'

export function AssortmentProvider({ children }) {
  const [assortment, setAssortmentState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const setAssortment = (a) => {
    setAssortmentState(a)
    try {
      if (a) localStorage.setItem(STORAGE_KEY, JSON.stringify(a))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  return (
    <AssortmentContext.Provider value={{ assortment, setAssortment }}>
      {children}
    </AssortmentContext.Provider>
  )
}

export function useAssortment() {
  return useContext(AssortmentContext)
}
