import {
  Home,
  MapPin,
  Menu as MenuIcon,
  UtensilsCrossed,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import styled, { createGlobalStyle, css, keyframes } from "styled-components";

import LanguageSwitcher from "./LanguageSwitcher";
const desktopLinks = [
  { path: "/", labelKey: "navigation.home" },
  { path: "/menu", labelKey: "navigation.menu" },
  { path: "/about", labelKey: "navigation.about" },
  { path: "/events", labelKey: "navigation.events" },
  { path: "/contact", labelKey: "navigation.contact" },
];

const bottomLinks = [
  { path: "/", labelKey: "navigation.home", icon: Home },
  { path: "/menu", labelKey: "navigation.menu", icon: UtensilsCrossed },
  { path: "/contact", labelKey: "navigation.contact", icon: MapPin },
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

const NavigationGlobalStyles = createGlobalStyle`
  @media (max-width: 767px) {
    body {
      padding-bottom: 64px;
    }
  }
`;

const TopNav = styled.header<{ $glassDark?: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  /* Above sticky page controls and below application overlays. */
  z-index: 1300;
  height:72px;

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

  background: ${({ $glassDark }) =>
    $glassDark
      ? "rgba(16, 25, 21, 0.26)"   /* HOME */
      : "rgba(255,255,255,0.94)"}; /* OTHER PAGES */

  border-bottom:1px solid
    ${({ $glassDark }) =>
    $glassDark
      ? "rgba(255,255,255,0.16)"
      : "rgba(23,33,29,0.12)"};

  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);

  box-shadow:${({ $glassDark }) =>
    $glassDark
      ? "0 14px 38px rgba(0,0,0,0.24)"
      : "0 14px 38px rgba(23,33,29,0.16)"};

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
`;

const Backdrop = styled.button`
  position: fixed;
  inset: 72px 0 0;
  z-index: 1190;
  border: 0;
  background: rgba(17, 24, 39, 0.28);
  animation: ${backdropIn} 180ms ease both;

  @media (max-width: 767px) {
    inset-block-start: 68px;
  }
`;

const MobileDrawer = styled.aside`
  position: fixed;
  top: 72px;
  left: 50%;
  z-index: 1210;
  display: flex;
  width: min(720px, calc(100vw - 1.5rem));
  max-height: min(560px, calc(100dvh - 84px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(23, 33, 29, 0.12);
  border-top: 0;
  border-radius: 0 0 18px 18px;
  background: #ffffff;
  box-shadow: 0 18px 36px rgba(17, 24, 39, 0.14);
  transform: translateX(-50%);
  animation: ${drawerIn} 220ms ease;

  @media (max-width: 767px) {
    top: 68px;
    width: calc(100vw - 1rem);
    max-height: calc(100dvh - 76px);
  }
`;

const DrawerHeader = styled.div`
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 0.85rem 0 1.15rem;
  border-bottom: 1px solid rgba(23, 33, 29, 0.1);

  ${Logo} {
    grid-column: auto;
    justify-self: auto;
    font-size: 1.18rem;
  }

  ${IconAction} {
    width: 40px;
    height: 40px;
    border-color: rgba(23, 33, 29, 0.12);
    border-radius: 10px;
    background: #ffffff;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
`;

const DrawerBody = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  padding: 0.9rem;
`;

const DrawerNav = styled.nav`
  display: grid;
  gap: 0.2rem;
`;

const DrawerLink = styled(Link) <{ $active: boolean }>`
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 10px;
  background: ${({ $active }) =>
    $active ? "#f4f6f2" : "transparent"};
  color: ${({ $active }) => ($active ? "#17211d" : "#4b5b52")};
  font-weight: 800;
  text-decoration: none;
  position: relative;

  &::before {
    position: absolute;
    top: 11px;
    bottom: 11px;
    left: 0;
    width: 3px;
    border-radius: 999px;
    background: ${({ $active }) => ($active ? "var(--brand-main)" : "transparent")};
    content: "";
  }

  &:hover {
    background: #f7f8f5;
    color: #17211d;
  }
`;

const BottomNav = styled.nav`
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1090;
  display: none;
  height: 64px;
  border-top: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -12px 32px rgba(23, 33, 29, 0.08);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);

  @media (max-width: 767px) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`;

const BottomLink = styled(Link) <{ $active: boolean }>`
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.22rem;
  color: ${({ $active }) => ($active ? "var(--brand-secondary)" : "var(--brand-muted)")};
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1;
  text-decoration: none;

  svg {
    width: 21px;
    height: 21px;
    stroke-width: ${({ $active }) => ($active ? 2.35 : 2)};
  }

  &::before {
    content: none;
  }
`;

const Navbar = () => {
  const { t } = useTranslation("common");
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  const isActive = (path: string) => path === "/" ? location.pathname === "/" : path === "/menu" ? /^\/(menu|product)(\/|$)/.test(location.pathname) : location.pathname.startsWith(path);
  const glassDarkNav = ["/", "/contact", "/about"].includes(location.pathname);
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeDrawer(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", closeOnEscape); };
  }, [drawerOpen]);
  return createPortal(<>
    <NavigationGlobalStyles />
    <TopNav $glassDark={glassDarkNav}><NavInner>
      <MobileLeft><IconAction aria-label={t("navigation.openMenu")} onClick={() => setDrawerOpen(true)} type="button"><MenuIcon size={22} /></IconAction></MobileLeft>
      <Logo className="logo-bonefree" aria-label={t("navigation.bonefreeHome")} onClick={closeDrawer} to="/"><img src="/assets/images/bonefree-logo.webp" className="img-fluid img-25" alt="Bonefree" /></Logo>
      <CenterNav aria-label={t("navigation.main")}>{desktopLinks.map(({ path, labelKey }) => <PillLink $active={isActive(path)} key={path} to={path}>{t(labelKey)}</PillLink>)}</CenterNav>
      <NavActions><LanguageSwitcher /></NavActions>
      <MobileRight><LanguageSwitcher className="language-switcher-mobile-nav" /></MobileRight>
    </NavInner></TopNav>
    {drawerOpen && <><Backdrop aria-label={t("navigation.closeMenu")} onClick={closeDrawer} type="button" /><MobileDrawer aria-label={t("navigation.mobile")}>
      <DrawerHeader><Logo aria-label={t("navigation.bonefreeHome")} onClick={closeDrawer} to="/"><img src="/assets/images/bonefree-logo.webp" className="img-fluid img-25" alt="Bonefree" /></Logo><IconAction aria-label={t("navigation.closeMenu")} onClick={closeDrawer} type="button"><X size={22} /></IconAction></DrawerHeader>
      <DrawerBody><DrawerNav>{desktopLinks.map(({ path, labelKey }) => <DrawerLink $active={isActive(path)} key={path} onClick={closeDrawer} to={path}>{t(labelKey)}</DrawerLink>)}</DrawerNav></DrawerBody>
    </MobileDrawer></>}
    <BottomNav aria-label={t("navigation.mobileBottom")}>{bottomLinks.map(({ path, labelKey, icon: Icon }) => <BottomLink $active={isActive(path)} key={path} to={path}><Icon aria-hidden="true" /><span>{t(labelKey)}</span></BottomLink>)}</BottomNav>
  </>, document.body);
};

export default Navbar;
