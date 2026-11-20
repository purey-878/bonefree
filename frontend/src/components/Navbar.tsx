import { ReservationPromotionBadge } from './ReservationPromotionNotice';
import { useReservationPromotion } from '../hooks/useReservationPromotion';
import { brandLogo } from "../constants/brandLogo"
import { ArrowUpRight, CalendarDays, Heart, House, MapPin, Sparkles, Sun, UtensilsCrossed, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import styled, { css, keyframes } from "styled-components";

import LanguageSwitcher from "./LanguageSwitcher";
const desktopLinks = [
  { path: "/", labelKey: "navigation.home", icon: House },
  { path: "/menu", labelKey: "navigation.menu", icon: UtensilsCrossed },
  { path: "/about", labelKey: "navigation.about", icon: Heart },
  { path: "/events", labelKey: "navigation.events", icon: CalendarDays },
  { path: "/contact", labelKey: "navigation.contact", icon: MapPin },
  { path: "/reservations", labelKey: "navigation.reserveTable" },
];

const drawerIn = keyframes`
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-14px);
  }

  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
`;

const TopNav = styled.header<{ $glassDark?: boolean; $hidden: boolean; $transparent: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  /* Above sticky page controls and below application overlays. */
  z-index: 1300;
  height:72px;
  transform: translateY(${({ $hidden }) => $hidden ? "calc(-100% - 48px)" : "0"});
  transition: transform 220ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  --nav-text: ${({ $glassDark }) =>
    $glassDark
      ? "rgba(255,255,255,0.92)"
      : "rgba(35,35,35,0.82)"};

  --nav-strong: ${({ $glassDark }) =>
    $glassDark
      ? "#ffffff"
      : "#121212"};

  --nav-surface: ${({ $glassDark }) =>
    $glassDark
      ? "rgba(255,255,255,0.14)"
      : "rgba(255,255,255,0.92)"};

  --nav-surface-hover: ${({ $glassDark }) =>
    $glassDark
      ? "rgba(253,205,67,0.24)"
      : "rgba(236,244,231,0.98)"};

  --nav-border: ${({ $glassDark }) =>
    $glassDark
      ? "rgba(255,255,255,0.26)"
      : "rgba(23,33,29,0.14)"};

  --nav-active-border: ${({ $glassDark }) =>
    $glassDark
      ? "rgba(253,205,67,0.48)"
      : "rgba(138,107,0,0.5)"};

  --nav-active-bg: ${({ $glassDark }) =>
    $glassDark
      ? "rgba(253,205,67,0.28)"
      : "rgba(138,107,0,0.18)"};

  --nav-active-text: ${({ $glassDark }) =>
    $glassDark
      ? "#fff7d1"
      : "#3f3000"};

  --nav-hover-text: ${({ $glassDark }) =>
    $glassDark
      ? "#ffffff"
      : "#111c18"};

  background: transparent;
  border: 0;
  box-shadow: none;
  backdrop-filter: ${({ $transparent }) => $transparent ? "blur(3px)" : "blur(12px)"};
  -webkit-backdrop-filter: ${({ $transparent }) => $transparent ? "blur(3px)" : "blur(12px)"};

  @media (max-width:767px){
    height:68px;
  }
`;
const NavInner = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: min(100%, 1440px);
  height: 100%;
  align-items: center;
  gap: 1rem;
  margin: 0 auto;
  padding: 0 1.5rem;

  @media (max-width: 1279px) {
    grid-template-columns: 48px minmax(0, 1fr) auto;
    padding: 0 1rem;
  }

  @media (max-width: 767px) {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    padding: 0 0.85rem;
  }
`;

const Logo = styled(Link)`
  display: inline-flex;
  grid-column: 1;
  justify-self: start;
  width: fit-content;
  align-items: center;
  gap: 0.62rem;
  color: var(--nav-strong, var(--brand-ink));
  font-size: 1.52rem;
  font-weight: 900;
  line-height: 1;
  text-decoration: none;
  letter-spacing: 0;

  img {
    display: block;
    width: auto;
    height: 42px;
    object-fit: contain;
  }

  &:hover {
    color: var(--nav-strong, var(--brand-ink));
  }

  @media (max-width: 767px) {
    grid-column: 2;
    justify-self: center;
    font-size: 1.35rem;
    img { height: 48px; }
  }

  @media (min-width: 768px) and (max-width: 1279px) {
    grid-column: 2;
    justify-self: start;
  }
`;

const CenterNav = styled.nav`
  grid-column: 2;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;

  @media (max-width: 1279px) {
    display: none;
  }

  @media (min-width: 1280px) and (max-width: 1439px) {
    gap: 0.12rem;
  }
`;

const backdropIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const PillLink = styled(Link) <{ $active: boolean }>`
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  padding: 0 0.95rem;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--nav-text, var(--brand-muted));
  font-size: 0.92rem;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;

  ${({ $active }) =>
    $active &&
    css`
      border-color: var(--nav-active-border);
      background: var(--nav-active-bg);
      color: var(--nav-active-text);
      box-shadow:
        0 8px 18px rgba(138, 107, 0, 0.12),
        inset 0 1px 0 rgba(255, 255, 255, 0.24);
    `}

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(138, 107, 0, 0.42);
    background: var(--nav-surface-hover, #f4f8f1);
    color: var(--nav-hover-text);
  }

  @media (min-width: 1280px) and (max-width: 1439px) {
    min-height: 36px;
    padding-inline: 0.55rem;
    font-size: 0.82rem;
  }
`;

const ReservationLink = styled(PillLink)`
  .reservation-promo-badge { background: #076050; color: #fff8e8; box-shadow: none; }

  gap: .5rem;
  min-height: 42px;
  border-radius: 18px 18px 18px 6px;
  background: var(--brand-accent, #fdcd43);
  border: 1px solid rgba(96, 74, 13, .14);
  color: #263c22;
  box-shadow: 0 3px 0 #cda82e;
  transform: rotate(-2deg);

  svg { flex-shrink: 0; transition: transform 180ms ease; }

  &:hover {
    background: color-mix(in srgb, var(--brand-accent, #fdcd43) 85%, white);
    border-color: rgba(96, 74, 13, .14);
    color: #263c22;
    transform: rotate(1deg) translateY(-2px);
    box-shadow: 0 5px 0 #cda82e;
  }
  &:hover svg { transform: rotate(12deg); }
  &:active { transform: rotate(0deg) translateY(2px); box-shadow: 0 1px 0 #cda82e; }
  &:focus-visible { outline: 3px solid var(--brand-main); outline-offset: 4px; }

  @media (max-width: 1279px) { display: none; }
  @media (prefers-reduced-motion: reduce) {
    &, svg { transition: none; }
    &:hover { transform: rotate(-2deg); }
    &:hover svg { transform: none; }
    &:active { transform: rotate(-2deg); }
  }
`;

const NavActions = styled.div`
  grid-column: 3;
  justify-self: end;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  min-width: max-content;

  > * {
    flex-shrink: 0;
  }

  @media (min-width: 1280px) and (max-width: 1439px) {
    gap: 0.38rem;
  }

  @media (max-width: 767px) {
    display: none;
  }
`;

const MobileLeft = styled.div`
  display: none;

  @media (max-width: 1279px) {
    grid-column: 1;
    display: flex;
    align-items: center;
    justify-content: flex-start;

    > button {
      border: 1px solid #263c2233;
      border-radius: 16px 16px 16px 6px;
      background: #fff9e9;
      box-shadow: 0 3px 0 #263c2230;
      transform: rotate(-4deg);
    }
  }
`;

const MobileRight = styled.div`
  display: none;

  @media (max-width: 767px) {
    grid-column: 3;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.4rem;
  }
`;

const IconAction = styled.button`
  position: relative;
  display: inline-grid;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border: 1px solid var(--nav-border, var(--glass-border));
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--nav-strong, var(--brand-ink));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  transition:
    background 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;

  svg {
    width: 22px;
    min-width: 22px;
    height: 22px;
    flex: 0 0 22px;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(138, 107, 0, 0.45);
    background: var(--nav-surface-hover, #f4f8f1);
    color: var(--nav-strong, var(--brand-secondary));
  }

  @media (max-width: 767px) {
    border: 0;
    border-radius: 50%;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;

    &:hover {
      transform: none;
    }

    &:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
  }
`;

const BurgerIcon = styled.span`
  position: relative;
  display: block;
  width: 32px;
  height: 28px;
  pointer-events: none;

  &::before,
  &::after {
    content: "";
    position: absolute;
    left: 2px;
    width: 28px;
    height: 9px;
    box-sizing: border-box;
    border: 2px solid #171915;
    border-radius: 999px;
    background: #ffc477;
  }

  &::before { top: 0; }
  &::after { bottom: 0; }

  > span {
    position: absolute;
    top: 10px;
    left: 0;
    width: 32px;
    height: 9px;
    box-sizing: border-box;
    border: 2px solid #171915;
    border-radius: 999px;
    background: #9f6b43;
    transform: rotate(-5deg);
  }

  > span::before,
  > span::after {
    content: "";
    position: absolute;
    height: 5px;
    box-sizing: border-box;
    border: 1.5px solid #171915;
    border-radius: 999px;
  }

  > span::before {
    top: -4px;
    left: -2px;
    width: 23px;
    background: #ef4435;
    transform: rotate(9deg);
  }

  > span::after {
    right: 2px;
    bottom: -4px;
    width: 14px;
    background: #7baf4b;
  }
`;

const Backdrop = styled.button`
  position: fixed;
  inset: 0;
  z-index: 1310;
  border: 0;
  background: rgba(12, 39, 32, .45);
  backdrop-filter: blur(6px);
  animation: ${backdropIn} 180ms ease both;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const MobileDrawer = styled.aside`
  position: fixed;
  top: 14px;
  left: 50%;
  z-index: 1320;
  display: flex;
  width: min(480px, calc(100vw - 24px));
  max-height: calc(100dvh - 28px - env(safe-area-inset-bottom, 0px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #263c2226;
  border-radius: 28px 28px 28px 10px;
  background: #fffaf0;
  color: #263c22;
  box-shadow: 0 8px 0 #263c2240, 0 24px 70px #102b3540;
  transform: translateX(-50%);
  animation: ${drawerIn} 220ms ease;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const DrawerHeader = styled.div`
  display: flex;
  flex-shrink: 0;
  min-height: 76px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 0 20px;
  border-bottom: 1px dashed #263c2233;

  ${Logo} {
    grid-column: auto;
    img { height: 46px; }
    justify-self: auto;
  }

  ${IconAction} {
    border: 1px solid #263c2233;
    border-radius: 50%;
    background: #ffffff;
    color: #263c22;
    box-shadow: 0 2px 0 #263c2220;
    backdrop-filter: none;
    &:focus-visible { outline: 3px solid #076050; outline-offset: 3px; }
  }
`;

const DrawerBody = styled.div`
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 20px calc(22px + env(safe-area-inset-bottom, 0px));
`;

const DrawerGreeting = styled.p`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: .85rem;
  font-weight: 700;
  svg { color: #a15b11; flex-shrink: 0; transform: rotate(-12deg); }
`;

const DrawerActions = styled.div`
  display: grid;
  gap: 12px;
`;

const DrawerAction = styled(Link)<{ $meal?: boolean }>`
  .reservation-promo-badge { background: #076050; color: #fff8e8; }

  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 86px;
  padding: 16px;
  border: 1px solid #263c2226;
  border-radius: ${({ $meal }) => $meal ? '20px 8px 20px 20px' : '20px 20px 20px 8px'};
  background: ${({ $meal }) => $meal ? '#076050' : '#fdcd43'};
  color: ${({ $meal }) => $meal ? '#fffaf0' : '#263c22'};
  box-shadow: 0 4px 0 ${({ $meal }) => $meal ? '#03473b' : '#d4aa2b'};
  text-decoration: none;
  transition: transform 160ms ease, box-shadow 160ms ease;

  > svg:first-child {
    flex-shrink: 0;
    width: 42px;
    height: 42px;
    padding: 9px;
    border: 1px solid currentColor;
    border-radius: 14px 14px 14px 5px;
    transform: rotate(-6deg);
  }
  > svg:last-child { flex-shrink: 0; margin-left: auto; }
  > span { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; min-width: 0; }
  strong { width: 100%; font-size: 1rem; line-height: 1.3; font-weight: 850; }
  small { font-size: .73rem; line-height: 1.4; opacity: .9; }
  &:hover { color: ${({ $meal }) => $meal ? '#fffaf0' : '#263c22'}; transform: translateY(-2px); }
  &[aria-current="page"] { outline: 2px dashed currentColor; outline-offset: -6px; }
  &:focus-visible { outline: 3px solid #a15b11; outline-offset: 5px; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:hover { transform: none; } }
  @media (max-width: 359px) { padding: 13px 11px; gap: 9px; strong { font-size: .9rem; } }
`;

const DrawerNav = styled.nav`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`;

const DrawerLink = styled(Link)<{ $active: boolean }>`
  display: flex;
  min-width: 0;
  min-height: 52px;
  align-items: center;
  gap: 9px;
  padding: 12px;
  border: 1px solid ${({ $active }) => $active ? '#07605055' : '#263c2214'};
  border-radius: 14px;
  background: ${({ $active }) => $active ? '#e3edda' : '#ffffff80'};
  color: #263c22;
  font-size: .85rem;
  line-height: 1.3;
  font-weight: 750;
  text-decoration: none;
  svg { flex-shrink: 0; width: 18px; height: 18px; color: #076050; }
  span { min-width: 0; overflow-wrap: anywhere; hyphens: auto; }
  &:last-child { grid-column: 1 / -1; }
  &[aria-current="page"]::after { content: ''; width: 7px; height: 7px; flex-shrink: 0; margin-left: auto; border-radius: 50%; background: #076050; }
  &:hover { background: #e3edda; color: #263c22; }
  &:focus-visible { outline: 3px solid #076050; outline-offset: 2px; }
`;

const Navbar = ({ renderStatic = false }: { renderStatic?: boolean }) => {
  const { t } = useTranslation("common");
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const promotion = useReservationPromotion();
  const [navHidden, setNavHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeDrawer = () => setDrawerOpen(false);
  const isActive = (path: string) => path === "/" ? location.pathname === "/" : path === "/menu" ? /^\/(menu|product)(\/|$)/.test(location.pathname) : location.pathname.startsWith(path);
  const glassDarkNav = ["/", "/contact", "/about", "/events"].includes(location.pathname);
  useEffect(() => {
    let previousY = Math.max(0, window.scrollY);
    let previousTime = performance.now();
    let direction = 0;
    let distance = 0;
    let gestureStart = previousTime;
    let frame = 0;
    let hidden = false;

    const update = () => {
      frame = 0;
      // Clamp elastic scrolling at either end of the page.
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.min(maxY, Math.max(0, window.scrollY));
      setScrolled(y > 12);
      const now = performance.now();
      const delta = y - previousY;
      const nextDirection = Math.sign(delta);
      const pinned = drawerOpen
        || headerRef.current?.querySelector(':focus-visible, [aria-expanded="true"]');

      if (nextDirection !== direction || now - gestureStart > 160) {
        distance = 0;
        gestureStart = now - previousTime > 160 ? now : previousTime;
      }
      distance += Math.abs(delta);
      const speed = distance / Math.max(1, now - gestureStart);
      let nextHidden = hidden;

      if (y <= 12 || pinned) {
        nextHidden = false;
      } else if (nextDirection > 0 && distance >= 24 && y > 80) {
        nextHidden = true;
      } else if (nextDirection < 0 && distance >= 48 && speed >= 0.35) {
        nextHidden = false;
      }

      if (nextHidden !== hidden) {
        hidden = nextHidden;
        setNavHidden(hidden);
      }
      direction = nextDirection;
      previousY = y;
      previousTime = now;
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      setNavHidden(false);
      setScrolled(Math.max(0, window.scrollY) > 12);
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [drawerOpen, location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const menuTrigger = menuTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    document.body.style.overflow = "hidden";
    if (root) root.inert = true;
    closeTriggerRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeDrawer(); return; }
      if (event.key !== "Tab") return;
      const controls = drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]');
      const first = controls?.[0];
      const last = controls?.[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !drawerRef.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawerRef.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = wasInert;
      document.removeEventListener("keydown", handleKeyDown);
      if (menuTrigger?.isConnected) menuTrigger.focus({ preventScroll: true });
    };
  }, [drawerOpen]);
  const navigation = <>
    <TopNav ref={headerRef} $transparent={location.pathname === "/" && !scrolled} $glassDark={glassDarkNav} $hidden={navHidden} inert={navHidden || drawerOpen}><NavInner>
      <MobileLeft><IconAction ref={menuTriggerRef} aria-controls="mobile-navigation" aria-label={t("navigation.openMenu")} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} type="button"><BurgerIcon aria-hidden="true"><span /></BurgerIcon></IconAction></MobileLeft>
      <Logo className="logo-bonefree" aria-label={t("navigation.bonefreeHome")} onClick={closeDrawer} to="/"><img {...brandLogo} sizes="43px" className="img-fluid img-25" alt="Bonefree" /></Logo>
      <CenterNav aria-label={t("navigation.main")}>{desktopLinks.filter(link => link.path !== "/reservations").map(({ path, labelKey }) => <PillLink $active={isActive(path)} key={path} to={path}>{t(labelKey)}</PillLink>)}</CenterNav>
      <NavActions><LanguageSwitcher /><ReservationLink $active={isActive("/reservations")} aria-current={isActive("/reservations") ? "page" : undefined} to="/reservations"><Sparkles size={16} aria-hidden="true" />{t("navigation.reserveTable")}<ReservationPromotionBadge promotion={promotion} compact /></ReservationLink></NavActions>
      <MobileRight><LanguageSwitcher className="language-switcher-mobile-nav" /></MobileRight>
    </NavInner></TopNav>
    {drawerOpen && <><Backdrop tabIndex={-1} aria-hidden="true" aria-label={t("navigation.closeMenu")} onClick={closeDrawer} type="button" /><MobileDrawer ref={drawerRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-label={t("navigation.mobile")}>
      <DrawerHeader><Logo aria-label={t("navigation.bonefreeHome")} onClick={closeDrawer} to="/"><img {...brandLogo} sizes="43px" className="img-fluid img-25" alt="Bonefree" /></Logo><IconAction ref={closeTriggerRef} aria-label={t("navigation.closeMenu")} onClick={closeDrawer} type="button"><X size={22} /></IconAction></DrawerHeader>
      <DrawerBody>
        <DrawerGreeting><Sun size={24} aria-hidden="true" />{t("navigation.mobileGreeting")}</DrawerGreeting>
        <DrawerActions>
          <DrawerAction aria-current={isActive("/reservations") ? "page" : undefined} onClick={closeDrawer} to="/reservations">
            <CalendarDays aria-hidden="true" /><span><strong>{t("navigation.reserveTable")}</strong><ReservationPromotionBadge promotion={promotion} compact /><small>{t("navigation.reserveHint")}</small></span><ArrowUpRight size={21} aria-hidden="true" />
          </DrawerAction>
          <DrawerAction $meal aria-current={isActive("/meal-finder") ? "page" : undefined} onClick={closeDrawer} to="/meal-finder">
            <Sparkles aria-hidden="true" /><span><strong>{t("navigation.mealFinder")}</strong><small>{t("navigation.mealFinderHint")}</small></span><ArrowUpRight size={21} aria-hidden="true" />
          </DrawerAction>
        </DrawerActions>
        <DrawerNav aria-label={t("navigation.main")}>
          {desktopLinks.filter(link => link.path !== "/reservations").map(({ path, labelKey, icon: Icon }) => <DrawerLink $active={isActive(path)} aria-current={isActive(path) ? "page" : undefined} key={path} onClick={closeDrawer} to={path}>{Icon && <Icon aria-hidden="true" />}<span>{t(labelKey)}</span></DrawerLink>)}
        </DrawerNav>
      </DrawerBody>
    </MobileDrawer></>}
  </>;
  // The build renderer places one navbar outside the animated route, matching
  // the browser portal. Page-local navbar calls must not duplicate it in HTML.
  if (typeof document === "undefined") return renderStatic ? navigation : null;
  return createPortal(navigation, document.body);
};

export default Navbar;
