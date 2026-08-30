import { useMemo } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import Navbar from "../components/Navbar"
import { normalizeLocale } from "../i18n"
import { useOrganization } from "../organization/context/organization-context"
import "./Legal.css"

const contactEmail = "{{organization_contact}}"

type LegalSection = {
  title: string
  body?: string[]
  list?: string[]
}

type TermsContent = {
  eyebrow: string
  title: string
  description: string
  updated: string
  aria: string
  summaryTitle: string
  summaryText: string
  privacyLink: string
  sections: LegalSection[]
}

function personalizeTerms(page: TermsContent, organizationName: string, contact: string | null): TermsContent {
  const personalize = (value: string) => value
    .split("Bonefree").join(organizationName)
    .split(contactEmail).join(contact ?? "")
  return {
    ...page,
    eyebrow: personalize(page.eyebrow),
    description: personalize(page.description),
    summaryText: personalize(page.summaryText),
    sections: page.sections
      .map((section) => ({
        ...section,
        title: personalize(section.title),
        body: section.body
          ?.filter((line) => Boolean(contact) || !line.includes(contactEmail))
          .map(personalize),
        list: section.list?.map(personalize),
      }))
      .filter((section) => (section.body?.length ?? 0) > 0 || (section.list?.length ?? 0) > 0),
  }
}

