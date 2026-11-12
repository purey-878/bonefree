import { Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

export default function WeekendEvents() {
  const { t } = useTranslation('storefront');
  return <Programme aria-label={t('events.weeklyTitle')}>
    <Music2 size={28} aria-hidden="true" />
    <div><span>{t('events.weeklyKicker')}</span><h3>{t('events.weeklyTitle')}</h3><p>{t('events.weeklyText')}</p></div>
  </Programme>;
}

const Programme = styled.aside`
  display: flex;
  align-items: flex-start;
  gap: 22px;
  padding: clamp(24px, 4vw, 40px);
  margin-bottom: 28px;
  border-radius: 28px;
  background: color-mix(in srgb, var(--brand-main) 15%, var(--glass-bg-strong));
  color: var(--brand-ink);
  > svg { flex-shrink: 0; margin-top: 4px; color: var(--brand-secondary); }
  span { font-size: .78rem; font-weight: 700; color: var(--brand-secondary); }
  h3 { margin: 10px 0 14px; font-size: clamp(1.6rem, 3vw, 2.4rem); line-height: 1.15; letter-spacing: -.03em; font-weight: 900; }
  p { margin: 0; max-width: 760px; font-size: .95rem; line-height: 1.8; color: var(--brand-muted); }
  @media (max-width: 480px) { gap: 14px; > svg { width: 22px; } }
`;
