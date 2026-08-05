import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import styled, { css } from 'styled-components'

type FieldState = 'default' | 'error' | 'success'

type InputOwnProps = {
  fieldState?: FieldState
}

export type InputProps = InputOwnProps &
  Omit<ComponentPropsWithoutRef<'input'>, keyof InputOwnProps>

export type TextareaProps = InputOwnProps &
  Omit<ComponentPropsWithoutRef<'textarea'>, keyof InputOwnProps>

const fieldStateStyles = {
  default: css`
    border-color: #c8d6c3;
  `,
  error: css`
    border-color: rgba(255, 122, 122, 0.58);
    box-shadow: 0 0 0 3px rgba(255, 122, 122, 0.12);
  `,
  success: css`
    border-color: rgba(139, 226, 143, 0.5);
    box-shadow: 0 0 0 3px rgba(139, 226, 143, 0.1);
  `,
} satisfies Record<FieldState, ReturnType<typeof css>>

const fieldStyles = css<{ $fieldState: FieldState }>`
  width: 100%;
  border: 1px solid;
  border-radius: var(--radius-sm);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 246, 0.9));
  color: var(--brand-ink);
  font-family: var(--font-family-base);
  font-size: 0.96rem;
  font-weight: var(--font-weight-body);
  letter-spacing: var(--letter-spacing-base);
  outline: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition:
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;

  ${({ $fieldState }) => fieldStateStyles[$fieldState]}

  &::placeholder {
    color: #93a097;
  }

  &:hover:not(:disabled) {
    border-color: rgba(253, 205, 67, 0.42);
  }

  &:focus {
    border-color: var(--focus-ring);
    background: #ffffff;
    box-shadow:
      var(--focus-ring-shadow),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
`

const StyledInput = styled.input<{ $fieldState: FieldState }>`
  ${fieldStyles}
  min-height: 46px;
  padding: 0 14px;
`

const StyledTextarea = styled.textarea<{ $fieldState: FieldState }>`
  ${fieldStyles}
  min-height: 116px;
  padding: 12px 14px;
  resize: vertical;
`

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { fieldState = 'default', ...props },
  ref,
) {
  return <StyledInput ref={ref} $fieldState={fieldState} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ fieldState = 'default', ...props }, ref) {
    return <StyledTextarea ref={ref} $fieldState={fieldState} {...props} />
  },
)

const FieldShell = styled.label`
  display: grid;
  gap: 0.5rem;
  color: var(--brand-ink);
  font-family: var(--font-family-base);
  font-weight: 700;
`

const FieldHintShell = styled.span`
  color: var(--brand-muted);
  font-size: 0.84rem;
  font-weight: 500;
  line-height: 1.45;
`

const FieldErrorShell = styled(FieldHintShell)`
  color: #b42318;
`

export function Field(props: ComponentPropsWithoutRef<'label'>) {
  return <FieldShell {...props} />
}

export function FieldHint(props: ComponentPropsWithoutRef<'span'>) {
  return <FieldHintShell {...props} />
}

export function FieldError(props: ComponentPropsWithoutRef<'span'>) {
  return <FieldErrorShell {...props} />
}