const content: Record<string, TermsContent> = {
  "pt-PT": {
    eyebrow: "Protótipo Bonefree",
    title: "Termos e Condições",
    description: "Regras simples para utilizar este protótipo de forma segura, transparente e responsável.",
    updated: "Última atualização: 29/08/2026",
    aria: "Termos e Condições",
    summaryTitle: "Resumo rápido",
    summaryText: "Este protótipo serve apenas para demonstração e teste. Pedidos, pagamentos e funcionalidades não representam um serviço oficial do Bonefree.",
    privacyLink: "Ver Política de Privacidade",
    sections: [
      {
        title: "1. Identificação e âmbito",
        body: [
          "Este website é um protótipo desenvolvido para fins de demonstração, teste e validação. Não constitui o website oficial do Bonefree nem um canal oficial de atendimento, contratação, reserva ou compra.",
          "O protótipo foi desenvolvido com conhecimento e autorização do Bonefree, mas é operado pelos responsáveis pelo projeto de desenvolvimento. Funcionalidades, conteúdos e disponibilidade podem ser alterados ou removidos a qualquer momento durante a fase de testes.",
        ],
      },
      {
        title: "2. Descrição do serviço",
        body: [
          "A plataforma permite consultar informação demonstrativa sobre o restaurante, navegar pelo menu, criar uma conta, manter carrinho, simular pedidos, consultar histórico, cupões e funcionalidades de administração associadas ao protótipo.",
          "Os conteúdos, preços, disponibilidade, imagens, estados de pedido e funcionalidades podem ser fictícios, incompletos ou alterados sem aviso durante a fase de testes.",
        ],
      },
      {
        title: "3. Regras de utilização",
        list: [
          "Utilizar a plataforma apenas de forma lícita, respeitosa e compatível com fins de teste e demonstração.",
          "Não introduzir informação falsa, ofensiva, ilegal ou que pertença a terceiros sem autorização.",
          "Não tentar aceder a áreas restritas, contornar mecanismos de segurança, explorar vulnerabilidades ou prejudicar a disponibilidade do serviço.",
          "Comunicar erros relevantes aos responsáveis pelo projeto quando detetados durante a utilização.",
        ],
      },
      {
        title: "4. Conta do utilizador",
        body: [
          "Ao criar uma conta, o utilizador deve fornecer dados corretos e manter a confidencialidade das suas credenciais. Qualquer atividade realizada através da conta é da responsabilidade do respetivo utilizador, salvo uso indevido comprovado por terceiros.",
          "Os responsáveis pelo protótipo podem suspender, bloquear ou remover contas quando exista uso indevido, risco de segurança, violação destes termos ou necessidade técnica durante os testes.",
        ],
      },
      {
        title: "5. Pedidos, pagamentos e ambiente de teste",
        body: [
          "Este é um ambiente de teste. Pedidos enviados aqui não constituem pedidos oficiais ao Bonefree. Nenhum pedido será processado pelo Bonefree salvo indicação expressa em contrário.",
          "Qualquer referência a pagamento, recibo, fatura, preparação, entrega, fidelização ou cupões serve para validar o funcionamento do protótipo e não representa uma obrigação comercial real, salvo comunicação expressa dos responsáveis autorizados.",
        ],
      },
      {
        title: "6. Cancelamento e cessação",
        body: [
          "O utilizador pode deixar de utilizar o protótipo a qualquer momento. Os responsáveis pelo projeto podem alterar, suspender ou cessar o acesso total ou parcial à plataforma durante a fase de testes, incluindo por motivos técnicos, de segurança ou de validação do produto.",
        ],
      },
      {
        title: "7. Propriedade intelectual",
        body: [
          "Marcas, logótipos, imagens, textos, código, interfaces e restantes materiais apresentados na plataforma pertencem aos respetivos titulares, incluindo Bonefree e os responsáveis pelo desenvolvimento, quando aplicável.",
          "O utilizador recebe apenas uma autorização limitada para aceder e utilizar o protótipo. Não é permitido copiar, explorar comercialmente, distribuir ou modificar conteúdos da plataforma sem autorização prévia.",
        ],
      },
      {
        title: "8. Limitação de responsabilidade",
        body: [
          "Por se tratar de um protótipo, a plataforma pode conter erros, interrupções, indisponibilidades, dados demonstrativos ou comportamentos incompletos. Na medida permitida por lei, os responsáveis pelo projeto não respondem por perdas resultantes da utilização experimental da plataforma, salvo em caso de dolo ou responsabilidade que não possa ser excluída legalmente.",
        ],
      },
      {
        title: "9. Alterações aos termos",
        body: ["Estes termos podem ser atualizados para refletir alterações ao protótipo, requisitos legais ou decisões do projeto. A versão publicada nesta página é a versão aplicável no momento da utilização."],
      },
      {
        title: "10. Lei aplicável e resolução de conflitos",
        body: ["Estes termos são interpretados de acordo com a lei portuguesa. Em caso de dúvida ou conflito, o utilizador deve contactar primeiro os responsáveis pelo projeto para tentativa de resolução amigável, sem prejuízo dos meios legais disponíveis."],
      },
      {
        title: "11. Contacto",
        body: [`Para questões sobre estes Termos e Condições ou sobre o funcionamento do protótipo, contacte os responsáveis pelo desenvolvimento através do email ${contactEmail}.`],
      },
    ],
  },
  "en-GB": {
    eyebrow: "Bonefree prototype",
    title: "Terms and Conditions",
    description: "Simple rules for using this prototype safely, transparently and responsibly.",
    updated: "Last updated: 29/08/2026",
    aria: "Terms and Conditions",
    summaryTitle: "Quick summary",
    summaryText: "This prototype is for demonstration and testing only. Orders, payments and features do not represent an official Bonefree service.",
    privacyLink: "View Privacy Policy",
    sections: [
      {
        title: "1. Identification and scope",
        body: [
          "This website is a prototype developed for demonstration, testing and validation purposes. It is not Bonefree's official website and it is not an official channel for support, contracting, reservations or purchases.",
          "The prototype was developed with Bonefree's knowledge and authorisation, but it is operated by the people responsible for the development project. Features, content and availability may be changed or removed at any time during the testing phase.",
        ],
      },
      {
        title: "2. Service description",
        body: [
          "The platform lets users view demonstrative restaurant information, browse the menu, create an account, keep a basket, simulate orders, view history, vouchers and prototype administration features.",
          "Content, prices, availability, images, order statuses and features may be fictional, incomplete or changed without notice during testing.",
        ],
      },
      {
        title: "3. Rules of use",
        list: [
          "Use the platform only lawfully, respectfully and in a way compatible with testing and demonstration purposes.",
          "Do not submit false, offensive or unlawful information, or information belonging to third parties without authorisation.",
          "Do not try to access restricted areas, bypass security measures, exploit vulnerabilities or harm service availability.",
          "Report relevant errors to the project operators when found during use.",
        ],
      },
      {
        title: "4. User account",
        body: [
          "When creating an account, users must provide accurate data and keep their credentials confidential. Activity carried out through an account is the user's responsibility, except where misuse by a third party is proven.",
          "The prototype operators may suspend, block or remove accounts when there is misuse, a security risk, a breach of these terms or a technical need during testing.",
        ],
      },
      {
        title: "5. Orders, payments and test environment",
        body: [
          "This is a test environment. Orders submitted here are not official Bonefree orders. No order will be processed by Bonefree unless expressly stated otherwise.",
          "Any reference to payment, receipt, invoice, preparation, delivery, loyalty or vouchers exists to validate the prototype and does not create a real commercial obligation unless expressly communicated by authorised operators.",
        ],
      },
      {
        title: "6. Cancellation and termination",
        body: ["Users may stop using the prototype at any time. The project operators may change, suspend or terminate access to all or part of the platform during testing, including for technical, security or product validation reasons."],
      },
      {
        title: "7. Intellectual property",
        body: [
          "Brands, logos, images, texts, code, interfaces and other materials shown on the platform belong to their respective owners, including Bonefree and the development operators where applicable.",
          "Users receive only limited permission to access and use the prototype. Copying, commercial exploitation, distribution or modification of platform content is not permitted without prior authorisation.",
        ],
      },
      {
        title: "8. Limitation of liability",
        body: ["Because this is a prototype, the platform may contain errors, interruptions, unavailable features, demonstrative data or incomplete behaviour. To the extent allowed by law, the project operators are not liable for losses resulting from experimental use of the platform, except in cases of intentional misconduct or liability that cannot legally be excluded."],
      },
      {
        title: "9. Changes to these terms",
        body: ["These terms may be updated to reflect changes to the prototype, legal requirements or project decisions. The version published on this page is the version that applies at the time of use."],
      },
      {
        title: "10. Applicable law and disputes",
        body: ["These terms are interpreted under Portuguese law. In case of doubt or dispute, users should first contact the project operators to seek an amicable resolution, without prejudice to available legal remedies."],
      },
      {
        title: "11. Contact",
        body: [`For questions about these Terms and Conditions or the prototype, contact the people responsible for development at ${contactEmail}.`],
      },
    ],
  },
  "de-DE": {
    eyebrow: "Bonefree-Prototyp",
    title: "Allgemeine Geschäftsbedingungen",
    description: "Einfache Regeln für die sichere, transparente und verantwortungsvolle Nutzung dieses Prototyps.",
    updated: "Zuletzt aktualisiert: 29.08.2026",
    aria: "Allgemeine Geschäftsbedingungen",
    summaryTitle: "Kurzfassung",
    summaryText: "Dieser Prototyp dient nur der Demonstration und dem Test. Bestellungen, Zahlungen und Funktionen stellen keinen offiziellen Service von Bonefree dar.",
    privacyLink: "Datenschutzerklärung ansehen",
    sections: [
      {
        title: "1. Identifikation und Geltungsbereich",
        body: [
          "Diese Website ist ein Prototyp, der zu Demonstrations-, Test- und Validierungszwecken entwickelt wurde. Sie ist nicht die offizielle Website von Bonefree und kein offizieller Kanal für Support, Verträge, Reservierungen oder Käufe.",
          "Der Prototyp wurde mit Wissen und Genehmigung von Bonefree entwickelt, wird jedoch von den Verantwortlichen des Entwicklungsprojekts betrieben. Funktionen, Inhalte und Verfügbarkeit können während der Testphase jederzeit geändert oder entfernt werden.",
        ],
      },
      {
        title: "2. Beschreibung des Dienstes",
        body: [
          "Die Plattform ermöglicht das Anzeigen demonstrativer Restaurantinformationen, das Durchsuchen der Speisekarte, das Erstellen eines Kontos, das Speichern eines Warenkorbs, das Simulieren von Bestellungen sowie das Anzeigen von Verlauf, Gutscheinen und Verwaltungsfunktionen des Prototyps.",
          "Inhalte, Preise, Verfügbarkeit, Bilder, Bestellstatus und Funktionen können fiktiv, unvollständig oder während der Tests ohne Vorankündigung geändert werden.",
        ],
      },
      {
        title: "3. Nutzungsregeln",
        list: [
          "Die Plattform darf nur rechtmäßig, respektvoll und im Einklang mit Test- und Demonstrationszwecken genutzt werden.",
          "Es dürfen keine falschen, beleidigenden oder rechtswidrigen Informationen und keine Daten Dritter ohne Erlaubnis eingegeben werden.",
          "Es ist nicht erlaubt, auf gesperrte Bereiche zuzugreifen, Sicherheitsmaßnahmen zu umgehen, Schwachstellen auszunutzen oder die Verfügbarkeit des Dienstes zu beeinträchtigen.",
          "Relevante Fehler sollten den Projektverantwortlichen gemeldet werden, wenn sie während der Nutzung erkannt werden.",
        ],
      },
      {
        title: "4. Benutzerkonto",
        body: [
          "Bei der Kontoerstellung müssen Nutzer korrekte Daten angeben und ihre Zugangsdaten vertraulich behandeln. Aktivitäten über ein Konto liegen in der Verantwortung des jeweiligen Nutzers, außer wenn ein Missbrauch durch Dritte nachgewiesen wird.",
          "Die Betreiber des Prototyps können Konten sperren, blockieren oder entfernen, wenn Missbrauch, ein Sicherheitsrisiko, ein Verstoß gegen diese Bedingungen oder ein technischer Bedarf während der Tests besteht.",
        ],
      },
      {
        title: "5. Bestellungen, Zahlungen und Testumgebung",
        body: [
          "Dies ist eine Testumgebung. Hier gesendete Bestellungen sind keine offiziellen Bestellungen bei Bonefree. Keine Bestellung wird von Bonefree bearbeitet, sofern nicht ausdrücklich etwas anderes angegeben wird.",
          "Jede Bezugnahme auf Zahlung, Beleg, Rechnung, Zubereitung, Lieferung, Treueprogramm oder Gutscheine dient der Validierung des Prototyps und begründet keine echte kommerzielle Verpflichtung, sofern dies nicht ausdrücklich von autorisierten Verantwortlichen mitgeteilt wird.",
        ],
      },
      {
        title: "6. Kündigung und Beendigung",
        body: ["Nutzer können die Verwendung des Prototyps jederzeit beenden. Die Projektverantwortlichen können den Zugriff auf die Plattform während der Testphase ganz oder teilweise ändern, aussetzen oder beenden, einschließlich aus technischen, sicherheitsbezogenen oder produktbezogenen Gründen."],
      },
      {
        title: "7. Geistiges Eigentum",
        body: [
          "Marken, Logos, Bilder, Texte, Code, Oberflächen und sonstige Materialien auf der Plattform gehören den jeweiligen Rechteinhabern, einschließlich Bonefree und gegebenenfalls den Entwicklungsverantwortlichen.",
          "Nutzer erhalten nur eine begrenzte Erlaubnis zum Zugriff auf und zur Nutzung des Prototyps. Kopieren, kommerzielle Nutzung, Verbreitung oder Änderung von Plattforminhalten ist ohne vorherige Genehmigung nicht erlaubt.",
        ],
      },
      {
        title: "8. Haftungsbeschränkung",
        body: ["Da es sich um einen Prototyp handelt, kann die Plattform Fehler, Unterbrechungen, Nichtverfügbarkeit, Demonstrationsdaten oder unvollständiges Verhalten enthalten. Soweit gesetzlich zulässig, haften die Projektverantwortlichen nicht für Verluste aus der experimentellen Nutzung der Plattform, außer bei Vorsatz oder gesetzlich nicht ausschließbarer Haftung."],
      },
      {
        title: "9. Änderungen dieser Bedingungen",
        body: ["Diese Bedingungen können aktualisiert werden, um Änderungen am Prototyp, rechtliche Anforderungen oder Projektentscheidungen widerzuspiegeln. Maßgeblich ist die auf dieser Seite veröffentlichte Version zum Zeitpunkt der Nutzung."],
      },
      {
        title: "10. Anwendbares Recht und Streitbeilegung",
        body: ["Diese Bedingungen werden nach portugiesischem Recht ausgelegt. Bei Fragen oder Streitigkeiten sollten Nutzer zuerst die Projektverantwortlichen kontaktieren, um eine einvernehmliche Lösung zu suchen, unbeschadet verfügbarer Rechtsmittel."],
      },
      {
        title: "11. Kontakt",
        body: [`Bei Fragen zu diesen Allgemeinen Geschäftsbedingungen oder zum Prototyp kontaktieren Sie die Entwicklungsverantwortlichen unter ${contactEmail}.`],
      },
    ],
  },
}

export default function Terms() {
  const { i18n } = useTranslation()
  const { organization, experience } = useOrganization()
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? "pt-PT"
  const organizationName = experience.profile.display_name || organization.name
  const contact = [experience.profile.email, experience.profile.phone].filter(Boolean).join(" · ") || null
  const page = useMemo(
    () => personalizeTerms(content[locale], organizationName, contact),
    [contact, locale, organizationName],
  )

  return (
    <main className="legal-page site-page">
      <Navbar />
      <section className="legal-hero">
        <span>{page.eyebrow}</span>
        <h1>{page.title}</h1>
        <p>{page.description}</p>
        <small>{page.updated}</small>
      </section>

      <section className="legal-shell" aria-label={page.aria}>
        <aside className="legal-summary">
          <strong>{page.summaryTitle}</strong>
          <p>{page.summaryText}</p>
          <Link to="/privacy">{page.privacyLink}</Link>
        </aside>

        <div className="legal-content">
          {page.sections.map((section) => (
            <section key={section.title} className="legal-card">
              <h2>{section.title}</h2>
              {section.body?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.list && (
                <ul>
                  {section.list.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
