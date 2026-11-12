import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, ChefHat, Clock3, Flame, Leaf, RotateCcw, Salad, Sandwich, ShieldCheck, Soup, Sparkles, UtensilsCrossed, Wheat } from 'lucide-react';
import Navbar from '../components/Navbar';
import { ProductCard } from '../components/ui/ProductCard';
import { toDomain } from '../api/mappers';
import type { Product } from '../types/product';
import type { Answers, Configuration, Match, RecommendationResult, Text } from '../services/mealFinderService';
import { resolvedLocale } from '../i18n';
import '../i18n/mealFinder';
import { mealFinderService } from '../services/mealFinderService';
import './MealFinder.css';

const optionIcons: Record<string, typeof Leaf> = {starter: Salad, tacos: Sandwich, main: UtensilsCrossed, crispy: Flame, creamy: Soup, smoky: Flame, any: Sparkles, plant_protein: Leaf, legumes: Wheat, vegetables: Salad};

export type QuizState = { version: number; step: number; answers: Partial<Answers>; gluten: boolean };
function localizedText(text: Text, locale: string) { return text[locale === 'de-DE' ? 'de' : locale === 'en-GB' ? 'en' : 'pt']; }

export function FinderExperience({ config, refreshConfig }: {config: Configuration; refreshConfig?: () => void}) {
 const { t } = useTranslation('mealFinder');
 const locale = resolvedLocale();
 const location = useLocation();
 const navigate = useNavigate();
 const questions = config.questions;
 const stored = location.state?.mealFinder as QuizState | undefined;
 const validStored = stored?.version === config.version && Number.isInteger(stored.step) && stored.step >= -1 && stored.step <= questions.length && stored.answers && Object.entries(stored.answers).every(([key,value]) => questions.some(q => q.id === key && q.options.some(o => o.id === value))) && questions.slice(0,Math.max(0,stored.step)).every(q => stored.answers[q.id]);
 const state: QuizState = validStored ? stored : {version: config.version, step: -1, answers: {}, gluten: false};
 const {step, answers, gluten} = state;
 const [loaded, setLoaded] = useState<{key: string; result: RecommendationResult} | null>(null);
 const [failure, setFailure] = useState<{key: string; outdated: boolean} | null>(null);
 const [retry, setRetry] = useState(0);
 const heading = useRef<HTMLHeadingElement>(null);
 const complete = step >= questions.length;
 const requestKey = JSON.stringify([config.version, answers, gluten, locale, retry, location.key]);
 const result = loaded?.key === requestKey ? loaded.result : null;
 const error = failure?.key === requestKey ? failure : null;
 function go(patch: Partial<QuizState>, replace = false) {
   navigate(location.pathname + location.search, { state: {...location.state, mealFinder: {...state, ...patch}}, replace });
 }
 useEffect(() => { if (step >= 0) heading.current?.focus(); }, [step, locale]);
 useEffect(() => {
   if (!complete) return;
   const controller = new AbortController();
   mealFinderService.recommend({version: config.version, answers: answers as Answers, restrictions: gluten ? ['gluten_free'] : [], locale}, controller.signal).then(data => {
     if (!controller.signal.aborted) setLoaded({key: requestKey, result: data});
   }).catch((err: unknown) => {
     if (!controller.signal.aborted) setFailure({key: requestKey, outdated: (err as {status?: number}).status === 409});
   });
   return () => controller.abort();
   // requestKey includes every request input. Aborted generations never commit.
   // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [complete, requestKey]);
 const reset = () => { setLoaded(null); setFailure(null); setRetry(n => n + 1); go({step: -1, answers: {}, gluten: false}); if (error?.outdated) refreshConfig?.(); };
 function card(match: Match, featured = false) {
   return <div className={`mf-match${featured ? ' mf-match-featured' : ''}`} key={match.product.id}>
     <ProductCard product={toDomain<Product>(match.product)} onSelect={() => navigate(`/product/${match.product.id}`)} />
     <div className="mf-match-copy">
       {featured && <><span className="mf-eyebrow"><Sparkles size={15} aria-hidden="true" />{t('pickedForYou')}</span><h3>{t('whyMatch')}</h3></>}
       <ul className="mf-reasons">{match.reasons.map(reason => <li key={reason}><Check size={17} aria-hidden="true" /><span>{t(`reason_${reason}`)}</span></li>)}</ul>
     </div>
     {featured && <Link className="mf-details" to={`/product/${match.product.id}`}>{t('details')}<ArrowRight size={18} aria-hidden="true" /></Link>}
   </div>;
 }
 function choose(questionId: keyof Answers, optionId: string) {
   const selected = {...answers, [questionId]: optionId};
   // Keep the selected answer on the preceding history entry as well.
   go({answers: selected}, true);
   go({answers: selected, step: step + 1});
 }
 const question = questions[step];
 return <div className={`mf-experience${complete ? ' mf-experience-results' : ''}`}>
   {step < 0 ? <div className="mf-welcome">
     <div className="mf-welcome-copy"><span className="mf-eyebrow"><Clock3 size={15} aria-hidden="true" />{t('quickQuiz')}</span><h2>{t('welcomeTitle')}</h2><button className="mf-primary mf-start-button" onClick={() => go({step: 0})}><Sparkles size={23} aria-hidden="true" /><span>{t('start')}</span><ArrowRight size={23} aria-hidden="true" /></button><p>{t('quizIntro')}</p></div>
     <div className="mf-welcome-art" aria-hidden="true"><span className="mf-art-spark">✦</span><div className="mf-art-plate"><UtensilsCrossed /><Leaf /></div><span className="mf-art-sticker">ASK<br />PAULO!</span><span className="mf-art-spark mf-art-spark-small">✦</span></div>
   </div> : <>
     {!complete && question && <section className="mf-question-panel" aria-labelledby="mf-question">
       <div className="mf-progress-heading"><span className="mf-eyebrow">{t('yourTaste')}</span><span role="status">{t('step', {current: step + 1, total: questions.length})}</span></div>
       <progress value={step + 1} max={questions.length} aria-label={t('step', {current: step + 1, total: questions.length})} />
       <ol className="mf-steps" aria-hidden="true">{questions.map((q,index) => <li key={q.id} className={index === step ? 'is-current' : index < step ? 'is-done' : ''}><span>{index < step ? <Check size={13} /> : `0${index + 1}`}</span>{t(`step_${q.id}`)}</li>)}</ol>
       <h2 id="mf-question" tabIndex={-1} ref={heading}>{localizedText(question.label, locale)}</h2><p className="mf-question-hint">{t('chooseOne')}</p>
       <div className="mf-options">{question.options.map(option => {const Icon = optionIcons[option.id] ?? Leaf; return <button key={option.id} aria-pressed={answers[question.id] === option.id} onClick={() => choose(question.id, option.id)}><span className="mf-option-icon"><Icon size={25} aria-hidden="true" /></span><span className="mf-option-label">{localizedText(option.label, locale)}</span><span className="mf-option-arrow" aria-hidden="true">{answers[question.id] === option.id ? <Check size={19} /> : <ArrowRight size={19} />}</span></button>;})}</div>
     </section>}
     {complete && <section className="mf-results" aria-busy={!result && !error}>
       <div className="mf-result-heading"><span className="mf-eyebrow"><Sparkles size={15} aria-hidden="true" />{t('pickedForYou')}</span><h2 tabIndex={-1} ref={heading}>{result ? t('best') : t('loading')}</h2></div>
       <ul className="mf-answer-summary" aria-label={t('yourChoices')}>{questions.map(q => {const option = q.options.find(o => o.id === answers[q.id]); return option ? <li key={q.id}>{localizedText(option.label, locale)}</li> : null;})}{gluten && <li>{t('gluten')}</li>}</ul>
       {error ? <div className="mf-state" role="alert"><ChefHat size={32} aria-hidden="true" /><p>{t(error.outdated ? 'outdated' : 'error')}</p><button className="mf-secondary" onClick={error.outdated ? reset : () => setRetry(n => n + 1)}>{t(error.outdated ? 'restart' : 'retry')}</button></div> : !result ? <div className="mf-loading" role="status"><span className="mf-loading-icon"><UtensilsCrossed size={32} aria-hidden="true" /></span><p>{t('loading')}</p></div> : <>
         {result.closest && <p className="mf-closest"><Sparkles size={18} aria-hidden="true" />{t('closest')}</p>}
         {result.best ? <>
           <div className="mf-best">{card(result.best, true)}</div>
           {!!(result.alternatives ?? []).length && <section className="mf-alternatives"><div className="mf-section-heading"><h3>{t('alternatives')}</h3><Sparkles size={20} aria-hidden="true" /></div><div className="mf-grid">{(result.alternatives ?? []).map(match => card(match))}</div></section>}
         </> : <div className="mf-state"><Salad size={36} aria-hidden="true" /><p>{t('empty')}</p><Link className="mf-secondary" to="/contact">{t('contact')}</Link></div>}
         <p className="mf-safety"><ShieldCheck size={18} aria-hidden="true" /><span>{t('safety')}</span></p>
       </>}
     </section>}
     <div className="mf-actions"><button onClick={() => go({step: Math.max(-1, step - 1)})}><ArrowLeft size={17} aria-hidden="true" />{t('back')}</button><button onClick={reset}><RotateCcw size={16} aria-hidden="true" />{t('restart')}</button></div>
   </>}
   {!complete && <fieldset className="mf-dietary" aria-describedby="mf-dietary-guidance"><legend><ShieldCheck size={18} aria-hidden="true" />{t('dietary')}</legend><div className="mf-dietary-choices">{[true, false].map(value => <label key={String(value)}><input type="radio" name="gluten-free" value={value ? 'yes' : 'no'} checked={gluten === value} onChange={() => go({gluten: value}, true)} /><span>{t(value ? 'glutenYes' : 'glutenNo')}</span></label>)}</div><p id="mf-dietary-guidance">{t('glutenHelp')}</p><p>{t('safety')}</p></fieldset>}
   <div className={`mf-conversion${complete && result?.best ? ' mf-conversion-ready' : ''}`}>
     {complete && result?.best && <div className="mf-conversion-copy"><span className="mf-eyebrow">BoneFree · Costa da Caparica</span><h3>{t('tableTitle')}</h3><p>{t('tableCopy')}</p></div>}
     <div className="mf-conversion-links"><Link className={complete && result?.best ? 'mf-primary' : 'mf-secondary'} to="/reservations">{t('reserve')}<ArrowRight size={17} aria-hidden="true" /></Link><Link className="mf-text-link" to="/menu">{t('menu')}</Link></div>
   </div>
 </div>;
}

export default function MealFinder() {
 const {t} = useTranslation('mealFinder');
 const [config, setConfig] = useState<Configuration | null>(null);
 const [error, setError] = useState(false);
 const [retry, setRetry] = useState(0);
 useEffect(() => {
   const controller = new AbortController();
   mealFinderService.config(controller.signal).then(data => {if (!controller.signal.aborted) {setConfig(data); setError(false);}}).catch(() => {if (!controller.signal.aborted) setError(true);});
   return () => controller.abort();
 }, [retry]);
 return <><Navbar /><main className="meal-finder"><header className="mf-page-header"><span className="mf-brand"><ChefHat size={18} aria-hidden="true" />ASK PAULO<span aria-hidden="true">✦</span></span><h1>{t('title')}</h1><p>{t('intro')}</p></header>{error ? <div className="mf-state" role="alert"><p>{t('error')}</p><button className="mf-secondary" onClick={() => setRetry(n => n + 1)}>{t('retry')}</button></div> : config?.enabled ? <FinderExperience config={config} key={config.version} refreshConfig={() => setRetry(n => n + 1)} /> : <div className="mf-state" role="status"><ChefHat size={32} aria-hidden="true" /><p>{t(config ? 'disabled' : 'loading')}</p></div>}{!config?.enabled && <div className="mf-conversion"><Link className="mf-primary" to="/reservations">{t('reserve')}</Link><Link to="/menu">{t('menu')}</Link></div>}</main></>;
}
