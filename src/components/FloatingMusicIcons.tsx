import { AudioLines, AudioWaveform, BoomBox, CassetteTape, Music2, Radio, Speaker, Turntable } from "lucide-react";
import styled from "styled-components";

type FloatingMusicIconsProps = {
  className?: string;
};

export default function FloatingMusicIcons({ className }: FloatingMusicIconsProps) {
  return (
    <MusicFloatLayer className={className} aria-hidden="true">
      <span className="music-float music-float-turntable"><Turntable /></span>
      <span className="music-float music-float-waveform"><AudioWaveform /></span>
      <span className="music-float music-float-boombox"><BoomBox /></span>
      <span className="music-float music-float-radio"><Radio /></span>
      <span className="music-float music-float-note"><Music2 /></span>
      <span className="music-float music-float-cassette"><CassetteTape /></span>
      <span className="music-float music-float-lines"><AudioLines /></span>
      <span className="music-float music-float-speaker"><Speaker /></span>
    </MusicFloatLayer>
  );
}

const MusicFloatLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;

  .music-float {
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
    opacity: 0.38;
    transform: rotate(var(--music-float-rotate, -8deg));
    animation: prey-music-drift var(--music-float-duration, 13s) ease-in-out infinite alternate;
    box-shadow:
      0 18px 48px color-mix(in srgb, currentColor 18%, transparent),
      inset 0 0 0 1px rgba(255, 255, 255, 0.52);
  }

  .music-float svg {
    width: 52%;
    height: 52%;
    stroke-width: 1.75;
  }

  .music-float-turntable {
    --music-float-rotate: -10deg;
    --music-float-duration: 13s;
    top: 12%;
    left: 2.5%;
    color: #5f9f3a;
  }

  .music-float-waveform {
    --music-float-rotate: 11deg;
    --music-float-duration: 15s;
    top: 18%;
    right: 4%;
    color: #c47a1d;
  }

  .music-float-boombox {
    --music-float-rotate: 13deg;
    --music-float-duration: 16s;
    bottom: 18%;
    left: 5%;
    color: #b42318;
  }

  .music-float-radio {
    --music-float-rotate: -15deg;
    --music-float-duration: 14s;
    right: 12%;
    bottom: 11%;
    color: #1c7c86;
  }

  .music-float-note {
    --music-float-rotate: 8deg;
    --music-float-duration: 17s;
    top: 52%;
    right: -1%;
    color: #b2558a;
  }

  .music-float-cassette {
    --music-float-rotate: 14deg;
    --music-float-duration: 18s;
    top: 42%;
    left: 1.5%;
    color: #4d9630;
  }

  .music-float-lines {
    --music-float-rotate: -18deg;
    --music-float-duration: 19s;
    top: 7%;
    right: 24%;
    color: #dc2626;
  }

  .music-float-speaker {
    --music-float-rotate: 16deg;
    --music-float-duration: 15s;
    top: 72%;
    left: 24%;
    color: #0891b2;
  }

  @keyframes prey-music-drift {
    from {
      translate: 0 0;
    }

    to {
      translate: 0 -22px;
    }
  }

  @media (max-width: 760px) {
    .music-float {
      width: clamp(58px, 16vw, 86px);
      opacity: 0.28;
    }

    .music-float-boombox,
    .music-float-note,
    .music-float-speaker {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .music-float {
      animation: none;
    }
  }
`;
