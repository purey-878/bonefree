"""A text-based, localized pass using the existing ReportLab dependency."""
from html import escape
from io import BytesIO
from pathlib import Path
import reportlab
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, HRFlowable

COPY = {
 'pt-PT': {'confirmed': 'Reserva confirmada', 'cancelled': 'Reserva cancelada', 'completed': 'Reserva concluída', 'no_show': 'Não compareceu', 'name': 'Nome', 'day': 'Data', 'time': 'Hora', 'guests': 'Pessoas', 'reference': 'Referência', 'show': 'Mostre este passe à chegada. A equipa confirma a referência e o estado da reserva.', 'offer': 'Desconto aplicado manualmente no restaurante, apenas na data desta reserva.'},
 'en-GB': {'confirmed': 'Reservation confirmed', 'cancelled': 'Reservation cancelled', 'completed': 'Reservation completed', 'no_show': 'No-show', 'name': 'Name', 'day': 'Date', 'time': 'Time', 'guests': 'Guests', 'reference': 'Reference', 'show': 'Show this pass on arrival. Our team verifies the reference and booking status.', 'offer': 'Discount redeemed manually at the restaurant, only on this reservation date.'},
 'de-DE': {'confirmed': 'Reservierung bestätigt', 'cancelled': 'Reservierung storniert', 'completed': 'Reservierung abgeschlossen', 'no_show': 'Nicht erschienen', 'name': 'Name', 'day': 'Datum', 'time': 'Uhrzeit', 'guests': 'Personen', 'reference': 'Referenz', 'show': 'Zeigen Sie diesen Pass bei der Ankunft. Unser Team prüft Referenz und Reservierungsstatus.', 'offer': 'Der Rabatt wird vor Ort und nur am Reservierungstag eingelöst.'},
}


def render_reservation_pdf(data, locale):
    font = 'BonefreeReservation'
    if font not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font, str(Path(reportlab.__file__).parent / 'fonts' / 'Vera.ttf')))
    text = COPY[locale]
    stream = BytesIO()
    doc = SimpleDocTemplate(stream, pagesize=A4, leftMargin=48, rightMargin=48, topMargin=48, bottomMargin=48, title=f'Bonefree {data["reference"]}', author='Bonefree')
    normal = ParagraphStyle('reservation', fontName=font, fontSize=12, leading=19, textColor=colors.HexColor('#17211d'), spaceAfter=12, splitLongWords=True)
    heading = ParagraphStyle('reservation-heading', parent=normal, fontSize=24, leading=31, textColor=colors.HexColor('#076050'), spaceAfter=22)
    p = lambda value, style=normal: Paragraph(escape(str(value)).replace('\n', '<br/>'), style)
    story = [p('BONEFREE', heading), p(text[data['status']], heading), HRFlowable(width='100%', color=colors.HexColor('#7BAF4B')), Spacer(1, 20)]
    for key, value in [('reference', data['reference']), ('name', data['name']), ('day', data['day'].strftime('%d/%m/%Y') if locale != 'de-DE' else data['day'].strftime('%d.%m.%Y')), ('time', data['time']), ('guests', data['guests'])]:
        story.append(p(f'{text[key]}: {value}'))
    story.extend([Spacer(1, 12), p(data['restaurant_name']), p(data['restaurant_address']), p('Europe/Lisbon')])
    promotion = data['promotion']
    # A cancelled/completed pass never appears to be an active offer.
    if promotion and data['status'] == 'confirmed':
        percent = promotion['percentage'].rstrip('0').rstrip('.') if '.' in promotion['percentage'] else promotion['percentage']
        if locale != 'en-GB':
            percent = percent.replace('.', ',')
        story.extend([Spacer(1, 16), p(f"{percent}% — {promotion['title']}", heading), p(promotion['scope']), p(promotion['description']), p(promotion['conditions']), p(text['offer'])])
    story.extend([Spacer(1, 20), p(text['show'])])
    base = Path(__file__).resolve().parents[2]
    logo = next((path for path in [base/'public/assets/images/bonefree-logo-192.webp', base/'frontend/public/assets/images/bonefree-logo-192.webp'] if path.is_file()), None)
    if logo:
        story.insert(0, Image(str(logo), width=48, height=48, hAlign='LEFT'))
        story.insert(1, Spacer(1, 12))
    doc.build(story)
    return stream.getvalue()
