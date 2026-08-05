import { BadgePercent, CreditCard, ReceiptText, ShoppingBag, Sparkles, UserRound, WalletCards } from "lucide-react";
import styled from "styled-components";

type FloatingProfileIconsProps = {
  className?: string;
};

export default function FloatingProfileIcons({ className }: FloatingProfileIconsProps) {
  return (
    <ProfileFloatLayer className={className} aria-hidden="true">
      <span className="profile-float profile-float-user"><UserRound /></span>
      <span className="profile-float profile-float-receipt"><ReceiptText /></span>
      <span className="profile-float profile-float-bag"><ShoppingBag /></span>
      <span className="profile-float profile-float-wallet"><WalletCards /></span>
      <span className="profile-float profile-float-card"><CreditCard /></span>
      <span className="profile-float profile-float-coupon"><BadgePercent /></span>
      <span className="profile-float profile-float-sparkles"><Sparkles /></span>
    </ProfileFloatLayer>
  );
}

const ProfileFloatLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;

  .profile-float {
    position: absolute;
    display: grid;
    width: clamp(70px, 7.6vw, 118px);
    aspect-ratio: 1;
    place-items: center;
    border: 1.5px solid color-mix(in srgb, currentColor 36%, transparent);
    border-radius: 24px;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0.44)),
      color-mix(in srgb, currentColor 17%, transparent);
    color: var(--brand-main, #7baf4b);
    opacity: 0.34;
    transform: rotate(var(--profile-float-rotate, -8deg));
    animation: prey-profile-drift var(--profile-float-duration, 14s) ease-in-out infinite alternate;
    box-shadow:
      0 18px 48px color-mix(in srgb, currentColor 16%, transparent),
      inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  }

  .profile-float svg {
    width: 52%;
    height: 52%;
    stroke-width: 1.75;
  }

  .profile-float-user {
    --profile-float-rotate: -10deg;
    --profile-float-duration: 13s;
    top: 13%;
    left: 2.5%;
    color: var(--brand-main, #7baf4b);
  }

  .profile-float-receipt {
    --profile-float-rotate: 11deg;
    --profile-float-duration: 15s;
    top: 18%;
    right: 4%;
    color: var(--brand-secondary, #076050);
  }

  .profile-float-bag {
    --profile-float-rotate: 13deg;
    --profile-float-duration: 16s;
    bottom: 20%;
    left: 5%;
    color: var(--theme-price-highlight, #b42318);
  }

  .profile-float-wallet {
    --profile-float-rotate: -15deg;
    --profile-float-duration: 14s;
    right: 12%;
    bottom: 11%;
    color: var(--brand-accent, #fdcd43);
  }

  .profile-float-card {
    --profile-float-rotate: 8deg;
    --profile-float-duration: 17s;
    top: 52%;
    right: -1%;
    color: color-mix(in srgb, var(--brand-secondary, #076050) 72%, var(--brand-accent, #fdcd43));
  }

  .profile-float-coupon {
    --profile-float-rotate: 14deg;
    --profile-float-duration: 18s;
    top: 42%;
    left: 1.5%;
    color: color-mix(in srgb, var(--brand-main, #7baf4b) 74%, var(--brand-accent, #fdcd43));
  }

  .profile-float-sparkles {
    --profile-float-rotate: -18deg;
    --profile-float-duration: 19s;
    top: 7%;
    right: 24%;
    color: var(--brand-accent, #fdcd43);
  }

  @keyframes prey-profile-drift {
    from {
      translate: 0 0;
    }

    to {
      translate: 0 -22px;
    }
  }

  @media (max-width: 760px) {
    .profile-float {
      width: clamp(58px, 16vw, 86px);
      opacity: 0.24;
    }

    .profile-float-bag,
    .profile-float-card,
    .profile-float-sparkles {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .profile-float {
      animation: none;
    }
  }
`;
