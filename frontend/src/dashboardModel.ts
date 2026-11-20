import {queryContext,validYears,type Filters} from './AnalyticsWorkspace'
import type {Query} from './client'

export type Widget={id:string;chart:string;title?:string|null;query?:Query|null;catalog?:string|null;x:number;y:number;w:number;h:number}
export type Dashboard={name:string;widgets:Widget[]}
export type SavedDashboard=Dashboard&{id:string}

export const catalogCards:Record<string,{title:string;chart:string;detail:string;fixed?:string;field?:string}>={
 S1:{title:'Oferta y matrícula por sector',chart:'combo',detail:'Compara el número de programas y la matrícula promedio por sector. Lee cantidades y pesos en sus escalas respectivas.',field:'sector'},
 S2:{title:'Evolución de la oferta académica',chart:'area',detail:'Cuenta los programas registrados cada año según la fecha de registro en el SNIES.',fixed:'Registro SNIES'},
 S3:{title:'Créditos por campo de conocimiento',chart:'bar',detail:'Compara la cantidad de programas de pregrado y los créditos promedio por campo amplio CINE.',fixed:'Pregrado'},
 C1:{title:'Alta calidad por departamento',chart:'bar',detail:'Muestra el total, el número acreditado y la proporción sobre el total del departamento.',field:'departamento'},
 C2:{title:'Calidad institucional en Nariño',chart:'bar',detail:'Identifica las instituciones que superan el porcentaje nacional de su sector. La diferencia se expresa en puntos porcentuales.',fixed:'Oferta en Nariño',field:'sector'},
 C3:{title:'Tendencia y promedio móvil',chart:'line',detail:'Compara los registros con su promedio móvil de tres años y la variación anual.',fixed:'Registro SNIES · 2013–2026'},
}
const modality:Query={dimension:'modalidad',measures:['programas'],limit:25}
const inventory:Query={dimension:'departamento',measures:['programas'],limit:15,order:'desc'}
const countSector:Query={dimension:'sector',measures:['programas'],limit:10}

export const templates=[
 {id:'panorama',name:'Panorama de oferta',cards:['S2','modalidad','S1','C1']},
 {id:'cobertura',name:'Cobertura territorial',cards:['territorio','C1','modalidad','S2']},
 {id:'calidad',name:'Calidad académica',cards:['C1','C2','S3','sector']},
 {id:'costos',name:'Estructura y costos',cards:['S1','S3','sector','modalidad']},
]
export function fromTemplate(id:string):Dashboard{
 const template=templates.find(t=>t.id===id)??templates[0]
 const frames=[[0,0,8,6],[8,0,4,4],[0,6,6,5],[6,6,6,5]]
 return {name:template.name,widgets:template.cards.map((key,i)=>{
  const [x,y,w,h]=frames[i]
  const common={id:key,x,y,w,h}
  if(key==='modalidad')return {...common,title:'Modalidades de estudio',query:modality,chart:'donut'}
  if(key==='territorio')return {...common,title:'Programas por departamento',query:inventory,chart:'horizontal'}
  if(key==='sector')return {...common,title:'Programas por sector',query:countSector,chart:'bar'}
  return {...common,catalog:key,chart:catalogCards[key].chart}
 })}
}

export function titleFor(widget:Widget,names:Record<string,string>){
 if(widget.title?.trim())return widget.title
 if(widget.catalog)return catalogCards[widget.catalog]?.title??widget.catalog
 const q=widget.query
 if(!q)return 'Análisis'
 const measure=q.measures.map(x=>names[x]??x).join(' y ')
 return measure+(q.dimension==='total'?'':' por '+[q.dimension,q.second].filter(Boolean).map(x=>names[x!]??x).join(' y '))
}

export function cardContext(widget:Widget,filters:Filters){
 const globals=queryContext(filters)
 const applied:string[]=[]
 const unavailable:string[]=[]
 const active=Object.entries(filters.members).filter(([,v])=>v.length)
 const years=validYears(filters)&&filters.start&&filters.end?{start:Number(filters.start),end:Number(filters.end)}:{}
 if(widget.catalog){
  const field=catalogCards[widget.catalog]?.field
  const time=['S2','C3'].includes(widget.catalog)&&filters.role==='anio'
  const applicable=active.find(([key])=>key===field)?.[1]??[]
  applied.push(...applicable.map(x=>x.label))
  unavailable.push(...active.filter(([key])=>key!==field).flatMap(([,items])=>items.map(x=>x.label)))
  if(years.start!==undefined)(time?applied:unavailable).push(filters.start+'–'+filters.end)
  return {url:'/analytics/catalog/'+widget.catalog+'/execute',body:{labels:applicable.map(x=>x.label),...(time?years:{})},applied,unavailable}
 }
 const query=widget.query!
 const merged={...query.filters}
 let incompatible=false
 for(const [key,values] of Object.entries(globals.filters)){
  const particular=merged[key]
  merged[key]=particular?.length?particular.filter(value=>values.includes(value)):values
  if(particular?.length&&!merged[key].length)incompatible=true
 }
 applied.push(...active.flatMap(([,items])=>items.map(x=>x.label)))
 let range={start:query.start,end:query.end,date_role:query.date_role??filters.role}
 if(years.start!==undefined){
  if(query.start!==undefined&&range.date_role!==filters.role)unavailable.push(filters.start+'–'+filters.end+' · otro rol de fecha')
  else{
   range={start:Math.max(query.start??years.start,years.start),end:Math.min(query.end??years.end!,years.end!),date_role:filters.role}
   if(range.start!>range.end!)incompatible=true
   applied.push(filters.start+'–'+filters.end)
  }
 }
 return {url:'/analytics/query',body:{...query,filters:merged,...range},applied,unavailable,incompatible}
}
