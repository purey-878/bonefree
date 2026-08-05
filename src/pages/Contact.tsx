import React from "react";
import { Link } from "react-router-dom";
import { Clock, Mail, MapPin, Phone, Route, UtensilsCrossed } from "lucide-react";
import styled from "styled-components";
import Navbar from "../components/Navbar";

const mapsUrl =
  "https://www.google.com/maps/dir//R.+Eng.+Henrique+M%C3%AAndia+28A,+2825-450+Costa+da+Caparica/@38.6849967,-9.2862047,15z/data=!4m8!4m7!1m0!1m5!1m1!1s0xd1ecbd167fb7389:0x4bfb3119d6e98f29!2m2!1d-9.2333178!2d38.6382045?entry=ttu";

const contactCards = [
  {
    title: "Morada",
    text: "R. Eng. Henrique Mendia 28A, 2825-450 Costa da Caparica",
    Icon: MapPin,
  },
  {
    title: "Telefone",
    text: "+351 968 107 703",
    Icon: Phone,
  },
  {
    title: "Email",
    text: "carambolarubra@gmail.com",
    Icon: Mail,
  },
  {
    title: "Horário",
    text: "Segunda a domingo: 12:00 - 23:00",
    Icon: Clock,
  },
];

const Contact: React.FC = () => {
  return (
    <ContactPage>
      <ContactHero>
       
        <HeroGrid>
        
          <HeroCopy>
              <Navbar />
            <h1>Encontre a PREY junto à costa.</h1>
            <p>Pratos vegetais, cocktails, pedidos à mesa e uma sala feita para noites longas e descontraídas.</p>
            <HeroActions>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <Route size={18} />
                Obter direções
              </a>
              <Link to="/menu">
                <UtensilsCrossed size={18} />
                Ver menu
              </Link>
            </HeroActions>
          </HeroCopy>

         
        </HeroGrid>
      </ContactHero>

      <ContactBento aria-label="Detalhes de contacto da PREY">
        <FeatureTile>
          <img src="/assets/images/banner-menu.jpeg" alt="Mesa vegetal da PREY" />
          <div>
            <span>Entre com fome</span>
            <h2>Comida, cocktails, música, costa.</h2>
          </div>
        </FeatureTile>

        {contactCards.map(({ title, text, Icon }) => (
          <ContactCard key={title}>
            <IconWrap>
              <Icon size={22} />
            </IconWrap>
            <div>
              <span>{title}</span>
              <strong>{text}</strong>
            </div>
          </ContactCard>
        ))}

        <DirectionsTile>
          <MapPin size={26} />
          <span>Prey, Costa da Caparica</span>
          <h2>R. Eng. Henrique Mendia 28A</h2>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
            Abrir no Google Maps
          </a>
        </DirectionsTile>

        <MapTile>
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d49878.87222597991!2d-9.2476054!3d38.615999!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd1ecbd167fb7389%3A0x4bfb3119d6e98f29!2sBone%20Free!5e0!3m2!1sen!2spt!4v1780922610537!5m2!1sen!2spt"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Localização da PREY"
          />
        </MapTile>
      </ContactBento>
    </ContactPage>
  );
};

const ContactPage = styled.main`
  min-height: 100vh;
  background:
    radial-gradient(circle at 12% 12%, rgba(123, 175, 75, 0.2), transparent 22rem),
    #edeade;
  color: #1a1a14;
`;

const ContactHero = styled.section`
  min-height: 50vh;
  background:
    linear-gradient(90deg, rgba(26, 26, 20, 0.78), rgba(26, 26, 20, 0.34)),
    url("/assets/images/contact-us-image.jpg") center / cover no-repeat;
`;

const HeroGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.72fr);
  width: min(100%, 1280px);
  min-height: 50vh;
  align-items: end;
  gap: 18px;
  margin: 0 auto;
  padding: clamp(4rem, 8vw, 7rem) 1.5rem 1.5rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const HeroCopy = styled.div`
  max-width: 800px;
  color: #fff;

  h1 {
    margin: 0.8rem 0 0;
    color: #fff;
    font-size: clamp(3.2rem, 8vw, 7.5rem);
    line-height: 0.9;
  }

  p {
    max-width: 620px;
    margin: 1.2rem 0 0;
    color: rgba(255, 255, 255, 0.82);
    font-size: clamp(1.05rem, 2vw, 1.3rem);
    line-height: 1.6;
  }
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
    background: #f5f2e8;
  }
`;

const ContactBento = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(170px, auto);
  width: min(100%, 1280px);
  gap: 10px;
  margin: 0 auto;
  padding: 1.5rem 1.5rem clamp(3rem, 6vw, 5rem);

  @media (max-width: 1000px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    padding-inline: 1rem;
  }
`;

const FeatureTile = styled.article`
  position: relative;
  grid-column: span 2;
  grid-row: span 2;
  min-height: 350px;
  overflow: hidden;
  border-radius: 14px;
  background: #1a1a14;
  color: #fff;

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.74;
  }

  div {
    position: relative;
    z-index: 1;
    display: grid;
    min-height: 100%;
    align-content: end;
    padding: clamp(1.2rem, 3vw, 2rem);
    background: linear-gradient(180deg, transparent, rgba(26, 26, 20, 0.72));
  }

  span {
    color: #d7f0b4;
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    max-width: 540px;
    margin: 0.45rem 0 0;
    color: #fff;
    font-size: clamp(2rem, 5vw, 4rem);
    line-height: 0.95;
  }

  @media (max-width: 640px) {
    grid-column: auto;
  }
`;

const ContactCard = styled.article`
  display: grid;
  align-content: space-between;
  gap: 1rem;
  overflow: hidden;
  border-radius: 14px;
  background: #f5f2e8;
  padding: 1rem;

  span {
    display: block;
    color: rgba(26, 26, 20, 0.58);
    font-size: 0.74rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  strong {
    display: block;
    margin-top: 0.4rem;
    color: #1a1a14;
    font-size: clamp(1rem, 1.8vw, 1.35rem);
    line-height: 1.2;
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

const DirectionsTile = styled.article`
  display: grid;
  align-content: end;
  gap: 0.6rem;
  overflow: hidden;
  border-radius: 14px;
  background: #1a1a14;
  color: #edeade;
  padding: 1.2rem;

  svg {
    color: #7baf4b;
  }

  span {
    color: #7baf4b;
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: #edeade;
    font-size: clamp(1.5rem, 3vw, 2.4rem);
    line-height: 1;
  }


  a {
    width: fit-content;
    border-radius: 999px;
    background: #7baf4b;
    color: #1a1a14;
    padding: 0.72rem 0.9rem;
    font-weight: 900;
    text-decoration: none;
  }
`;

const MapTile = styled.article`
  grid-column: span 3;
  min-height: 420px;
  overflow: hidden;
  border-radius: 14px;
  background: #f5f2e8;

  iframe {
    display: block;
    min-height: inherit;
  }

  @media (max-width: 1000px) {
    grid-column: span 2;
  }

  @media (max-width: 640px) {
    grid-column: auto;
  }
`;

export default Contact;
