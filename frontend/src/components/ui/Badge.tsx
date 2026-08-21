import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import styled, { css } from 'styled-components'

type BadgeVariant = 'accent' | 'danger' | 'glass' | 'neutral' | 'success'
type BadgeSize = 'sm' | 'md'

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
  dot?: boolean
  size?: BadgeSize
  variant?: BadgeVariant
}

type BadgeShellProps = {
  $dot?: boolean
  $size: BadgeSize
  $variant: BadgeVariant
}

const badgeVariantStyles = {
  accent: css`
    background: rgba(253, 205, 67, 0.14);
    border-color: rgba(253, 205, 67, 0.38);
    color: #6b560a;
  `,
  danger: css`
    background: rgba(255, 122, 122, 0.13);
    border-color: rgba(255, 122, 122, 0.42);
    color: #991b1b;
  `,
  glass: css`
    background: #ffffff;
    border-color: var(--glass-border);
    color: var(--brand-ink);
  `,
  neutral: css`
    background: #f4f8f1;
    border-color: #dbe5d7;
    color: var(--brand-muted);
  `,
  success: css`
    background: rgba(139, 226, 143, 0.12);
    border-color: rgba(139, 226, 143, 0.36);
    color: #166534;
  `,
} satisfies Record<BadgeVariant, ReturnType<typeof css>>

const BadgeShell = styled.span<BadgeShellProps>`
  display: inline-flex;
  min-height: ${({ $size }) => ($size === 'sm' ? '26px' : '32px')};
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  width: fit-content;
  max-width: 100%;
  padding: ${({ $size }) => ($size === 'sm' ? '0 10px' : '0 12px')};
  border: 1px solid;
  border-radius: 999px;
  font-family: var(--font-family-base);
  font-size: ${({ $size }) => ($size === 'sm' ? '0.72rem' : '0.8rem')};
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  backdrop-filter: blur(14px) saturate(145%);
  -webkit-backdrop-filter: blur(14px) saturate(145%);

  ${({ $variant }) => badgeVariantStyles[$variant]}

  &::before {
    display: ${({ $dot }) => ($dot ? 'block' : 'none')};
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 999px;
    content: '';
    background: currentColor;
    box-shadow: 0 0 12px currentColor;
  }
`

export function Badge({
  children,
  dot = false,
  size = 'md',
  variant = 'glass',
  ...props
}: BadgeProps) {
  return (
    <BadgeShell $dot={dot} $size={size} $variant={variant} {...props}>
      {children}
    </BadgeShell>
  )
}

type CategoryBadgeProps = Omit<BadgeProps, 'children' | 'variant'> & {
  count?: number
  name: ReactNode
}

export function CategoryBadge({ count, name, ...props }: CategoryBadgeProps) {
  return (
    <Badge dot={false} size="md" variant="glass" {...props}>
      <span>{name}</span>
      {typeof count === 'number' && (
        <BadgeCount aria-label={`${count} produtos`}>{count}</BadgeCount>
      )}
    </Badge>
  )
}

const BadgeCount = styled.span`
  display: inline-flex;
  min-width: 1.5rem;
  height: 1.5rem;
  align-items: center;
  justify-content: center;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--brand-accent);
  color: #171915;
  font-size: 0.78rem;
  font-weight: 900;
`

type AvailabilityBadgeProps = Omit<BadgeProps, 'children' | 'variant'> & {
  available: boolean
}

export function AvailabilityBadge({ available, ...props }: AvailabilityBadgeProps) {
  return (
    <Badge
      dot
      size="sm"
      variant={available ? 'success' : 'danger'}
      {...props}
    >
      {available ? 'Disponível' : 'Atualmente indisponível'}
    </Badge>
  )
}
