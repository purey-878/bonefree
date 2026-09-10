import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

export type ProfileTab = 'overview' | 'coupons' | 'personal' | 'favorites'

const mobileQuery = '(max-width: 767px)'
function subscribeToViewport(listener: () => void) {
  const query = window.matchMedia(mobileQuery)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

export function useProfileNavigation(requestedTab: ProfileTab, couponsEnabled: boolean, ready: boolean) {
  const isMobile = useSyncExternalStore(subscribeToViewport, () => window.matchMedia(mobileQuery).matches, () => false)
  const [activeTab, setActiveTab] = useState<ProfileTab>(requestedTab)
  const navRef = useRef<HTMLElement>(null)
  const lastScrollTargetRef = useRef<ProfileTab | null>(null)
  const requestedVisibleTab = requestedTab === 'coupons' && !couponsEnabled ? 'personal' : requestedTab
  const visibleTab = isMobile ? (activeTab === 'coupons' && !couponsEnabled ? 'personal' : activeTab) : requestedVisibleTab

  const scrollToSection = useCallback((tab: ProfileTab, behavior: ScrollBehavior = 'smooth') => {
    const section = document.getElementById(`profile-${tab}`)
    const nav = navRef.current
    if (!section || !nav) return
    const offset = Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0
    window.scrollTo({
      top: window.scrollY + section.getBoundingClientRect().top - offset,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : behavior,
    })
  }, [])

  useEffect(() => {
    if (!isMobile) lastScrollTargetRef.current = null
    if (!ready || !isMobile) return
    const tab = requestedTab === 'coupons' && !couponsEnabled ? 'personal' : requestedTab
    if (tab === 'personal' && lastScrollTargetRef.current === null && window.scrollY === 0) {
      lastScrollTargetRef.current = tab
      return
    }
    // Data refreshes and pagination must not send the reader back to a previous section.
    if (lastScrollTargetRef.current === tab) return
    const frame = requestAnimationFrame(() => {
      scrollToSection(tab, 'instant')
      lastScrollTargetRef.current = tab
    })
    return () => cancelAnimationFrame(frame)
  }, [requestedTab, couponsEnabled, ready, isMobile, scrollToSection])

  useEffect(() => {
    if (!isMobile || !ready) return
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-profile-section]'))
    let frame = 0
    const updateActiveSection = () => {
      frame = 0
      const nav = navRef.current
      if (!nav) return
      const threshold = (sections[0] ? Number.parseFloat(getComputedStyle(sections[0]).scrollMarginTop) : 0) + 8
      let active: ProfileTab = 'personal'
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= threshold) active = section.dataset.profileSection as ProfileTab
      }
      setActiveTab(active)
    }
    const scheduleUpdate = () => { if (!frame) frame = requestAnimationFrame(updateActiveSection) }
    const observer = new ResizeObserver(scheduleUpdate)
    sections.forEach(section => observer.observe(section))
    if (navRef.current?.parentElement) observer.observe(navRef.current.parentElement)
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    scheduleUpdate()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [isMobile, ready, couponsEnabled])

  useEffect(() => {
    if (!isMobile) return
    const nav = navRef.current
    const button = nav?.querySelector<HTMLElement>(`[data-profile-tab="${visibleTab}"]`)
    if (nav && button) nav.scrollTo({ left: button.offsetLeft - (nav.clientWidth - button.offsetWidth) / 2, behavior: 'auto' })
  }, [isMobile, visibleTab])

  const selectTab = (tab: ProfileTab) => {
    setActiveTab(tab)
    if (isMobile) {
      lastScrollTargetRef.current = tab
      scrollToSection(tab)
    }
  }

  return { activeTab: visibleTab, isMobile, navRef, selectTab }
}
