import { css } from 'styled-components';

export const homeCard = css`
  border: 1px solid var(--home-line, #dbe2ce);
  border-radius: 24px 24px 24px 8px;
  background: var(--home-paper, #fffaf0);
  box-shadow: 0 4px 0 #7baf4b33;
`;

export const homeKicker = css`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  padding: 6px 10px;
  border-radius: 9px 9px 3px 9px;
  background: var(--home-mint, #e6efd7);
  color: #285442;
  font-size: .68rem;
  font-weight: 750;
  line-height: 1.4;
  svg { flex-shrink: 0; }
`;

export const homeHeading = css`
  color: #294b3e;
  font-size: clamp(1.85rem, 3.4vw, 2.9rem);
  font-weight: 850;
  line-height: 1.1;
  letter-spacing: -.035em;
  text-wrap: balance;
`;

export const homeAction = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 46px;
  max-width: 100%;
  padding: 11px 17px;
  border: 1px solid #294b3e;
  border-radius: 15px 15px 15px 5px;
  background: var(--brand-accent, #fdcd43);
  color: #253e2c;
  box-shadow: 0 3px 0 #294b3e;
  font: inherit;
  font-size: .84rem;
  font-weight: 750;
  line-height: 1.4;
  text-decoration: none;
  text-align: center;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
  svg { flex-shrink: 0; }
  &:hover { transform: translateY(-2px); background: #ffdb70; color: #253e2c; box-shadow: 0 5px 0 #294b3e; text-decoration: none; }
  &:active { transform: translateY(2px); box-shadow: 0 1px 0 #294b3e; }
  &:focus-visible { outline: 3px solid #076050; outline-offset: 4px; box-shadow: 0 0 0 7px #fff8e8; }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover, &:active { transform: none; box-shadow: 0 3px 0 #294b3e; }
  }
`;
