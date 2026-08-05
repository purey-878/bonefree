import { CakeSlice, CupSoda, Salad, Sandwich, Soup } from "lucide-react";
import styled from "styled-components";

type FloatingFoodIconsProps = {
  className?: string;
};

export default function FloatingFoodIcons({ className }: FloatingFoodIconsProps) {
  return (
    <FoodFloatLayer className={className} aria-hidden="true">
      <span className="food-float food-float-salad"><Salad /></span>
      <span className="food-float food-float-soup"><Soup /></span>
      <span className="food-float food-float-sandwich"><Sandwich /></span>
      <span className="food-float food-float-drink"><CupSoda /></span>
      <span className="food-float food-float-cake"><CakeSlice /></span>
      <span className="food-float food-float-salad-2"><Salad /></span>
      <span className="food-float food-float-soup-2"><Soup /></span>
      <span className="food-float food-float-sandwich-2"><Sandwich /></span>
      <span className="food-float food-float-drink-2"><CupSoda /></span>
      <span className="food-float food-float-cake-2"><CakeSlice /></span>
    </FoodFloatLayer>
  );
}

const FoodFloatLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;

  .food-float {
    position: absolute;
    display: grid;
    width: clamp(72px, 8vw, 124px);
    aspect-ratio: 1;
    place-items: center;
    border: 1.5px solid color-mix(in srgb, currentColor 38%, transparent);
    border-radius: 24px;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.46)),
      color-mix(in srgb, currentColor 18%, transparent);
    color: #7baf4b;
    opacity: 0.4;
    transform: rotate(var(--food-float-rotate, -8deg));
    animation: prey-food-drift var(--food-float-duration, 13s) ease-in-out infinite alternate;
    box-shadow:
      0 18px 48px color-mix(in srgb, currentColor 18%, transparent),
      inset 0 0 0 1px rgba(255, 255, 255, 0.52);
  }

  .food-float svg {
    width: 52%;
    height: 52%;
    stroke-width: 1.75;
  }

  .food-float-salad {
    --food-float-rotate: -10deg;
    --food-float-duration: 13s;
    top: 12%;
    left: 2.5%;
    color: #5f9f3a;
  }

  .food-float-soup {
    --food-float-rotate: 11deg;
    --food-float-duration: 15s;
    top: 19%;
    right: 4%;
    color: #c47a1d;
  }

  .food-float-sandwich {
    --food-float-rotate: 13deg;
    --food-float-duration: 16s;
    bottom: 20%;
    left: 5%;
    color: #b42318;
  }

  .food-float-drink {
    --food-float-rotate: -15deg;
    --food-float-duration: 14s;
    right: 12%;
    bottom: 11%;
    color: #1c7c86;
  }

  .food-float-cake {
    --food-float-rotate: 8deg;
    --food-float-duration: 17s;
    top: 52%;
    right: -1%;
    color: #b2558a;
  }

  .food-float-salad-2 {
    --food-float-rotate: 14deg;
    --food-float-duration: 18s;
    top: 42%;
    left: 1.5%;
    color: #4d9630;
  }

  .food-float-soup-2 {
    --food-float-rotate: -11deg;
    --food-float-duration: 16s;
    right: 8%;
    bottom: 28%;
    color: #d97706;
  }

  .food-float-sandwich-2 {
    --food-float-rotate: -18deg;
    --food-float-duration: 19s;
    top: 7%;
    right: 24%;
    color: #dc2626;
  }

  .food-float-drink-2 {
    --food-float-rotate: 16deg;
    --food-float-duration: 15s;
    top: 72%;
    left: 24%;
    color: #0891b2;
  }

  .food-float-cake-2 {
    --food-float-rotate: -9deg;
    --food-float-duration: 20s;
    left: 43%;
    bottom: 2%;
    color: #be185d;
  }

  @keyframes prey-food-drift {
    from {
      translate: 0 0;
    }

    to {
      translate: 0 -22px;
    }
  }

  @media (max-width: 760px) {
    .food-float {
      width: clamp(58px, 16vw, 86px);
      opacity: 0.28;
    }

    .food-float-sandwich,
    .food-float-cake,
    .food-float-soup-2,
    .food-float-cake-2 {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .food-float {
      animation: none;
    }
  }
`;
