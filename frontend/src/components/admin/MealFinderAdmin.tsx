import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mealFinderService } from '../../services/mealFinderService';
import '../../i18n/mealFinder';
import '../../pages/MealFinder.css';

export default function MealFinderAdmin() {
 const {t} = useTranslation('mealFinder');
 const [enabled,setEnabled] = useState<boolean | null>(null);
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState(false);
 const [saved,setSaved] = useState(false);
 const [retry,setRetry] = useState(0);
 useEffect(() => {
  const controller = new AbortController();
  mealFinderService.settings(controller.signal).then(data => {if(!controller.signal.aborted){setEnabled(data.enabled);setError(false);}}).catch(() => {if(!controller.signal.aborted)setError(true);});
  return () => controller.abort();
 },[retry]);
 async function toggle(value:boolean) {
  if(busy)return;
  setBusy(true);setError(false);setSaved(false);
  try {const result=await mealFinderService.save(value);setEnabled(result.enabled);setSaved(true);}
  catch {setError(true);}
  finally {setBusy(false);}
 }
 return <section className="mf-admin"><h2>{t('admin')}</h2><p>{t('adminHelp')}</p>
  {enabled !== null ? <label><input type="checkbox" role="switch" checked={enabled} disabled={busy} onChange={e => void toggle(e.target.checked)}/>{t('enabled')}</label> : !error && <p role="status">{t('loading')}</p>}
  {error && <div role="alert"><p>{t('adminError')}</p><button type="button" onClick={() => {setError(false);setRetry(n=>n+1);}}>{t('retry')}</button></div>}
  <p role="status">{busy ? t('saving') : saved ? t('saved') : ''}</p>
 </section>;
}
