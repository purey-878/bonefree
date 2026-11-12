import type { ComponentPropsWithoutRef } from 'react';
import { Sparkles } from 'lucide-react';
import styled from 'styled-components';

const Label = styled.span`
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  width: fit-content;
  max-width: 100%;
  min-height: 32px;
  padding: .5rem 1.35rem .5rem .7rem;
  border-left: 3px solid #076050;
  border-radius: 3px 0 0 3px;
  background: #fdcd43;
  color: #173d30;
  clip-path: polygon(0 0, 100% 0, calc(100% - 9px) 50%, 100% 100%, 0 100%);
  font-size: .68rem;
  font-weight: 850;
  line-height: 1.35;
  letter-spacing: .07em;
  text-transform: uppercase;
  text-align: left;

  svg { flex-shrink: 0; }
  span { overflow-wrap: anywhere; }
`;

export default function ProductLabel({ children, ...props }: ComponentPropsWithoutRef<'span'>) {
  return <Label {...props}><Sparkles size={14} aria-hidden="true" /><span>{children}</span></Label>;
}
