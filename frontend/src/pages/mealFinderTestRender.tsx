import {renderToString} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {ThemeProvider} from 'styled-components';
import {theme} from '../styles/theme';
import i18n,{i18nReady} from '../i18n';
import MealFinder,{FinderExperience} from './MealFinder';
import MealFinderAdmin from '../components/admin/MealFinderAdmin';
import type {Configuration} from '../services/mealFinderService';
export async function render(locale:string,step:number){
 await i18nReady;await i18n.changeLanguage(locale);
 const label={pt:'Escolha',en:'Choice',de:'Auswahl'};
 const config:Configuration={version:2,enabled:true,questions:[
  {id:'course',label,options:[{id:'main',label},{id:'tacos',label},{id:'starter',label}]},
  {id:'style',label:{pt:'Estilo',en:'What style sounds good?',de:'Stil'},options:[{id:'crispy',label},{id:'creamy',label},{id:'smoky',label},{id:'any',label}]},
  {id:'ingredient',label,options:[{id:'legumes',label},{id:'plant_protein',label},{id:'vegetables',label},{id:'any',label}]},
 ]};
 const state=step===-3?{version:2,step:2,answers:{group:'two'},gluten:false}:{version:2,step,answers:{course:'main',style:'creamy'},gluten:false};
 return renderToString(<ThemeProvider theme={theme}><MemoryRouter initialEntries={[{pathname:'/meal-finder',state:{mealFinder:state}}]}>{step===-2?<MealFinder/>:step===-4?<MealFinderAdmin/>:<FinderExperience config={config}/>}</MemoryRouter></ThemeProvider>);
}
