import React from "react";
import { Link } from "react-router-dom";
import { Heart, Leaf, MapPin, Sparkles, Star, UtensilsCrossed, Users } from "lucide-react";
import styled from "styled-components";
import FloatingAboutIcons from "../components/FloatingAboutIcons";
import Navbar from "../components/Navbar";

const stats = [
  { value: "431", label: "avaliações" },
  { value: "30+", label: "pratos plant-based" },
  { value: "12k+", label: "pedidos servidos" },
];

const values = [
  {
    title: "Energia local",
    text: "Criado na Costa da Caparica com ritmo de praia, serviço próximo e noites que se prolongam.",
    Icon: MapPin,
  },
  {
    title: "Vegetal primeiro",
    text: "Comida vegan com cor, crocância, conforto e apetite verdadeiro para a noite.",
    Icon: Leaf,
  },
  {
    title: "Feito para partilhar",
    text: "Bowls, burgers, acompanhamentos, cocktails e pratos pensados para a mesa inteira.",
    Icon: Users,
  },
];

const About: React.FC = () => {
  return (
    <AboutPage>
      <FloatingAboutIcons />
      <AboutHero>
        <Navbar />
        <HeroInner>
          <HeroCopy>
            <HeroKicker>
              <Sparkles size={16} />
              Sobre a BONEFREE
            </HeroKicker>
            <h1>Comida vegan com pulso costeiro.</h1>
            <p>
              A BONEFREE é um restaurante de cozinha vegetal na Costa da Caparica, feito para pratos cheios,
              bebidas com carácter, pedidos simples à mesa e uma sala viva do almoço até tarde.
            </p>
            <HeroActions>
              <Link to="/menu">
                <UtensilsCrossed size={18} />
                Abrir menu
              </Link>
              <Link to="/contact">Encontrar-nos</Link>
            </HeroActions>
          </HeroCopy>

          <HeroPhoto>
            <img src="/assets/images/about-us-photo-1.webp" alt="Ambiente do restaurante BONEFREE" />
            <PhotoTag>
              <Star size={16} />
              Avaliação Google 4,7
            </PhotoTag>
          </HeroPhoto>
        </HeroInner>
      </AboutHero>

      <AboutBento aria-label="Sobre a BONEFREE">
        <StoryTile>
          <span>A nossa história</span>
          <h2>Vegetal, mas nunca discreto.</h2>
          <p>
            A BONEFREE nasceu de uma ideia simples: a comida vegan deve ser generosa, ousada e social.
            O menu transforma ingredientes frescos em pratos com textura, calor, cor e alma
            suficiente para juntar todos à mesma mesa.
          </p>
        </StoryTile>

        <ImageTile className="large">
          <img src="/assets/images/about-image-2.jpg" alt="Comida vegetal da BONEFREE" />
        </ImageTile>

        {stats.map((stat) => (
          <StatTile key={stat.label}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </StatTile>
        ))}

        <ImageTile>
          <img src="/assets/images/about-us-3.jpg" alt="Detalhe da sala da BONEFREE" />
        </ImageTile>

        <MissionTile>
          <Heart size={26} />
          <span>Missão</span>
          <h2>Fazer com que comer vegan seja simples, social e cheio de sabor.</h2>
        </MissionTile>

        <ImageTile>
          <img src="/assets/images/index-about-tap.jpeg" alt="Bebidas e detalhe do bar da BONEFREE" />
        </ImageTile>

        {values.map(({ title, text, Icon }) => (
          <ValueTile key={title}>
            <IconWrap>
              <Icon size={22} />
            </IconWrap>
            <div>
              <span>{title}</span>
              <p>{text}</p>
            </div>
          </ValueTile>
        ))}

        <WideCta>
          <div>
            <span>Costa da Caparica</span>
            <h2>Venha com fome. Saia convertido.</h2>
          </div>
          <Link to="/contact">Visitar a BONEFREE</Link>
        </WideCta>
      </AboutBento>
    </AboutPage>
  );
};

const AboutPage = styled.main`
  position: relative;
  overflow-x: clip;
  min-height: 100vh;
  background: #edeade;
  color: #1a1a14;
`;

const AboutHero = styled.section`
  position: relative;
  z-index: 1;
  min-height: 84svh;
  background: transparent;
  color: #1a1a14;
`;

const HeroInner = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.78fr);
  width: min(100%, 1280px);
  min-height: calc(84svh - 72px);
  align-items: center;
  gap: 10px;
  margin: 0 auto;
  padding: 5rem 1.5rem 1rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    padding-top: 4rem;
  }

  @media (max-width: 640px) {
    padding-inline: 1rem;
  }
`;

const HeroCopy = styled.div`
  display: grid;
  align-content: end;
  min-height: 520px;
  border-radius: 14px;
  background:
    linear-gradient(rgba(26, 26, 20, 0.42), rgba(26, 26, 20, 0.86)),
    url("/assets/images/about-us-background.webp") center / cover no-repeat;
  padding: 2rem;
  transform: translateY(-24px);

  h1 {
    max-width: 760px;
    margin: 1rem 0 0;
    color: #edeade;
    font-size: 5.8rem;
    line-height: 0.92;
    letter-spacing: 0;
  }

  p {
    max-width: 650px;
    margin: 1.2rem 0 0;
    color: rgba(237, 234, 222, 0.82);
    font-size: 1.18rem;
    line-height: 1.55;
  }

  @media (max-width: 900px) {
    min-height: 460px;
    transform: none;

    h1 {
      font-size: 4rem;
    }
  }

  @media (max-width: 540px) {
    min-height: 430px;
    padding: 1.2rem;

    h1 {
      font-size: 3rem;
    }
  }
