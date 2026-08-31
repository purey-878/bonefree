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

type PrivacyContent = {
  eyebrow: string
  title: string
  description: string
  updated: string
  aria: string
  summaryTitle: string
  summaryText: string
  termsLink: string
  sections: LegalSection[]
}

function personalizePrivacy(page: PrivacyContent, organizationName: string, contact: string | null): PrivacyContent {
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

const content: Record<string, PrivacyContent> = {
  "pt-PT": {
    eyebrow: "Protótipo Bonefree",
    title: "Política de Privacidade",
    description: "Como os dados pessoais são recolhidos, usados e protegidos durante a utilização deste protótipo.",
    updated: "Última atualização: 29/08/2026",
    aria: "Política de Privacidade",
    summaryTitle: "Contexto do protótipo",
    summaryText: "Os dados tratados neste website servem para testar e validar funcionalidades digitais. Este não é um canal oficial de pedidos ou atendimento do Bonefree.",
    termsLink: "Ver Termos e Condições",
    sections: [
      {
        title: "1. Quem é responsável pelo tratamento",
        body: [
          "Esta Política de Privacidade descreve como os dados pessoais são tratados no contexto deste protótipo Bonefree. O tratamento é realizado pelos responsáveis pelo projeto de desenvolvimento do protótipo, em articulação com o Bonefree para fins de demonstração, teste e validação.",
          "Este website não é o website oficial do Bonefree nem um canal oficial de atendimento, contratação, reserva ou compra.",
        ],
      },
      {
        title: "2. Contactos",
        body: [
          `Para questões sobre privacidade, proteção de dados ou exercício de direitos, contacte os responsáveis pelo desenvolvimento através do email ${contactEmail}.`,
          "Não existe Encarregado de Proteção de Dados designado especificamente para este protótipo, salvo indicação posterior em contrário.",
        ],
      },
      {
        title: "3. Dados pessoais recolhidos",
        list: [
          "Dados de conta: nome, apelido, email, telefone opcional, palavra-passe cifrada e NIF opcional.",
          "Dados de sessão e segurança: token de sessão, data de criação, expiração, último acesso, endereço IP e user-agent associados à sessão.",
          "Dados de pedidos de teste: nome, contactos, itens escolhidos, personalizações, notas, método de entrega, mesa, valores, estados de pedido, cupões e recibos quando aplicável.",
          "Dados de carrinho, preferências e consentimento de cookies guardados no navegador através de localStorage ou sessionStorage.",
          "Dados de avaliações, recuperação de palavra-passe, interações administrativas e registos técnicos necessários à segurança e validação do protótipo.",
        ],
      },
      {
        title: "4. Finalidades do tratamento",
        list: [
          "Criar e gerir contas de utilizador, autenticação e sessões.",
          "Permitir a navegação, carrinho, simulação de pedidos, histórico, recibos, cupões e funcionalidades de fidelização em teste.",
          "Garantir segurança, prevenção de abuso, limitação de pedidos, deteção de erros e proteção contra acessos indevidos.",
          "Responder a pedidos de apoio, validar funcionalidades com o Bonefree e melhorar a experiência do protótipo.",
          "Cumprir obrigações legais ou fiscais quando sejam aplicáveis a dados de recibo ou faturação fornecidos pelo utilizador.",
        ],
      },
      {
        title: "5. Base legal",
        list: [
          "Execução de contrato ou diligências pré-contratuais quando o utilizador cria conta, inicia sessão ou utiliza funcionalidades de pedido.",
          "Interesse legítimo na segurança, prevenção de fraude, testes técnicos, melhoria da plataforma e validação do protótipo.",
          "Consentimento para cookies ou preferências opcionais e para dados opcionais fornecidos voluntariamente pelo utilizador.",
          "Obrigação legal quando seja necessário conservar informação fiscal, recibos ou dados exigidos por autoridade competente.",
        ],
      },
      {
        title: "6. Prazo de conservação",
        body: [
          "Os dados de conta são conservados enquanto a conta existir ou até pedido de eliminação aplicável. Dados de sessão são conservados até expiração, revogação ou limpeza técnica. Tokens de recuperação de palavra-passe expiram em curto prazo e são substituídos quando usados novamente.",
          "Dados de pedidos, recibos, cupões e histórico são mantidos pelo período necessário para testes, suporte, validação técnica ou cumprimento de obrigações legais. Dados em localStorage ou sessionStorage permanecem no navegador até serem removidos pela aplicação, expirarem ou serem apagados pelo utilizador.",
        ],
      },
      {
        title: "7. Partilha de dados",
        body: [
          "Os dados podem ser acedidos por responsáveis pelo projeto de desenvolvimento, representantes autorizados do Bonefree para validação do protótipo e fornecedores técnicos que prestem serviços de infraestrutura, alojamento, email, armazenamento, monitorização ou suporte.",
          "Quando exigido por lei, os dados podem ser partilhados com autoridades públicas, entidades fiscais, tribunais ou consultores legais e contabilísticos.",
        ],
      },
      {
        title: "8. Transferências fora da União Europeia",
        body: ["Alguns fornecedores técnicos podem tratar dados fora da União Europeia ou do Espaço Económico Europeu. Quando aplicável, devem ser utilizados mecanismos de proteção adequados, como cláusulas contratuais-tipo, decisões de adequação ou outras garantias previstas no RGPD."],
      },
      {
        title: "9. Direitos do utilizador",
        body: [
          "Nos termos aplicáveis, o utilizador pode pedir acesso, retificação, apagamento, limitação do tratamento, oposição ao tratamento e portabilidade dos dados quando aplicável. Também pode retirar consentimentos dados anteriormente, sem afetar a licitude do tratamento feito antes da retirada.",
          "Para exercer estes direitos, envie um pedido através dos contactos indicados nesta política, identificando a conta ou o contexto do pedido para que seja possível responder com segurança.",
        ],
      },
      {
        title: "10. Reclamação junto da autoridade de controlo",
        body: ["O utilizador tem o direito de apresentar reclamação junto da Comissão Nacional de Proteção de Dados (CNPD), autoridade de controlo portuguesa, sem prejuízo de contactar primeiro os responsáveis pelo projeto para tentativa de resolução direta."],
      },
      {
        title: "11. Decisões automatizadas e profiling",
        body: ["O protótipo não toma decisões automatizadas com efeitos legais ou significativamente relevantes sobre os utilizadores. Estados de pedido, cupões, fidelização, validações de formulário e controlos de segurança podem funcionar automaticamente, mas destinam-se apenas à operação e teste da plataforma."],
      },
      {
        title: "12. Alterações a esta política",
        body: ["Esta política pode ser atualizada para refletir alterações técnicas, legais ou operacionais do protótipo. A versão publicada nesta página é a versão aplicável no momento da utilização."],
      },
    ],
  },
  "en-GB": {
    eyebrow: "Bonefree prototype",
    title: "Privacy Policy",
    description: "How personal data is collected, used and protected while using this prototype.",
    updated: "Last updated: 29/08/2026",
    aria: "Privacy Policy",
    summaryTitle: "Prototype context",
    summaryText: "The data processed on this website is used to test and validate digital features. This is not an official Bonefree order or support channel.",
    termsLink: "View Terms and Conditions",
    sections: [
      {
        title: "1. Who is responsible for processing",
        body: [
          "This Privacy Policy explains how personal data is processed in the context of this Bonefree prototype. Processing is carried out by the people responsible for the prototype development project, in coordination with Bonefree for demonstration, testing and validation purposes.",
          "This website is not Bonefree's official website and it is not an official channel for support, contracting, reservations or purchases.",
        ],
      },
      {
        title: "2. Contacts",
        body: [
          `For privacy, data protection or rights requests, contact the people responsible for development at ${contactEmail}.`,
          "No Data Protection Officer has been specifically appointed for this prototype unless later stated otherwise.",
        ],
      },
      {
        title: "3. Personal data collected",
        list: [
          "Account data: first name, last name, email, optional phone number, encrypted password and optional tax number.",
          "Session and security data: session token, creation date, expiry, last access, IP address and user-agent associated with the session.",
          "Test order data: name, contact details, selected items, customisations, notes, fulfilment method, table, amounts, order statuses, vouchers and receipts where applicable.",
          "Basket, preference and cookie consent data stored in the browser through localStorage or sessionStorage.",
          "Review data, password reset data, administrative interactions and technical records needed for security and prototype validation.",
        ],
      },
      {
        title: "4. Purposes of processing",
        list: [
          "Create and manage user accounts, authentication and sessions.",
          "Enable browsing, basket, simulated orders, history, receipts, vouchers and loyalty features under test.",
          "Ensure security, abuse prevention, rate limiting, error detection and protection against unauthorised access.",
          "Respond to support requests, validate features with Bonefree and improve the prototype experience.",
          "Comply with legal or fiscal obligations where they apply to receipt or invoicing data provided by the user.",
        ],
      },
      {
        title: "5. Legal basis",
        list: [
          "Performance of a contract or pre-contractual steps when the user creates an account, signs in or uses order features.",
          "Legitimate interest in security, fraud prevention, technical testing, platform improvement and prototype validation.",
          "Consent for optional cookies or preferences and optional data voluntarily provided by the user.",
          "Legal obligation when fiscal information, receipts or data required by a competent authority must be retained.",
        ],
      },
      {
        title: "6. Retention period",
        body: [
          "Account data is kept while the account exists or until an applicable deletion request. Session data is kept until expiry, revocation or technical cleanup. Password reset tokens expire quickly and are replaced when used again.",
          "Order, receipt, voucher and history data is kept for the period needed for testing, support, technical validation or legal obligations. Data in localStorage or sessionStorage remains in the browser until removed by the app, expired or deleted by the user.",
        ],
      },
      {
        title: "7. Data sharing",
        body: [
          "Data may be accessed by the development project operators, authorised Bonefree representatives for prototype validation and technical providers for infrastructure, hosting, email, storage, monitoring or support.",
          "When required by law, data may be shared with public authorities, tax bodies, courts, legal advisers or accounting advisers.",
        ],
      },
      {
        title: "8. Transfers outside the European Union",
        body: ["Some technical providers may process data outside the European Union or European Economic Area. Where applicable, appropriate safeguards should be used, such as standard contractual clauses, adequacy decisions or other GDPR safeguards."],
      },
      {
        title: "9. User rights",
        body: [
          "Where applicable, users may request access, rectification, erasure, restriction of processing, objection to processing and data portability. Users may also withdraw previous consent without affecting the lawfulness of processing carried out before withdrawal.",
          "To exercise these rights, send a request through the contacts listed in this policy, identifying the account or request context so it can be answered securely.",
        ],
      },
      {
        title: "10. Complaint to the supervisory authority",
        body: ["Users have the right to lodge a complaint with the Portuguese Data Protection Authority (CNPD), without prejudice to first contacting the project operators to seek a direct resolution."],
      },
      {
        title: "11. Automated decisions and profiling",
        body: ["The prototype does not make automated decisions with legal or similarly significant effects on users. Order statuses, vouchers, loyalty features, form validations and security controls may operate automatically, but they are only for platform operation and testing."],
      },
      {
        title: "12. Changes to this policy",
        body: ["This policy may be updated to reflect technical, legal or operational changes to the prototype. The version published on this page is the version that applies at the time of use."],
      },
    ],
  },
  "de-DE": {
    eyebrow: "Bonefree-Prototyp",
    title: "Datenschutzerklärung",
    description: "Wie personenbezogene Daten bei der Nutzung dieses Prototyps erhoben, verwendet und geschützt werden.",
    updated: "Zuletzt aktualisiert: 29.08.2026",
    aria: "Datenschutzerklärung",
    summaryTitle: "Kontext des Prototyps",
    summaryText: "Die auf dieser Website verarbeiteten Daten dienen dem Testen und Validieren digitaler Funktionen. Dies ist kein offizieller Bestell- oder Supportkanal von Bonefree.",
    termsLink: "Allgemeine Geschäftsbedingungen ansehen",
    sections: [
      {
        title: "1. Verantwortliche für die Verarbeitung",
        body: [
          "Diese Datenschutzerklärung erläutert, wie personenbezogene Daten im Rahmen dieses Bonefree-Prototyps verarbeitet werden. Die Verarbeitung erfolgt durch die Verantwortlichen des Entwicklungsprojekts in Abstimmung mit Bonefree zu Demonstrations-, Test- und Validierungszwecken.",
          "Diese Website ist nicht die offizielle Website von Bonefree und kein offizieller Kanal für Support, Verträge, Reservierungen oder Käufe.",
        ],
      },
      {
        title: "2. Kontakte",
        body: [
          `Bei Fragen zu Datenschutz, Datenverarbeitung oder Betroffenenrechten kontaktieren Sie die Entwicklungsverantwortlichen unter ${contactEmail}.`,
          "Für diesen Prototyp wurde kein Datenschutzbeauftragter ausdrücklich benannt, sofern später nichts anderes mitgeteilt wird.",
        ],
      },
      {
        title: "3. Erhobene personenbezogene Daten",
        list: [
          "Kontodaten: Vorname, Nachname, E-Mail-Adresse, optionale Telefonnummer, verschlüsseltes Passwort und optionale Steuernummer.",
          "Sitzungs- und Sicherheitsdaten: Sitzungstoken, Erstellungsdatum, Ablaufdatum, letzter Zugriff, IP-Adresse und mit der Sitzung verknüpfter User-Agent.",
          "Testbestelldaten: Name, Kontaktdaten, ausgewählte Artikel, Anpassungen, Notizen, Übergabeart, Tisch, Beträge, Bestellstatus, Gutscheine und gegebenenfalls Belege.",
          "Warenkorb-, Präferenz- und Cookie-Einwilligungsdaten, die im Browser über localStorage oder sessionStorage gespeichert werden.",
          "Bewertungsdaten, Daten zur Passwortzurücksetzung, administrative Interaktionen und technische Aufzeichnungen, die für Sicherheit und Validierung des Prototyps erforderlich sind.",
        ],
      },
      {
        title: "4. Zwecke der Verarbeitung",
        list: [
          "Erstellung und Verwaltung von Benutzerkonten, Authentifizierung und Sitzungen.",
          "Ermöglichung von Navigation, Warenkorb, simulierten Bestellungen, Verlauf, Belegen, Gutscheinen und Treuefunktionen im Testbetrieb.",
          "Gewährleistung von Sicherheit, Missbrauchsprävention, Ratenbegrenzung, Fehlererkennung und Schutz vor unbefugtem Zugriff.",
          "Beantwortung von Supportanfragen, Validierung von Funktionen mit Bonefree und Verbesserung der Prototyp-Erfahrung.",
          "Erfüllung rechtlicher oder steuerlicher Pflichten, soweit sie für vom Nutzer bereitgestellte Beleg- oder Rechnungsdaten gelten.",
        ],
      },
      {
        title: "5. Rechtsgrundlage",
        list: [
          "Vertragserfüllung oder vorvertragliche Maßnahmen, wenn Nutzer ein Konto erstellen, sich anmelden oder Bestellfunktionen nutzen.",
          "Berechtigtes Interesse an Sicherheit, Betrugsprävention, technischen Tests, Verbesserung der Plattform und Validierung des Prototyps.",
          "Einwilligung für optionale Cookies oder Präferenzen und freiwillig bereitgestellte optionale Daten.",
          "Rechtliche Verpflichtung, wenn steuerliche Informationen, Belege oder von zuständigen Behörden verlangte Daten aufbewahrt werden müssen.",
        ],
      },
      {
        title: "6. Aufbewahrungsdauer",
        body: [
          "Kontodaten werden aufbewahrt, solange das Konto besteht oder bis ein anwendbarer Löschantrag gestellt wird. Sitzungsdaten werden bis zum Ablauf, Widerruf oder zur technischen Bereinigung gespeichert. Tokens zur Passwortzurücksetzung laufen kurzfristig ab und werden bei erneuter Nutzung ersetzt.",
          "Bestell-, Beleg-, Gutschein- und Verlaufsdaten werden so lange gespeichert, wie es für Tests, Support, technische Validierung oder rechtliche Pflichten erforderlich ist. Daten in localStorage oder sessionStorage bleiben im Browser, bis sie von der Anwendung entfernt werden, ablaufen oder vom Nutzer gelöscht werden.",
        ],
      },
      {
        title: "7. Weitergabe von Daten",
        body: [
          "Daten können von den Verantwortlichen des Entwicklungsprojekts, autorisierten Vertretern von Bonefree zur Validierung des Prototyps und technischen Dienstleistern für Infrastruktur, Hosting, E-Mail, Speicherung, Monitoring oder Support eingesehen werden.",
          "Wenn gesetzlich erforderlich, können Daten an Behörden, Steuerstellen, Gerichte, Rechtsberater oder Buchhaltungsberater weitergegeben werden.",
        ],
      },
      {
        title: "8. Übermittlungen außerhalb der Europäischen Union",
        body: ["Einige technische Dienstleister können Daten außerhalb der Europäischen Union oder des Europäischen Wirtschaftsraums verarbeiten. Soweit anwendbar, sollten geeignete Schutzmaßnahmen eingesetzt werden, etwa Standardvertragsklauseln, Angemessenheitsbeschlüsse oder andere Garantien nach der DSGVO."],
      },
      {
        title: "9. Rechte der Nutzer",
        body: [
          "Soweit anwendbar, können Nutzer Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch gegen die Verarbeitung und Datenübertragbarkeit verlangen. Nutzer können erteilte Einwilligungen auch widerrufen, ohne die Rechtmäßigkeit der vorherigen Verarbeitung zu berühren.",
          "Zur Ausübung dieser Rechte senden Sie eine Anfrage über die in dieser Erklärung angegebenen Kontakte und nennen Sie das Konto oder den Anfragekontext, damit sicher geantwortet werden kann.",
        ],
      },
      {
        title: "10. Beschwerde bei der Aufsichtsbehörde",
        body: ["Nutzer haben das Recht, Beschwerde bei der portugiesischen Datenschutzaufsicht CNPD einzulegen, unbeschadet der Möglichkeit, zuerst die Projektverantwortlichen für eine direkte Lösung zu kontaktieren."],
      },
      {
        title: "11. Automatisierte Entscheidungen und Profiling",
        body: ["Der Prototyp trifft keine automatisierten Entscheidungen mit rechtlicher oder ähnlich erheblicher Wirkung für Nutzer. Bestellstatus, Gutscheine, Treuefunktionen, Formularvalidierungen und Sicherheitskontrollen können automatisch funktionieren, dienen jedoch nur dem Betrieb und Test der Plattform."],
      },
      {
        title: "12. Änderungen dieser Erklärung",
        body: ["Diese Erklärung kann aktualisiert werden, um technische, rechtliche oder betriebliche Änderungen des Prototyps widerzuspiegeln. Maßgeblich ist die auf dieser Seite veröffentlichte Version zum Zeitpunkt der Nutzung."],
      },
    ],
  },
}

export default function Privacy() {
  const { i18n } = useTranslation()
  const { organization, experience } = useOrganization()
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? "pt-PT"
  const organizationName = experience.profile.display_name || organization.name
  const contact = experience.profile.privacy_contact_email || experience.profile.email || null
  const page = useMemo(
    () => personalizePrivacy(content[locale], organizationName, contact),
    [contact, locale, organizationName],
  )

  return (
    <main className="legal-page site-page">
      <Navbar />
      <section className="legal-hero legal-hero-privacy">
        <span>{page.eyebrow}</span>
        <h1>{page.title}</h1>
        <p>{page.description}</p>
        <small>{page.updated}</small>
      </section>

      <section className="legal-shell" aria-label={page.aria}>
        <aside className="legal-summary">
          <strong>{page.summaryTitle}</strong>
          <p>{page.summaryText}</p>
          <Link to="/terms">{page.termsLink}</Link>
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
