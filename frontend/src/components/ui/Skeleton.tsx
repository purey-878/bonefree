import type { ComponentPropsWithoutRef, CSSProperties } from 'react'
import styled from 'styled-components'

export type SkeletonProps = ComponentPropsWithoutRef<'span'> & {
  circle?: boolean
  height?: CSSProperties['height']
  radius?: CSSProperties['borderRadius']
  width?: CSSProperties['width']
}

const SkeletonShell = styled.span`
  position: relative;
  display: block;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.035)),
    rgba(12, 18, 15, 0.46);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);

  &::after {
    position: absolute;
    inset: 0;
    content: '';
    background:
      linear-gradient(
        100deg,
        transparent 0%,
        rgba(247, 249, 244, 0.1) 38%,
        rgba(253, 205, 67, 0.12) 50%,
        transparent 64%
      );
    transform: translateX(-120%);
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  @keyframes skeleton-shimmer {
    to {
      transform: translateX(120%);
    }
  }
`

export function Skeleton({
  circle = false,
  height = '1rem',
  radius = 'var(--radius-sm)',
  style,
  width = '100%',
  ...props
}: SkeletonProps) {
  return (
    <SkeletonShell
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: circle ? '999px' : radius,
        ...style,
      }}
      {...props}
    />
  )
}

const ProductCardSkeletonShell = styled.article`
  display: grid;
  gap: 1rem;
  overflow: hidden;
  padding: 1rem;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  background: var(--glass-bg-strong);
  box-shadow: var(--shadow-glass);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
`

const SkeletonRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
`

export function ProductCardSkeleton() {
  return (
    <ProductCardSkeletonShell aria-label="A carregar produto">
      <Skeleton height="190px" />
      <SkeletonRow>
        <Skeleton width="38%" height="28px" radius="999px" />
        <Skeleton width="28%" height="22px" radius="999px" />
      </SkeletonRow>
      <Skeleton width="78%" height="24px" />
      <Skeleton width="100%" height="14px" />
      <Skeleton width="72%" height="14px" />
      <SkeletonRow>
        <Skeleton width="34%" height="32px" />
        <Skeleton width="44%" height="42px" />
      </SkeletonRow>
    </ProductCardSkeletonShell>
  )
}
