import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  LogIn,
  LogOut,
  Menu as MenuIcon,
  ShoppingBag,
  User,
  UtensilsCrossed,
  X,
} from "lucide-react";
import styled, { createGlobalStyle, css, keyframes } from "styled-components";

import ConfirmDialog from "./ui/ConfirmDialog";
import { useAuth } from "../hooks";
import { cartService } from "../services";

const desktopLinks = [
  { path: "/", label: "Início" },
  { path: "/menu", label: "Menu" },
  { path: "/about", label: "Sobre nós" },
  { path: "/events", label: "Eventos" },
  { path: "/contact", label: "Contacto" },
];

const bottomLinks = [
  { path: "/", label: "Início", icon: Home },
  { path: "/menu", label: "Menu", icon: UtensilsCrossed },
  { path: "/profile", label: "Perfil", icon: User },
];

const badgePop = keyframes`
  0% {
    transform: scale(0.72);
  }

  60% {
    transform: scale(1.12);
  }

  100% {
    transform: scale(1);
  }
`;

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
  z-index:1200;
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
  grid-template-columns: minmax(160px, 1fr) auto minmax(160px, 1fr);
  width: min(100%, 1440px);
  height: 100%;
  align-items: center;
  gap: 1rem;
  margin: 0 auto;
  padding: 0 1.5rem;

  @media (max-width: 1023px) {
    grid-template-columns: 48px minmax(0, 1fr) auto;
    padding: 0 1rem;
  }

  @media (max-width: 767px) {
    grid-template-columns: 48px minmax(0, 1fr) 48px;
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

  @media (min-width: 768px) and (max-width: 1023px) {
    grid-column: 2;
    justify-self: start;
  }
`;

const CenterNav = styled.nav`
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;

  @media (max-width: 1023px) {
    display: none;
  }
`;

const PillLink = styled(Link)<{ $active: boolean }>`
  display: inline-flex;
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
`;

const NavActions = styled.div`
  grid-column: 3;
  justify-self: end;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  min-width: 0;

  @media (max-width: 767px) {
    display: none;
  }
`;

const MobileLeft = styled.div`
  display: none;

  @media (max-width: 1023px) {
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
  }
`;

const IconAction = styled.button`
  position: relative;
  display: inline-grid;
  width: 44px;
  height: 44px;
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

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(138, 107, 0, 0.45);
    background: var(--nav-surface-hover, #f4f8f1);
    color: var(--nav-strong, var(--brand-secondary));
  }
`;

const IconLink = styled(Link)`
  position: relative;
  display: inline-grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid var(--nav-border, var(--glass-border));
  border-radius: var(--radius-sm);
  background: var(--nav-surface, #ffffff);
  color: var(--nav-strong, var(--brand-ink));
  text-decoration: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  transition:
    background 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(138, 107, 0, 0.45);
    background: var(--nav-surface-hover, #f4f8f1);
    color: var(--nav-strong, var(--brand-secondary));
  }
`;

const CartBadge = styled.span`
  position: absolute;
  top: -7px;
  right: -7px;
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  padding: 0 0.32rem;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 999px;
  background: var(--brand-accent);
  color: #171915;
  font-size: 0.7rem;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 8px 18px rgba(253, 205, 67, 0.28);
  animation: ${badgePop} 320ms ease;
`;

const AuthLink = styled(Link)<{ $primary?: boolean }>`
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0 0.86rem;
  border: 1px solid
    ${({ $primary }) =>
      $primary ? "rgba(138, 107, 0, 0.45)" : "var(--nav-border, var(--glass-border))"};
  border-radius: var(--radius-sm);
  background: ${({ $primary }) =>
    $primary ? "var(--brand-gradient)" : "var(--nav-surface, #ffffff)"};
  color: ${({ $primary }) => ($primary ? "var(--white)" : "var(--nav-strong, var(--brand-ink))")};
  font-size: 0.86rem;
  font-weight: 800;
  text-decoration: none;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(138, 107, 0, 0.52);
    color: ${({ $primary }) => ($primary ? "var(--white)" : "var(--nav-strong, var(--brand-ink))")};
  }
`;

const AuthButton = styled.button`
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0 0.86rem;
  border: 1px solid rgba(138, 107, 0, 0.45);
  border-radius: var(--radius-sm);
  background: var(--brand-gradient);
  color: var(--white);
  font-size: 0.86rem;
  font-weight: 800;
  transition:
    transform 180ms ease,
    border-color 180ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(138, 107, 0, 0.52);
  }
`;

const AccountMenu = styled.div`
  position: relative;
`;

const AccountButton = styled.button`
  display: inline-grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid var(--brand-main);
  border-radius: 999px;
  background: var(--brand-main);
  color: #ffffff;
  font-size: 0.94rem;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
  box-shadow: 0 8px 18px rgba(23, 33, 29, 0.08);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: var(--brand-secondary);
    background: var(--brand-secondary);
    color: #ffffff;
  }
