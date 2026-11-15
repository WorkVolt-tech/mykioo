import React,{useState} from 'react';
import packs from './CountryPacks.json';
import './CountryPackPicker.css';

export function countryPackNotes(selected,notes){
 const names=packs.filter(pack=>selected.includes(pack.name)).map(pack=>pack.name);
 const selection=names.length===packs.length?'Countries / Pays — All countries and packs / Tous les pays et bouquets':names.length?'Countries / Pays — '+names.join(', '):'';
 return [selection,notes.trim()].filter(Boolean).join('\n\n');
}

export default function CountryPackPicker({selected,onChange,language='en',disabled=false}){
 const [query,setQuery]=useState('');
 const fr=language==='fr';
 const tr=(en,french)=>fr?french:en;
 const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const matching=packs.filter(pack=>normalize([pack.name,pack.fr,...pack.bouquets.map(b=>b.name)].join(' ')).includes(normalize(query.trim())))
  .sort((a,b)=>(fr?a.fr:a.name).localeCompare(fr?b.fr:b.name,language));
 function toggle(name){
  onChange(selected.includes(name)?selected.filter(value=>value!==name):[...selected,name]);
 }
 return <fieldset className="mykioo-country-picker" disabled={disabled}>
  <legend>{tr('Live TV countries & packs','Pays et bouquets de télévision en direct')}</legend>
  <p>{tr('Choose your preferred countries or regional packs. MYKIOO will apply your choices when preparing your paid service. This selection is optional.','Choisissez vos pays ou bouquets régionaux préférés. MYKIOO appliquera vos choix lors de la préparation de votre service payant. Cette sélection est facultative.')}</p>
  <label htmlFor="mykioo-country-search">{tr('Search countries or channel groups','Rechercher un pays ou un groupe de chaînes')}</label>
  <input id="mykioo-country-search" type="search" value={query} onChange={e=>setQuery(e.target.value)}
   placeholder={tr('Haiti, Quebec, sports…','Haïti, Québec, sports…')}/>
  <div className="mykioo-country-selection">
   <button type="button" disabled={packs.every(pack=>selected.includes(pack.name))} onClick={()=>onChange(packs.map(pack=>pack.name))}>{tr('Select all countries & packs','Sélectionner tous les pays et bouquets')}</button>
   <span aria-live="polite">{selected.length} {tr('selected','sélectionnés')}</span>
   <button type="button" disabled={!selected.length} onClick={()=>onChange([])}>{tr('Clear selection','Effacer la sélection')}</button>
  </div>
  <div className="mykioo-country-grid">
   {matching.map(pack=><div className="mykioo-country-option" key={pack.name}>
    <label>
     <input type="checkbox" checked={selected.includes(pack.name)} onChange={()=>toggle(pack.name)}/>
     <span>{fr?pack.fr:pack.name}</span>
    </label>
    <details>
     <summary>{tr('Included groups','Groupes inclus')} ({pack.bouquets.length})</summary>
     <ul>{pack.bouquets.map(b=><li key={b.id}>{b.name}</li>)}</ul>
    </details>
   </div>)}
   {matching.length===0&&<p>{tr('No matching groups.','Aucun groupe correspondant.')}</p>}
  </div>
 </fieldset>;
}
