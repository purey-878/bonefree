import { HeartHandshake, Leaf, MapPin, Sprout, Sparkles, Users, Vegan, Waves } from "lucide-react";
import styled from "styled-components";

type FloatingAboutIconsProps = {
  className?: string;
};

export default function FloatingAboutIcons({ className }: FloatingAboutIconsProps) {
  return (
    <AboutFloatLayer className={className} aria-hidden="true">
      <span className="about-float about-float-leaf"><Leaf /></span>
      <span className="about-float about-float-waves"><Waves /></span>
      <span className="about-float about-float-users"><Users /></span>
      <span className="about-float about-float-vegan"><Vegan /></span>
      <span className="about-float about-float-heart"><HeartHandshake /></span>
      <span className="about-float about-float-pin"><MapPin /></span>
      <span className="about-float about-float-sprout"><Sprout /></span>
      <span className="about-float about-float-sparkles"><Sparkles /></span>
    </AboutFloatLayer>
  );
}

const AboutFloatLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;

  .about-float {
    position: absolute;
    display: grid;
    width: clamp(72px, 8vw, 124px);
    aspect-ratio: 1;
    place-items: center;
    border: 1.5px solid color-mix(in srgb, currentColor 36%, transparent);
    border-radius: 24px;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.46)),
      color-mix(in srgb, currentColor 18%, transparent);
    color: #7baf4b;
    opacity: 0.36;
    transform: rotate(var(--about-float-rotate, -8deg));
    animation: bonefree-about-drift var(--about-float-duration, 13s) ease-in-out infinite alternate;
    box-shadow:
      0 18px 48px color-mix(in srgb, currentColor 16%, transparent),
      inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  }

  .about-float svg {
    width: 52%;
    height: 52%;
    stroke-width: 1.75;
  }

  .about-float-leaf {
    --about-float-rotate: -10deg;
    --about-float-duration: 13s;
    top: 12%;
    left: 2.5%;
    color: #5f9f3a;
  }

  .about-float-waves {
    --about-float-rotate: 11deg;
    --about-float-duration: 15s;
    top: 18%;
    right: 4%;
    color: #1c7c86;
  }

  .about-float-users {
    --about-float-rotate: 13deg;
    --about-float-duration: 16s;
    bottom: 18%;
    left: 5%;
    color: #c47a1d;
  }

  .about-float-vegan {
    --about-float-rotate: -15deg;
    --about-float-duration: 14s;
    right: 12%;
    bottom: 11%;
    color: #4d9630;
  }

  .about-float-heart {
    --about-float-rotate: 8deg;
    --about-float-duration: 17s;
    top: 52%;
    right: -1%;
    color: #b2558a;
  }

  .about-float-pin {
    --about-float-rotate: 14deg;
    --about-float-duration: 18s;
    top: 42%;
    left: 1.5%;
    color: #b42318;
  }

  .about-float-sprout {
    --about-float-rotate: -18deg;
    --about-float-duration: 19s;
    top: 7%;
    right: 24%;
    color: #7baf4b;
  }

  .about-float-sparkles {
    --about-float-rotate: 16deg;
    --about-float-duration: 15s;
    top: 72%;
    left: 24%;
    color: #d97706;
  }

  @keyframes bonefree-about-drift {
    from {
      translate: 0 0;
    }

    to {
      translate: 0 -22px;
    }
  }

  @media (max-width: 760px) {
    .about-float {
      width: clamp(58px, 16vw, 86px);
      opacity: 0.26;
    }

    .about-float-users,
    .about-float-heart,
    .about-float-sparkles {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .about-float {
      animation: none;
    }
  }
`;
