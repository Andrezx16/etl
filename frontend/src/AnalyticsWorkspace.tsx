import {useState,type ReactNode} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api,type Option,type Query,type Result} from './client'
import {Icon} from './Icon'
import {SideDrawer} from './SideDrawer'
import './analytics.css'

export type DateRole='anio'|'anio_resolucion'|'anio_ejecutoria'
export type Filters={members:Record<string,Option[]>;start:string;end:string;role:DateRole}
export const emptyFilters=():Filters=>({members:{},start:'',end:'',role:'anio'})
const roles:Record<DateRole,string>={anio:'Registro en el SNIES',anio_resolucion:'Resolución',anio_ejecutoria:'Ejecutoria'}
const firstYear=1998,lastYear=2026
const fields:Option[]=[
 {id:'departamento',label:'Departamento'},{id:'sector',label:'Sector'},
 {id:'nivel',label:'Nivel académico'},{id:'modalidad',label:'Modalidad'},{id:'estado',label:'Estado del programa'}
]
export function validYears(filters:Filters){
 const start=Number(filters.start),end=Number(filters.end)
 return !filters.start&&!filters.end || Number.isInteger(start)&&Number.isInteger(end)&&start>=firstYear&&end<=lastYear&&start<=end
}
export function queryContext(filters:Filters){
 return {filters:Object.fromEntries(Object.entries(filters.members).filter(([,v])=>v.length).map(([key,items])=>[key,items.map(i=>i.id)])),
  ...(filters.start&&filters.end?{start:Number(filters.start),end:Number(filters.end)}:{}),date_role:filters.role}
}
export function Members({field,selected,change,version}:{field:Option;selected:Option[];change:(values:Option[])=>void;version?:string}){
 const [search,setSearch]=useState('')
 const [expanded,setExpanded]=useState(false)
 const members=useQuery({queryKey:['members',version,field.id],queryFn:()=>api<Option[]>('/analytics/members/'+field.id),enabled:!!version&&expanded,retry:false,staleTime:60000})
 const matches=members.data?.filter(m=>m.label.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')))??[]
 const [page,setPage]=useState(0)
 return <details className="member-picker" onToggle={e=>setExpanded(e.currentTarget.open)}>
  <summary>{field.label}<span>{selected.length?selected.length+' seleccionados':'Todos'}</span></summary>
  <div className="member-body">
   {!version?<p>Publica datos para consultar los miembros.</p>:members.isPending?<p>Consultando miembros…</p>:members.error?<p role="status">{members.error.message}</p>:<>
    <input aria-label={'Buscar '+field.label} placeholder="Buscar miembro" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}/>
    <div className="member-values">{matches.slice(page*8,page*8+8).map(item=><label key={item.id}><input type="checkbox" checked={selected.some(x=>x.id===item.id)}
     disabled={selected.length>=30&&!selected.some(x=>x.id===item.id)} onChange={e=>change(e.target.checked?[...selected,item]:selected.filter(x=>x.id!==item.id))}/>{item.label}</label>)}</div>
    {!matches.length&&<p>Sin coincidencias.</p>}{matches.length>8&&<div className="actions"><button disabled={page===0} onClick={()=>setPage(page-1)}>Anterior</button><button disabled={(page+1)*8>=matches.length} onClick={()=>setPage(page+1)}>Siguiente</button></div>}
   </>}
  </div>
 </details>
}
export function AnalyticsWorkspace({filters,setFilters,open,overlay,toggle,version,mode,children}:{filters:Filters;setFilters:(f:Filters)=>void;open:boolean;overlay:boolean;toggle:()=>void;version?:string;mode:string;children:ReactNode}){
 const chips=Object.entries(filters.members).flatMap(([key,values])=>values.map(value=>({key,value})))
 const active=chips.length>0||!!filters.start||!!filters.end||filters.role!=='anio'
 function finishYear(field:'start'|'end',value:string){
  if(!value)return
  const clamped=String(Math.min(lastYear,Math.max(firstYear,Math.trunc(Number(value)))))
  if(clamped!==value)setFilters({...filters,[field]:clamped})
 }
 const fieldsPanel=<div className="board-filter-fields" id="bi-global-filters" hidden={!open}>
   <fieldset><legend>Rango de años</legend><div className="bi-years">
    {(['start','end'] as const).map((field,index)=><label key={field}>{index===0?'Desde':'Hasta'}<input type="number" min={firstYear} max={lastYear} value={filters[field]}
     onChange={e=>setFilters({...filters,[field]:e.target.value})} onBlur={e=>finishYear(field,e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/></label>)}
   </div>{!validYears(filters)&&<small role="status">Indica un rango válido entre {firstYear} y {lastYear}.</small>}</fieldset>
   {fields.map(field=><Members key={field.id} field={field} selected={filters.members[field.id]??[]} change={values=>setFilters({...filters,members:{...filters.members,[field.id]:values}})} version={version}/>)}
   <label className="bi-field">Rol de fecha<select value={filters.role} onChange={e=>setFilters({...filters,role:e.target.value as DateRole})}>{Object.entries(roles).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
   <button onClick={()=>setFilters(emptyFilters())}>Restablecer filtros</button>
   </div>
 return <section className={'bi-shell board-shell '+(overlay?'drawer-filters':open?'with-filters':'')} aria-label={mode}>
  {overlay?open&&<SideDrawer id="global-filters-drawer" title="Filtros globales" onClose={toggle}>{fieldsPanel}</SideDrawer>:<aside className={'board-filter-region '+(open?'is-open':'')} aria-label="Filtros globales">
   <div className="board-filter-bar">
    <h2>Filtros globales</h2><button className="board-filter-button" aria-expanded={open} aria-controls="bi-global-filters" aria-label={open?'Plegar filtros globales':'Desplegar filtros globales'} title={open?'Plegar filtros globales':'Desplegar filtros globales'} onClick={toggle}><Icon name="filters" size={18}/></button>
   </div>
   {fieldsPanel}
  </aside>}
  <div className="board-shell-content">
   {(active||overlay)&&<div className="board-active-filters" aria-label="Filtros globales activos">
    {overlay&&<button className="board-filter-trigger" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?'global-filters-drawer':undefined}><Icon name="filters" size={16}/> Filtros</button>}
    {(filters.start||filters.end)&&<button onClick={()=>setFilters({...filters,start:'',end:''})}>{filters.start||'…'} – {filters.end||'…'} ×</button>}
    {chips.map(({key,value})=><button key={key+value.id} title={'Quitar '+value.label} onClick={()=>setFilters({...filters,members:{...filters.members,[key]:filters.members[key].filter(x=>x.id!==value.id)}})}>{value.label} ×</button>)}
    {filters.role!=='anio'&&<button onClick={()=>setFilters({...filters,role:'anio'})}>{roles[filters.role]} ×</button>}
   </div>}
   {children}
  </div>
 </section>
}

const metrics=[
 ['chart','Programas','Oferta registrada'],
 ['wallet','Matrícula promedio','COP · datos disponibles'],
 ['book','Créditos promedio','Créditos por programa'],
 ['clock','Duración promedio','Periodos por programa'],
] as const
const number=new Intl.NumberFormat('es-CO',{maximumFractionDigits:1})
const price=new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0})
export function Kpis({version,filters}:{version?:string;filters:Filters}){
 const query:Query={dimension:'total',measures:['programas','matricula','creditos','duracion'],limit:1,...queryContext(filters)}
 const summary=useQuery({queryKey:['bi-kpis',version,query],queryFn:()=>api<Result>('/analytics/query',query),enabled:!!version&&validYears(filters),retry:false})
 const row=summary.data?.rows[0]
 return <><div className="bi-kpis">{metrics.map(([icon,label,detail],i)=>{
  const value=row?.['m'+i]
  return <article className="card bi-kpi" key={label}>
   <div className="bi-kpi-head"><p>{label}</p><span className="bi-kpi-icon"><Icon name={icon} size={16}/></span></div>
   <strong>{typeof value==='number'?(i===1?price:number).format(value):summary.isFetching?'…':'—'}</strong>
   <small>{detail}</small>
  </article>
 })}</div>{summary.error&&<p className="notice" role="status">{summary.error.message}</p>}</>
}