`;

const AccountDropdown = styled.div`
  position: absolute;
  top: calc(100% + 0.75rem);
  right: 0;
  z-index: 1130;
  display: grid;
  width: min(260px, calc(100vw - 2rem));
  gap: 0.45rem;
  padding: 0.7rem;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  background: #ffffff;
  box-shadow: 0 22px 52px rgba(23, 33, 29, 0.16);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
`;

const AccountSummary = styled.div`
  display: grid;
  gap: 0.2rem;
  padding: 0.35rem 0.45rem 0.65rem;
  border-bottom: 1px solid var(--glass-border);
`;

const AccountName = styled.span`
  overflow: hidden;
  color: var(--brand-ink);
  font-size: 0.92rem;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const AccountEmail = styled.span`
  overflow: hidden;
  color: var(--brand-muted);
  font-size: 0.8rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const AccountMenuLink = styled(Link)`
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 0.55rem;
  padding: 0 0.6rem;
  border-radius: var(--radius-sm);
  color: var(--brand-ink);
  font-size: 0.86rem;
  font-weight: 800;
  text-decoration: none;

  &:hover {
    background: #f4f8f1;
    color: var(--brand-secondary);
  }
`;

const AccountMenuButton = styled.button`
  display: flex;
  min-height: 40px;
  width: 100%;
  align-items: center;
  gap: 0.55rem;
  padding: 0 0.6rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--brand-ink);
  font-size: 0.86rem;
  font-weight: 800;
  text-align: left;

  &:hover {
    background: #f4f8f1;
    color: var(--brand-secondary);
  }
`;

const Backdrop = styled.button`
  position: fixed;
  inset: 72px 0 0;
  z-index: 1190;
  border: 0;
  background: rgba(17, 24, 39, 0.28);

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

const DrawerLink = styled(Link)<{ $active: boolean }>`
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

const DrawerAuth = styled.div`
  display: grid;
  gap: 0.75rem;
  padding-top: 1rem;
  margin-top: auto;
  border-top: 1px solid rgba(23, 33, 29, 0.1);
`;

const DrawerWelcome = styled.p`
  margin: 0;
  color: var(--brand-muted);
  font-size: 0.92rem;
  font-weight: 700;
