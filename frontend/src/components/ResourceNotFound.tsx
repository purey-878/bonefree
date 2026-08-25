import { useEffect } from "react"
import { ArrowRight, Home, ReceiptText, UtensilsCrossed } from "lucide-react"
import { Link } from "react-router-dom"
import styled from "styled-components"
import { useTranslation } from "react-i18next"

import Navbar from "./Navbar"

type ResourceKind = "product" | "order"

type ResourceNotFoundProps = {
  kind: ResourceKind
}

const resourceCopy = {
  product: {
    key: "product",
    primaryHref: "/menu",
    secondaryHref: "/",
    Icon: UtensilsCrossed,
  },
  order: {
    key: "order",
    primaryHref: "/orders",
    secondaryHref: "/menu",
    Icon: ReceiptText,
  },
} as const

export default function ResourceNotFound({ kind }: ResourceNotFoundProps) {
  const { t } = useTranslation("storefront")
  const copy = resourceCopy[kind]
  const Icon = copy.Icon

  useEffect(() => {
    const previousTitle = document.title
    document.title = t(`resourceNotFound.${copy.key}.documentTitle`)

    return () => {
      document.title = previousTitle
    }
  }, [copy.key, t])

  return (
    <Page className="resource-not-found-page">
      <Navbar />

      <Content>
        <Ticket aria-hidden="true">
          <TicketTop>
            <span>{t(`resourceNotFound.${copy.key}.ticketLabel`)}</span>
            <strong>404</strong>
          </TicketTop>
          <TicketBody>
            <Icon size={66} strokeWidth={1.5} />
            <DashedRule />
            <TicketRows>
              <i />
              <i />
              <i />
            </TicketRows>
            <TicketStatus>{t(`resourceNotFound.${copy.key}.ticketNote`)}</TicketStatus>
          </TicketBody>
        </Ticket>

        <Copy>
          <Eyebrow>
            <Icon aria-hidden="true" size={16} />
            {t(`resourceNotFound.${copy.key}.eyebrow`)}
          </Eyebrow>
          <h1>{t(`resourceNotFound.${copy.key}.title`)}</h1>
          <p>{t(`resourceNotFound.${copy.key}.description`)}</p>

          <Actions>
            <PrimaryLink to={copy.primaryHref}>
              {t(`resourceNotFound.${copy.key}.primaryLabel`)}
              <ArrowRight aria-hidden="true" size={18} />
            </PrimaryLink>
            <SecondaryLink to={copy.secondaryHref}>
              <Home aria-hidden="true" size={17} />
              {t(`resourceNotFound.${copy.key}.secondaryLabel`)}
            </SecondaryLink>
          </Actions>
        </Copy>
      </Content>
    </Page>
  )
}

const Page = styled.main`
  position: relative;
  display: flex;
  min-height: 620px;
  flex: 1 0 auto;
  overflow: hidden;
  background:
    linear-gradient(115deg, transparent 0 58%, color-mix(in srgb, var(--brand-main) 9%, transparent) 58% 100%),
    var(--theme-background, #f8faf6);
  color: var(--brand-ink);

  &::before {
    position: absolute;
    top: 17%;
    right: 6%;
    width: clamp(220px, 28vw, 430px);
    height: clamp(220px, 28vw, 430px);
    border: 1px solid color-mix(in srgb, var(--brand-main) 18%, transparent);
    border-radius: 50%;
    content: "";
  }
`

const Content = styled.section`
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(300px, 0.72fr) minmax(0, 1fr);
  width: min(100%, 1120px);
  align-items: center;
  gap: clamp(3rem, 8vw, 8rem);
  margin: 0 auto;
  padding: clamp(8rem, 13vh, 10rem) 1.5rem clamp(4rem, 8vh, 6rem);

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
    width: min(100%, 660px);
    gap: 2.5rem;
    padding-top: 7.5rem;
  }

  @media (max-width: 540px) {
    padding-inline: 1rem;
    padding-bottom: 3.5rem;
  }
`

