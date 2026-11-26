import { useEffect, useMemo, useState } from 'react'
import { hubApi } from '../shared/platform'
import { createDemoHub } from './demo'
import type { HubSnapshot } from './types'

export function useHub() {
  const api = useMemo(() => hubApi ?? createDemoHub(), [])
  const [snap, setSnap] = useState<HubSnapshot | null>(null)
  useEffect(() => {
    let alive = true
    api.getSnapshot().then((s) => alive && setSnap(s))
    const off = api.onSnapshot((s) => alive && setSnap(s))
    return () => {
      alive = false
      off()
    }
  }, [api])
  return { api, snap }
}
