import { useEffect } from "react"
import { ArrowRight, Home, Leaf, UtensilsCrossed } from "lucide-react"
import { Link } from "react-router-dom"
import styled from "styled-components"

import Navbar from "../components/Navbar"

const NotFound = () => {
  useEffect(() => {
    const previousTitle = document.title
    document.title = "Página não encontrada | Bonefree"

    return () => {
      document.title = previousTitle
    }
  }, [])

  return (
    <NotFoundPage className="not-found-page">
      <Navbar />

      <NotFoundContent>
        <Copy>
          <Eyebrow>
            <Leaf aria-hidden="true" size={16} />
            Erro 404
          </Eyebrow>

          <h1>
            Este prato não está <span>no menu.</span>
          </h1>
          <p>
            Parece que esta página saiu da cozinha. Confirme o endereço ou volte a
            explorar os sabores da Bonefree.
          </p>

          <Actions>
            <PrimaryLink to="/">
              <Home aria-hidden="true" size={18} />
              Voltar ao início
            </PrimaryLink>
            <SecondaryLink to="/menu">
              Ver o menu
              <ArrowRight aria-hidden="true" size={18} />
            </SecondaryLink>
          </Actions>
        </Copy>

        <ErrorArtwork aria-label="Erro 404: página não encontrada">
          <ArtworkLabel>Página não encontrada</ArtworkLabel>
          <ErrorNumber aria-hidden="true">
            <span>4</span>
            <Plate>
              <PlateInner>
                <Leaf size={54} strokeWidth={1.7} />
              </PlateInner>
            </Plate>
            <span>4</span>
          </ErrorNumber>
          <ArtworkNote>
            <UtensilsCrossed aria-hidden="true" size={18} />
            Nada servido por aqui
          </ArtworkNote>
          <AccentDot $position="top" aria-hidden="true" />
          <AccentDot $position="bottom" aria-hidden="true" />
        </ErrorArtwork>
      </NotFoundContent>
    </NotFoundPage>
  )
}

const NotFoundPage = styled.main`
  position: relative;
  display: flex;
  min-height: 620px;
  flex: 1 0 auto;
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 88%, color-mix(in srgb, var(--brand-main) 18%, transparent) 0 9rem, transparent 20rem),
    radial-gradient(circle at 92% 12%, color-mix(in srgb, var(--brand-accent) 24%, transparent) 0 11rem, transparent 24rem),
    var(--theme-background, #f8faf6);
  color: var(--brand-ink);

  @media (max-width: 767px) {
    min-height: 760px;
  }
`

const NotFoundContent = styled.section`
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(420px, 1.08fr);
  width: min(100%, 1280px);
  align-items: center;
  gap: clamp(2rem, 5vw, 5.5rem);
  margin: 0 auto;
  padding: clamp(8.5rem, 13vh, 11rem) 1.5rem clamp(4rem, 8vh, 7rem);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    width: min(100%, 720px);
    gap: 2.5rem;
    padding-top: 7.5rem;
  }

  @media (max-width: 540px) {
    padding-inline: 1rem;
    padding-bottom: 3.5rem;
  }
`

const Copy = styled.div`
  position: relative;
  z-index: 2;

  h1 {
    max-width: 720px;
    margin: 1.15rem 0 0;
    color: var(--brand-ink);
    font-size: clamp(3.4rem, 6.4vw, 6.6rem);
    line-height: 0.92;
    letter-spacing: -0.065em;
  }

  h1 span {
    display: block;
    color: var(--brand-main);
  }

  > p {
    max-width: 590px;
    margin: 1.5rem 0 0;
    color: var(--brand-muted);
    font-size: clamp(1rem, 1.5vw, 1.15rem);
    line-height: 1.65;
  }

  @media (max-width: 540px) {
    h1 {
      font-size: clamp(3rem, 16vw, 4.4rem);
    }
  }
`

