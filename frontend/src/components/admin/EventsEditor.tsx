import { useState } from 'react';
import { CalendarDays, ChevronDown, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import '../../i18n/adminEvents';
import type { EventItemSettings, EventsSettings } from '../../types/siteSettings';
import { createEventDraft, eventEditorStatus, eventImageFallback, eventIssues } from '../../utils/eventEditor';
import { publicEventDate } from '../../utils/publicEvents';
import { resolvedLocale } from '../../i18n';
import { applyApiImageFallback, resolveProductImageUrl } from '../../utils/imageFallback';
import ConfirmDialog from '../ui/ConfirmDialog';
import './EventsEditor.css';
import { uploadEventImage } from '../../services/siteSettingsService';

export default function EventsEditor({ value, onChange, onSave, saving, loading }: {
  value: EventsSettings; onChange: (value: EventsSettings) => void; onSave: () => void; saving: boolean; loading: boolean;
}) {
  const { t } = useTranslation('adminEvents');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<{ id: string; message: string } | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const update = (id: string, changes: Partial<EventItemSettings>) => onChange({ events: value.events.map(event => event.id === id ? { ...event, ...changes } : event) });
  const add = (source?: EventItemSettings) => {
    const event = createEventDraft();
    const next = source ? { ...source, id: event.id, enabled: false } : event;
    onChange({ events: [next, ...value.events] });
    setExpandedId(next.id);
    window.requestAnimationFrame(() => document.getElementById(`event-title-${next.id}`)?.focus());
  };
  return <form id="admin-events-form" className="ae-editor" noValidate onSubmit={event => {
    event.preventDefault();
    if (uploadingId) return;
    const invalid = value.events.find(item => eventIssues(item).length > 0);
    if (invalid) {
      setExpandedId(invalid.id);
      window.requestAnimationFrame(() => document.getElementById(`event-title-${invalid.id}`)?.focus());
      return;
    }
    onSave();
  }}>
    <div className="ae-heading"><div><h3>{t('title')}</h3><p>{t('help')}</p></div><button type="button" className="ad-btn ad-btn-primary" disabled={saving || loading || uploadingId !== null} onClick={() => add()}><Plus size={18} />{t('add')}</button></div>
    <div className="ae-toolbar"><span>{t('total', { count: value.events.length })}</span><Link to="/events" target="_blank" rel="noreferrer">{t('publicLink')}<ExternalLink size={15} /></Link></div>
    <fieldset disabled={saving || loading || uploadingId !== null}>
      {!value.events.length && <div className="ae-empty"><CalendarDays size={34} aria-hidden="true" /><h4>{t('emptyTitle')}</h4><p>{t('emptyText')}</p><button type="button" className="ad-btn ad-btn-primary" onClick={() => add()}>{t('add')}</button></div>}
      {value.events.map(event => {
        const status = eventEditorStatus(event);
        const issues = eventIssues(event);
        const validDate = !eventIssues({ ...event, enabled: true }).includes('date');
        return <details className="ae-event" key={event.id} open={expandedId === event.id} onInvalidCapture={() => setExpandedId(event.id)}>
          <summary onClick={click => { click.preventDefault(); setExpandedId(current => current === event.id ? null : event.id); }}>
            <img src={resolveProductImageUrl(event.imageUrl, eventImageFallback)} alt="" onError={e => applyApiImageFallback(e.currentTarget, eventImageFallback)} />
            <div className="ae-summary-copy"><strong>{event.title || t('untitled')}</strong><span>{validDate && event.date ? publicEventDate(event.date, resolvedLocale()).full : t('date')} · {event.startTime}–{event.endTime}</span></div>
            <span className={`ae-status ae-status-${status}`}>{t(status)}</span><ChevronDown size={18} aria-hidden="true" />
          </summary>
          <div className="ae-event-body">
            <div className="ae-fields">
              <label htmlFor={`event-title-${event.id}`}>{t('eventTitle')}<input id={`event-title-${event.id}`} required={event.enabled} maxLength={100} value={event.title} onChange={e => update(event.id, { title: e.target.value })} /></label>
              <label htmlFor={`event-kicker-${event.id}`}>{t('kicker')}<input id={`event-kicker-${event.id}`} maxLength={80} value={event.kicker} onChange={e => update(event.id, { kicker: e.target.value })} /></label>
              <label className="ae-wide" htmlFor={`event-description-${event.id}`}>{t('description')}<textarea id={`event-description-${event.id}`} rows={3} maxLength={400} value={event.description} onChange={e => update(event.id, { description: e.target.value })} /><small>{event.description.length}/400</small></label>
              <div className="ae-dates ae-wide">
                <label htmlFor={`event-date-${event.id}`}>{t('date')}<input id={`event-date-${event.id}`} type="date" required={event.enabled} value={event.date} onChange={e => update(event.id, { date: e.target.value })} /></label>
                <label htmlFor={`event-start-${event.id}`}>{t('start')}<input id={`event-start-${event.id}`} type="time" required={event.enabled} value={event.startTime} onChange={e => update(event.id, { startTime: e.target.value })} /></label>
                <label htmlFor={`event-end-${event.id}`}>{t('end')}<input id={`event-end-${event.id}`} type="time" required={event.enabled} value={event.endTime} onChange={e => update(event.id, { endTime: e.target.value })} /></label>
              </div>
              <p className="ae-hint ae-wide">{t('timezone')}</p>
              <label className="ae-upload ae-wide" htmlFor={`event-upload-${event.id}`}>{t('uploadImage')}<input id={`event-upload-${event.id}`} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={e => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (!file) return;
                setUploadError(null);
                if (file.size > 8 * 1024 * 1024) { setUploadError({ id: event.id, message: t('imageTooLarge') }); return; }
                setUploadingId(event.id);
                void uploadEventImage(file).then(result => update(event.id, { imageUrl: result.imageUrl })).catch(() => setUploadError({ id: event.id, message: t('uploadFailed') })).finally(() => setUploadingId(null));
              }} /><small>{t('uploadHelp')}</small></label>
              {uploadingId === event.id && <p className="ae-wide ae-hint" role="status">{t('uploading')}</p>}
              {uploadError?.id === event.id && <p className="ae-wide ae-upload-error" role="alert">{uploadError.message}</p>}
              <label className="ae-wide" htmlFor={`event-image-${event.id}`}>{t('imageUrl')}<input id={`event-image-${event.id}`} maxLength={300} value={event.imageUrl} placeholder="https://…" onChange={e => update(event.id, { imageUrl: e.target.value })} /><small>{t('imageHelp')}</small></label>
              <label htmlFor={`event-instagram-${event.id}`}>Instagram {t('optional')}<input id={`event-instagram-${event.id}`} type="url" maxLength={2048} value={event.instagramUrl ?? ''} placeholder="https://www.instagram.com/…" onChange={e => update(event.id, { instagramUrl: e.target.value })} /></label>
              <label htmlFor={`event-website-${event.id}`}>Website {t('optional')}<input id={`event-website-${event.id}`} type="url" maxLength={2048} value={event.websiteUrl ?? ''} placeholder="https://…" onChange={e => update(event.id, { websiteUrl: e.target.value })} /></label>
              <p className="ae-hint ae-wide">{t('linksHelp')}</p>
            </div>
            <figure className="ae-preview"><img src={resolveProductImageUrl(event.imageUrl, eventImageFallback)} alt={t('preview')} onError={e => applyApiImageFallback(e.currentTarget, eventImageFallback)} /><figcaption>{t('preview')}</figcaption></figure>
            <div className="ae-event-footer"><label className="ae-visibility"><input type="checkbox" checked={event.enabled} onChange={e => update(event.id, { enabled: e.target.checked })} /><span>{t('enabled')}<small>{t('enabledHelp')}</small></span></label><div className="ae-row-actions"><button type="button" className="ad-btn ad-btn-ghost" onClick={() => add(event)}><Copy size={16} />{t('duplicate')}</button><button type="button" className="ad-btn ae-remove" onClick={() => setRemoveId(event.id)}><Trash2 size={16} />{t('remove')}</button></div></div>
            {issues.length > 0 && <ul className="ae-issues" aria-live="polite">{issues.map(issue => <li key={issue}>{t(`validation.${issue}`)}</li>)}</ul>}
          </div>
        </details>;
      })}
    </fieldset>
    <div className="ae-publish"><p>{t('publishHelp')}</p><button type="submit" className="ad-btn ad-btn-primary" disabled={saving || loading || uploadingId !== null}>{t(saving ? 'saving' : 'publish')}</button></div>
    <ConfirmDialog open={removeId !== null} title={t('removeTitle')} description={t('removeText')} confirmText={t('remove')} cancelText={t('cancel')} danger onCancel={() => setRemoveId(null)} onConfirm={() => { onChange({ events: value.events.filter(event => event.id !== removeId) }); setRemoveId(null); }} />
  </form>;
}
