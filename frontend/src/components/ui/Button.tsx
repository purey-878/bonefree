import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { forwardRef } from 'react'
import styled, { css } from 'styled-components'

type ButtonVariant = 'primary' | 'secondary'
type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonOwnProps = {
  fullWidth?: boolean
  isLoading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  size?: ButtonSize
  variant?: ButtonVariant
}

export type ButtonProps = ButtonOwnProps &
  Omit<ComponentPropsWithoutRef<'button'>, keyof ButtonOwnProps>

type StyledButtonProps = {
  $fullWidth?: boolean
  $size: ButtonSize
  $variant: ButtonVariant
}

const buttonHeights: Record<ButtonSize, string> = {
  sm: '38px',
  md: '46px',
  lg: '54px',
}

const buttonPadding: Record<ButtonSize, string> = {
  sm: '0 14px',
  md: '0 18px',
  lg: '0 24px',
}

const buttonVariantStyles = {
  primary: css`
    background: var(--brand-gradient);
    border-color: rgba(253, 205, 67, 0.34);
    color: var(--white);
    box-shadow: none;
  `,
  secondary: css`
    background: #ffffff;
    border-color: var(--glass-border);
    color: var(--brand-ink);
    box-shadow: none;
  `,
} satisfies Record<ButtonVariant, ReturnType<typeof css>>

const ButtonShell = styled.button<StyledButtonProps>`
  position: relative;
  display: inline-flex;
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
  min-height: ${({ $size }) => buttonHeights[$size]};
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  overflow: hidden;
  padding: ${({ $size }) => buttonPadding[$size]};
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-family: var(--font-family-base);
  font-size: 0.95rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: var(--letter-spacing-base);
  text-decoration: none;
  white-space: nowrap;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease,
    opacity 180ms ease;

  ${({ $variant }) => buttonVariantStyles[$variant]}

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(253, 205, 67, 0.48);
    box-shadow: none;
    text-decoration: none;
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
    transform: none;
  }
`

const ButtonContent = styled.span`
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
`

const IconSlot = styled.span`
  display: inline-flex;
  width: 1.1em;
  height: 1.1em;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
`

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    disabled,
    fullWidth = false,
    isLoading = false,
    leftIcon,
    rightIcon,
    size = 'md',
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref,
) {
  return (
    <ButtonShell
      ref={ref}
      $fullWidth={fullWidth}
      $size={size}
      $variant={variant}
      disabled={disabled || isLoading}
      type={type}
      {...props}
    >
      <ButtonContent>
        {leftIcon && <IconSlot aria-hidden="true">{leftIcon}</IconSlot>}
        {isLoading ? 'A carregar...' : children}
        {rightIcon && <IconSlot aria-hidden="true">{rightIcon}</IconSlot>}
      </ButtonContent>
    </ButtonShell>
  )
})

export const PrimaryButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'variant'>
>(function PrimaryButton(props, ref) {
  return <Button ref={ref} variant="primary" {...props} />
})

export const SecondaryButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'variant'>
>(function SecondaryButton(props, ref) {
  return <Button ref={ref} variant="secondary" {...props} />
})

type IconButtonOwnProps = {
  isLoading?: boolean
  size?: ButtonSize
  variant?: ButtonVariant
}

export type IconButtonProps = IconButtonOwnProps &
  Omit<ComponentPropsWithoutRef<'button'>, keyof IconButtonOwnProps | 'children'> & {
    'aria-label': string
    children: ReactNode
  }

const iconButtonSize: Record<ButtonSize, string> = {
  sm: '38px',
  md: '44px',
  lg: '50px',
}

const IconButtonShell = styled(ButtonShell)`
  width: ${({ $size }) => iconButtonSize[$size]};
  min-width: ${({ $size }) => iconButtonSize[$size]};
  padding: 0;
`

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      children,
      disabled,
      isLoading = false,
      size = 'md',
      type = 'button',
      variant = 'secondary',
      ...props
    },
    ref,
  ) {
    return (
      <IconButtonShell
        ref={ref}
        $fullWidth={false}
        $size={size}
        $variant={variant}
        disabled={disabled || isLoading}
        type={type}
        {...props}
      >
        <ButtonContent>{isLoading ? '...' : children}</ButtonContent>
      </IconButtonShell>
    )
  },
)
