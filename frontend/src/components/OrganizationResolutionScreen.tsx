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

export type OrganizationBootstrapError =
  | 'domain_not_configured'
  | 'deployment_tenant_mismatch'
  | 'configuration_unavailable'
  | 'experience_schema_incompatible'
  | 'theme_not_in_build'

const errorContent: Record<OrganizationBootstrapError, { title: string; message: string }> = {
  domain_not_configured: {
    title: 'Domínio não configurado',
    message: 'Este endereço ainda não está associado a um restaurante. Confirme o domínio e tente novamente.',
  },
  deployment_tenant_mismatch: {
    title: 'Aplicação publicada no domínio errado',
    message: 'Este artefacto não pertence ao restaurante resolvido para este endereço.',
  },
  configuration_unavailable: {
    title: 'Configuração indisponível',
    message: 'Não foi possível carregar a experiência deste restaurante. Tente novamente mais tarde.',
  },
  experience_schema_incompatible: {
    title: 'Configuração incompatível',
    message: 'Este artefacto não suporta a versão da experiência configurada para o restaurante.',
  },
  theme_not_in_build: {
    title: 'Tema indisponível',
    message: 'O tema configurado para este restaurante não existe neste artefacto.',
  },
}

export function OrganizationResolutionScreen({
  loading = false,
  error = 'domain_not_configured',
}: {
  loading?: boolean
  error?: OrganizationBootstrapError
}) {
  const content = errorContent[error]
  return (
    <Page aria-live="polite">
      <Card>
        <h1>{loading ? 'A carregar…' : content.title}</h1>
        <p>
          {loading
            ? 'Estamos a identificar o restaurante.'
            : content.message}
        </p>
      </Card>
    </Page>
  )
}