`;

const DrawerAuthGrid = styled.div`
  display: grid;
  gap: 0.5rem;

  ${AuthLink},
  ${AuthButton} {
    min-height: 42px;
    border-color: rgba(23, 33, 29, 0.12);
    border-radius: 10px;
    background: #ffffff;
    color: #17211d;
    box-shadow: none;
  }

  ${AuthLink}:hover,
  ${AuthButton}:hover {
    border-color: rgba(23, 33, 29, 0.18);
    background: #f7f8f5;
    color: #17211d;
    transform: none;
  }

  ${AuthLink}[href="/register"] {
    border-color: #17211d;
    background: #17211d;
    color: #ffffff;
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

const BottomLink = styled(Link)<{ $active: boolean }>`
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
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpenPath, setAccountOpenPath] = useState<string | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountOpen = accountOpenPath === location.pathname;

  const cartLinkState = useMemo(
    () =>
      location.pathname === "/cart"
        ? undefined
        : {
            backgroundLocation: location,
            from: `${location.pathname}${location.search}${location.hash}`,
          },
    [location],
  );

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    if (path === "/menu") {
      return location.pathname.startsWith("/menu") || location.pathname.startsWith("/product");
    }
    return location.pathname.startsWith(path);
  };

  const closeDrawer = () => setDrawerOpen(false);
  const closeAccountMenu = () => setAccountOpenPath(null);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!accountOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        closeAccountMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAccountMenu();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen]);

  useEffect(() => {
    const fetchCartCount = async () => {
      try {
        const cart = await cartService.getCart();
        setCartCount(cart.items?.length ?? 0);
      } catch (error) {
        console.error("Error fetching cart:", error);
      }
    };

    fetchCartCount();
  }, [location.pathname]);

  useEffect(() => {
    const handleCartUpdate = async () => {
      try {
        const cart = await cartService.getCart();
        setCartCount(cart.items?.length ?? 0);
      } catch (error) {
        console.error("Error fetching cart:", error);
      }
    };

    window.addEventListener("cartUpdated", handleCartUpdate);
    handleCartUpdate();

    return () => window.removeEventListener("cartUpdated", handleCartUpdate);
  }, []);

  const requestLogout = () => {
    closeDrawer();
    closeAccountMenu();
    setLogoutConfirmOpen(true);
  };

  const handleLogout = () => {
    logout();
    closeDrawer();
    closeAccountMenu();
    setLogoutConfirmOpen(false);
    navigate("/");
  };

  const fullName = [user?.name, user?.lastName].filter(Boolean).join(" ").trim();
  const displayName = fullName || user?.email || "Perfil";
  const profileInitial = (fullName || user?.email || "P").trim().charAt(0).toUpperCase();
  const glassDarkNav = location.pathname === "/" || location.pathname === "/contact" || location.pathname === "/about";
  const isAuthRoute = ["/login", "/register", "/forgot-password"].includes(location.pathname);

  return (
    <>
      <NavigationGlobalStyles />
      <TopNav $glassDark={glassDarkNav}>
        <NavInner>
          <MobileLeft>
            <IconAction
              aria-label="Abrir menu"
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              <MenuIcon size={22} />
            </IconAction>
          </MobileLeft>

          <Logo className="logo-bonefree" aria-label="Início Bonefree" onClick={closeDrawer} to="/">
            <img src="/assets/images/bonefree-logo.webp" className="img-fluid img-25" alt="Bonefree" />
          </Logo>

          <CenterNav aria-label="Navegação principal">
            {desktopLinks.map(({ path, label }) => (
              <PillLink $active={isActive(path)} key={path} to={path}>
                {label}
              </PillLink>
            ))}
          </CenterNav>

          <NavActions>
            <IconLink aria-label="Carrinho" state={cartLinkState} to="/cart">
              <ShoppingBag size={21} />
              {cartCount > 0 && <CartBadge key={cartCount}>{cartCount}</CartBadge>}
            </IconLink>

            {isAuthenticated ? (
              <AccountMenu ref={accountMenuRef}>
                <AccountButton
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  aria-label="Abrir menu da conta"
                  onClick={() => setAccountOpenPath((openPath) => openPath === location.pathname ? null : location.pathname)}
                  type="button"
                >
                  {profileInitial}
                </AccountButton>
                {accountOpen && (
                  <AccountDropdown role="menu">
                    <AccountSummary>
                      <AccountName>{displayName}</AccountName>
                      {user?.email && <AccountEmail>{user.email}</AccountEmail>}
                    </AccountSummary>
                    <AccountMenuLink onClick={closeAccountMenu} role="menuitem" to="/profile">
                      <User size={16} />
                      Perfil
                    </AccountMenuLink>
                    <AccountMenuButton onClick={requestLogout} role="menuitem" type="button">
                      <LogOut size={16} />
                      Terminar sessão
                    </AccountMenuButton>
                  </AccountDropdown>
                )}
              </AccountMenu>
            ) : isAuthRoute ? null : (
              <>
                <AuthLink to="/login">
                  <LogIn size={16} />
                  Entrar
                </AuthLink>
                <AuthLink $primary to="/register">
                  Criar conta
                </AuthLink>
              </>
            )}
          </NavActions>

          <MobileRight>
            <IconLink aria-label="Carrinho" state={cartLinkState} to="/cart">
              <ShoppingBag size={22} />
              {cartCount > 0 && <CartBadge key={cartCount}>{cartCount}</CartBadge>}
            </IconLink>
          </MobileRight>
        </NavInner>
      </TopNav>

      {drawerOpen && (
        <>
          <Backdrop aria-label="Fechar menu" onClick={closeDrawer} type="button" />
          <MobileDrawer aria-label="Navegação móvel">
            <DrawerHeader>
              <Logo aria-label="Início Bonefree" onClick={closeDrawer} to="/">
                <img src="/assets/images/bonefree-logo.webp" className="img-fluid img-25" alt="Bonefree" />
              </Logo>
              <IconAction aria-label="Fechar menu" onClick={closeDrawer} type="button">
                <X size={22} />
              </IconAction>
            </DrawerHeader>

            <DrawerBody>
              <DrawerNav>
                {desktopLinks.map(({ path, label }) => (
                  <DrawerLink
                    $active={isActive(path)}
                    key={path}
                    onClick={closeDrawer}
                    to={path}
                  >
                    {label}
                  </DrawerLink>
                ))}
              </DrawerNav>

              <DrawerAuth>
                {isAuthenticated ? (
                  <>
                    {displayName && <DrawerWelcome>{displayName}</DrawerWelcome>}
                    <DrawerAuthGrid>
                      <AuthLink onClick={closeDrawer} to="/profile">
                        <User size={16} />
                        Perfil
                      </AuthLink>
                      <AuthButton onClick={requestLogout} type="button">
                        <LogOut size={16} />
                        Terminar sessão
                      </AuthButton>
                    </DrawerAuthGrid>
                  </>
                ) : isAuthRoute ? null : (
                  <DrawerAuthGrid>
                    <AuthLink onClick={closeDrawer} to="/login">
                      <LogIn size={16} />
                      Entrar
                    </AuthLink>
                    <AuthLink $primary onClick={closeDrawer} to="/register">
                      Criar conta
                    </AuthLink>
                  </DrawerAuthGrid>
                )}
              </DrawerAuth>
            </DrawerBody>
          </MobileDrawer>
        </>
      )}

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Terminar sessão?"
        description="Vai sair da sua conta e terá de iniciar sessão novamente para continuar."
        confirmText="Terminar sessão"
        cancelText="Cancelar"
        onConfirm={handleLogout}
        onCancel={() => setLogoutConfirmOpen(false)}
      />

      <BottomNav aria-label="Navegação inferior móvel" >
        {bottomLinks.map(({ path, label, icon: Icon }) => (
          <BottomLink
            $active={isActive(path)}
            key={path}
            to={path}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </BottomLink>
        ))}
      </BottomNav>
    </>
  );
};

export default Navbar;