`;

const HeroKicker = styled.span`
  display: inline-flex;
  width: fit-content;
  min-height: 38px;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  background: #7baf4b;
  color: #1a1a14;
  padding: 0 0.85rem;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
`;

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 1.8rem;

  a {
    display: inline-flex;
    min-height: 50px;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    border-radius: 999px;
    background: #7baf4b;
    color: #1a1a14;
    padding: 0 1.1rem;
    font-weight: 900;
    text-decoration: none;
  }

  a + a {
    background: #edeade;
  }
`;

const HeroPhoto = styled.figure`
  position: relative;
  min-height: 520px;
  margin: 0;
  overflow: hidden;
  border-radius: 14px;
  background: #f5f2e8;
  transform: translateY(-24px);

  img {
    display: block;
    width: 100%;
    height: 100%;
    min-height: inherit;
    object-fit: cover;
  }

  @media (max-width: 900px) {
    min-height: 360px;
    transform: none;
  }
`;

const PhotoTag = styled.figcaption`
  position: absolute;
  right: 14px;
  bottom: 14px;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border-radius: 999px;
  background: #1a1a14;
  color: #edeade;
  padding: 0.7rem 0.9rem;
  font-weight: 900;
`;

const AboutBento = styled.section`
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(180px, auto);
  width: min(100%, 1280px);
  gap: 10px;
  margin: 0 auto;
  padding: 1.5rem 1.5rem 5rem;

  @media (max-width: 1000px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    padding-inline: 1rem;
  }
`;

const StoryTile = styled.article`
  grid-column: span 2;
  display: grid;
  align-content: end;
  min-height: 370px;
  border-radius: 14px;
  background: #f5f2e8;
  padding: 1.5rem;

  span {
    color: #7baf4b;
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h2 {
    max-width: 640px;
    margin: 0.6rem 0 0;
    color: #1a1a14;
    font-size: 3.8rem;
    line-height: 0.95;
    letter-spacing: 0;
  }

  p {
    max-width: 720px;
    margin: 1rem 0 0;
    color: rgba(26, 26, 20, 0.72);
    font-size: 1.05rem;
    line-height: 1.55;
  }

  @media (max-width: 640px) {
    grid-column: auto;
    min-height: 320px;

    h2 {
      font-size: 2.7rem;
    }
  }
`;

const ImageTile = styled.article`
  min-height: 180px;
  overflow: hidden;
  border-radius: 14px;
  background: #1a1a14;

  &.large {
    grid-column: span 2;
    grid-row: span 2;
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    min-height: inherit;
    object-fit: cover;
  }

  @media (max-width: 640px) {
    &.large {
      grid-column: auto;
      grid-row: auto;
      min-height: 320px;
    }
  }
`;

const StatTile = styled.article`
  display: grid;
  align-content: space-between;
  border-radius: 14px;
  background: #7baf4b;
  color: #1a1a14;
  padding: 1rem;

  strong {
    font-size: 4.2rem;
    line-height: 0.9;
    letter-spacing: 0;
  }

  span {
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }
`;

const MissionTile = styled.article`
  grid-column: span 2;
  display: grid;
  align-content: end;
  gap: 0.8rem;
  border-radius: 14px;
  background: #1a1a14;
  color: #edeade;
  padding: 1.5rem;

  svg {
    color: #7baf4b;
  }

  span {
    color: #7baf4b;
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h2 {
    max-width: 760px;
    margin: 0;
    color: #edeade;
    font-size: 3rem;
    line-height: 0.98;
    letter-spacing: 0;
  }

  @media (max-width: 640px) {
    grid-column: auto;

    h2 {
      font-size: 2.3rem;
    }
  }
`;

const ValueTile = styled.article`
  display: grid;
  align-content: space-between;
  min-height: 230px;
  border-radius: 14px;
  background: #f5f2e8;
  padding: 1rem;

  span {
    display: block;
    color: #1a1a14;
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  p {
    margin: 0.55rem 0 0;
    color: rgba(26, 26, 20, 0.7);
    line-height: 1.45;
  }
`;

const IconWrap = styled.div`
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 999px;
  background: #7baf4b;
  color: #1a1a14;
`;

const WideCta = styled.article`
  grid-column: span 4;
  display: flex;
  min-height: 180px;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 14px;
  background: #1a1a14;
  color: #edeade;
  padding: 1.5rem;

  span {
    color: #7baf4b;
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.5rem 0 0;
    color: #edeade;
    font-size: 3.6rem;
    line-height: 0.95;
    letter-spacing: 0;
  }

  a {
    display: inline-flex;
    min-height: 50px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: #7baf4b;
    color: #1a1a14;
    padding: 0 1.1rem;
    font-weight: 900;
    text-decoration: none;
    white-space: nowrap;
  }

  @media (max-width: 1000px) {
    grid-column: span 2;
  }

  @media (max-width: 640px) {
    grid-column: auto;
    flex-direction: column;
    align-items: flex-start;

    h2 {
      font-size: 2.6rem;
    }
  }
`;

export default About;
