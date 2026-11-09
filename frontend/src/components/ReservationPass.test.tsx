import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import i18n, { i18nReady } from '../i18n';
import ReservationPass from './ReservationPass';
import ReservationAdmin from './admin/ReservationAdmin';
import type { PassResponse } from '../services/reservationService';
const pass: PassResponse = { reference: 'BF-123456ABCDEF', name: 'João Müller', day: '2027-05-20', time: '19:00', guests: 3, restaurant_name: 'Bonefree', restaurant_address: 'Costa da Caparica', contact_provided: false, can_cancel: true, status: 'confirmed' };
const render = (data: PassResponse) => renderToStaticMarkup(<MemoryRouter><ReservationPass pass={data} token={'a'.repeat(64)} onUpdate={() => {}} /></MemoryRouter>);
beforeAll(async () => { await i18nReady; await i18n.changeLanguage('en-GB'); });
describe('private reservation pass', () => {
  it('shows the full saved booking, screenshot instructions and real PDF/link actions', () => {
    const html = render(pass);
    for (const value of ['Reservation confirmed','BF-123456ABCDEF','João Müller','19:00','Costa da Caparica','Download PDF','Copy private link','Take a screenshot of this pass']) expect(html).toContain(value);
    expect(html).not.toContain('reservation-offer');
    expect(html).not.toContain('a'.repeat(64));
    expect(html).not.toContain('Our team checks the reference');
    expect(html.indexOf('Take a screenshot of this pass')).toBeLessThan(html.indexOf('<article'));
    expect(html.indexOf('</article>')).toBeLessThan(html.indexOf('reservation-cancel-open'));
    expect(html.indexOf('reservation-cancel-open')).toBeLessThan(html.indexOf('Download PDF'));
    const ticket = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
    expect(ticket).toContain('BF-123456ABCDEF');
    expect(ticket).not.toContain('Costa da Caparica');
    expect(ticket).not.toContain('reservation-ticket-restaurant');
    expect(ticket).toContain('reservation-ticket-stub');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });
  it('shows the awarded promotion only for an active confirmed booking', () => {
    const promotion = { id: 1, title: 'Online offer', percentage: '30.00', scope: 'À la carte', description: 'A saved offer', conditions: 'Reservation date only' };
    expect(render({ ...pass, promotion })).toContain('30%');
    const cancelled = render({ ...pass, promotion, status: 'cancelled', can_cancel: false });
    expect(cancelled).toContain('Reservation cancelled');
    expect(cancelled).not.toContain('Reservation confirmed');
    expect(cancelled).not.toContain('Take a screenshot of this pass');
    expect(cancelled).not.toContain('30%');
    expect(cancelled).toContain('not an active reservation');
  });
  it('keeps long names, reference and complete promotion conditions inside the capturable pass', () => {
    const name = 'Ana Maria de Albuquerque e Vasconcelos da Silva e Costa'.repeat(2);
    const conditions = 'Only on the reservation date. '.repeat(20);
    const html = render({ ...pass, name, promotion: { id: 1, title: 'Lunch offer', scope: 'Menu', percentage: '30.00', description: 'Weekday lunch', conditions } });
    const ticket = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
    for (const value of [name, pass.reference, pass.time, '30%', 'Weekday lunch', conditions]) expect(ticket).toContain(value);
    expect(ticket).not.toContain(pass.restaurant_address);
    expect(html).not.toContain('Screenshot this confirmation');
  });
  it('shows cancellation only when the server permits it and hides it on cancelled passes', () => {
    expect(render(pass)).toContain('Cancel reservation');
    const past = render({ ...pass, can_cancel: false });
    expect(past).not.toContain('reservation-cancel-open');
    expect(past).toContain('no longer be cancelled online');
    const cancelled = render({ ...pass, status: 'cancelled', can_cancel: false });
    expect(cancelled).not.toContain('reservation-cancel-open');
    expect(cancelled).not.toContain('reservation-cancel-confirm');
  });
  it('escapes names and promotion content rather than executing markup', () => {
    const html = render({ ...pass, name: '<script>alert(1)</script>' });
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
  });
  it('translates the pass and management interface in all supported locales', async () => {
    for (const [locale,title,download,instruction,copy] of [['pt-PT','Reserva confirmada!','Descarregar PDF','Tira uma captura deste passe e apresenta-o à chegada.','Copiar link privado'], ['en-GB','Reservation confirmed!','Download PDF','Take a screenshot of this pass','Copy private link'], ['de-DE','Reservierung bestätigt!','PDF herunterladen','Machen Sie einen Screenshot dieses Passes','Privaten Link kopieren']]) {
      await i18n.changeLanguage(locale);
      const html = render(pass); expect(html).toContain(title); expect(html).toContain(download); expect(html).toContain(instruction); expect(html).toContain(copy);
      const admin = renderToStaticMarkup(<ReservationAdmin owner />); expect(admin).toContain('role="tablist"'); expect(admin).not.toContain('idempotency');
    }
    await i18n.changeLanguage('en-GB');
  });
  it('keeps availability and promotion configuration owner-only', () => {
    const owner = renderToStaticMarkup(<ReservationAdmin owner />);
    const manager = renderToStaticMarkup(<ReservationAdmin owner={false} />);
    expect(owner).toContain('Settings'); expect(manager).not.toContain('Settings');
  });
});