const Ticket = styled.div`
  position: relative;
  width: min(100%, 340px);
  justify-self: end;
  filter: drop-shadow(0 28px 30px color-mix(in srgb, var(--brand-ink) 18%, transparent));
  transform: rotate(-3deg);

  &::before,
  &::after {
    position: absolute;
    top: 88px;
    z-index: 2;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--theme-background, #f8faf6);
    content: "";
  }

  &::before {
    left: -12px;
  }

  &::after {
    right: -12px;
  }

  @media (max-width: 820px) {
    width: min(78vw, 320px);
    justify-self: center;
    transform: rotate(-2deg);
  }
`

const TicketTop = styled.div`
  display: flex;
  min-height: 100px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 24px 24px 0 0;
  background: var(--brand-secondary);
  color: #ffffff;
  padding: 1.2rem 1.35rem;

  span {
    max-width: 120px;
    font-size: 0.76rem;
    font-weight: 900;
    line-height: 1.25;
    text-transform: uppercase;
  }

  strong {
    font-size: 2.7rem;
    font-weight: 900;
    line-height: 1;
  }
`

const TicketBody = styled.div`
  position: relative;
  display: grid;
  min-height: 300px;
  justify-items: center;
  border-radius: 0 0 24px 24px;
  background: var(--theme-surface, #ffffff);
  color: var(--brand-main);
  padding: 2rem 1.35rem 1.35rem;

  &::after {
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 11px;
    background: radial-gradient(circle at 6px 12px, transparent 6px, var(--theme-surface, #ffffff) 6.5px) 0 -6px / 18px 18px repeat-x;
    content: "";
  }
`

const DashedRule = styled.span`
  width: 100%;
  margin: 1.2rem 0;
  border-top: 2px dashed var(--glass-border);
`

const TicketRows = styled.span`
  display: grid;
  width: 100%;
  gap: 0.65rem;

  i {
    height: 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--glass-border) 68%, transparent);
  }

  i:nth-child(2) {
    width: 72%;
  }

  i:nth-child(3) {
    width: 45%;
  }
`

const TicketStatus = styled.span`
  align-self: end;
  border: 2px solid var(--brand-accent);
  border-radius: 6px;
  color: color-mix(in srgb, var(--brand-ink) 78%, var(--brand-accent));
  padding: 0.45rem 0.7rem;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
  transform: rotate(-4deg);
`

const Copy = styled.div`
  h1 {
    max-width: 660px;
    margin: 1.15rem 0 0;
    color: var(--brand-ink);
    font-size: clamp(3rem, 5.5vw, 5.5rem);
    line-height: 0.96;
    letter-spacing: -0.06em;
  }

  > p {
    max-width: 590px;
    margin: 1.4rem 0 0;
    color: var(--brand-muted);
    font-size: clamp(1rem, 1.4vw, 1.12rem);
    line-height: 1.65;
  }

  @media (max-width: 540px) {
    h1 {
      font-size: clamp(2.8rem, 14vw, 4rem);
    }
  }
`

const Eyebrow = styled.span`
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  background: var(--brand-accent);
  color: var(--brand-ink);
  padding: 0 0.85rem;
  font-size: 0.76rem;
  font-weight: 900;
  text-transform: uppercase;
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 2rem;

  a {
    display: inline-flex;
    min-height: 52px;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    border-radius: var(--radius-sm);
    padding: 0 1.15rem;
    font-weight: 900;
    text-decoration: none;
    transition: transform 180ms ease, background 180ms ease, border-color 180ms ease;
  }

  a:hover {
    transform: translateY(-2px);
  }

  @media (max-width: 460px) {
    display: grid;

    a {
      width: 100%;
    }
  }
`

const PrimaryLink = styled(Link)`
  border: 1px solid var(--brand-main);
  background: var(--brand-main);
  color: #ffffff;

  &:hover {
    border-color: var(--brand-secondary);
    background: var(--brand-secondary);
    color: #ffffff;
  }
`

const SecondaryLink = styled(Link)`
  border: 1px solid var(--glass-border);
  background: var(--theme-surface, #ffffff);
  color: var(--brand-ink);

  &:hover {
    border-color: var(--brand-main);
    background: color-mix(in srgb, var(--brand-main) 10%, var(--theme-surface, #ffffff));
    color: var(--brand-ink);
  }
`
