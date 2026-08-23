import styled from 'styled-components'


const Page = styled.main`
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
  background: var(--background-body);
  color: var(--brand-ink);
`

const Card = styled.section`
  width: min(32rem, 100%);
  padding: 2.5rem;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  background: var(--glass-bg-strong);
  box-shadow: var(--shadow-glass);
  text-align: center;

  h1 {
    margin-bottom: 0.75rem;
    font-size: clamp(1.6rem, 5vw, 2.25rem);
  }

  p {
    color: var(--brand-muted);
    line-height: 1.6;
  }
`

export function OrganizationResolutionScreen({ loading = false }: { loading?: boolean }) {
  return (
    <Page aria-live="polite">
      <Card>
        <h1>{loading ? 'A carregar…' : 'Domínio não configurado'}</h1>
        <p>
          {loading
            ? 'Estamos a identificar o restaurante.'
            : 'Este endereço ainda não está associado a um restaurante. Confirme o domínio e tente novamente.'}
        </p>
      </Card>
    </Page>
  )
}