const Eyebrow = styled.span`
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--brand-main) 45%, var(--glass-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-main) 14%, var(--theme-surface, #ffffff));
  color: var(--brand-secondary);
  padding: 0 0.85rem;
  font-size: 0.78rem;
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
    border-radius: var(--theme-radius, var(--radius-sm));
    padding: 0 1.15rem;
    font-weight: 900;
    text-decoration: none;
    transition:
      transform 180ms ease,
      background 180ms ease,
      border-color 180ms ease;
  }

  a:hover {
    transform: translateY(-2px);
  }

  @media (max-width: 440px) {
    display: grid;

    a {
      width: 100%;
    }
  }
`

const PrimaryLink = styled(Link)`
  border: 1px solid var(--brand-secondary);
  background: var(--brand-secondary);
  color: #ffffff;
  box-shadow: 0 14px 30px color-mix(in srgb, var(--brand-secondary) 24%, transparent);

  &:hover {
    border-color: var(--brand-ink);
    background: var(--brand-ink);
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

const ErrorArtwork = styled.div`
  position: relative;
  display: grid;
  min-height: 440px;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--brand-ink) 12%, transparent);
  border-radius: clamp(24px, 4vw, 52px);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.2), transparent 42%),
    var(--brand-accent);
  box-shadow: 0 28px 70px color-mix(in srgb, var(--brand-ink) 16%, transparent);
  isolation: isolate;

  &::before,
  &::after {
    position: absolute;
    width: 210px;
    height: 210px;
    border: 1px solid rgba(23, 33, 29, 0.12);
    border-radius: 50%;
    content: "";
  }

  &::before {
    top: -102px;
    left: -74px;
  }

  &::after {
    right: -90px;
    bottom: -118px;
  }

  @media (max-width: 540px) {
    min-height: 300px;
    border-radius: 28px;
  }
`

const ArtworkLabel = styled.span`
  position: absolute;
  top: 1.25rem;
  left: 1.25rem;
  border-radius: 999px;
  background: var(--brand-ink);
  color: #ffffff;
  padding: 0.55rem 0.75rem;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
`

const ErrorNumber = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(0.15rem, 1vw, 0.8rem);
  color: var(--brand-ink);
  font-size: clamp(7rem, 15vw, 12rem);
  font-weight: 900;
  line-height: 0.75;
  letter-spacing: -0.1em;

  > span:last-child {
    margin-left: -0.08em;
  }

  @media (max-width: 540px) {
    font-size: clamp(6rem, 30vw, 9rem);
  }
`

const Plate = styled.span`
  display: grid;
  width: clamp(104px, 12vw, 150px);
  height: clamp(104px, 12vw, 150px);
  flex: 0 0 auto;
  place-items: center;
  border: clamp(8px, 1vw, 13px) solid #ffffff;
  border-radius: 50%;
  background: #f8faf6;
  box-shadow:
    inset 0 0 0 1px rgba(23, 33, 29, 0.12),
    0 18px 30px rgba(23, 33, 29, 0.18);
`

const PlateInner = styled.span`
  display: grid;
  width: 68%;
  height: 68%;
  place-items: center;
  border: 1px dashed color-mix(in srgb, var(--brand-main) 52%, transparent);
  border-radius: 50%;
  color: var(--brand-main);
`

const ArtworkNote = styled.span`
  position: absolute;
  right: 1.25rem;
  bottom: 1.25rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--brand-ink);
  font-size: 0.78rem;
  font-weight: 900;
`

const AccentDot = styled.span<{ $position: "top" | "bottom" }>`
  position: absolute;
  top: ${({ $position }) => ($position === "top" ? "22%" : "auto")};
  right: ${({ $position }) => ($position === "top" ? "8%" : "auto")};
  bottom: ${({ $position }) => ($position === "bottom" ? "12%" : "auto")};
  left: ${({ $position }) => ($position === "bottom" ? "8%" : "auto")};
  width: ${({ $position }) => ($position === "top" ? "18px" : "11px")};
  height: ${({ $position }) => ($position === "top" ? "18px" : "11px")};
  border-radius: 50%;
  background: ${({ $position }) => ($position === "top" ? "var(--brand-main)" : "var(--brand-secondary)")};
`

export default NotFound
