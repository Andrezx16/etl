import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Members} from './AnalyticsWorkspace'
import {choices,ChartSnapshot} from './Visual'
import {useToast} from './Toast'
import {api,type Metadata,type Option,type Query,type Result} from './client'
import {cardContext,catalogCards,type Widget} from './dashboardModel'
import type {Filters} from './AnalyticsWorkspace'

const presets=[['Pequeña',4,4],['Mediana',6,5],['Grande',8,6],['Ancho completo',12,6]] as const
function memberLabel(id:string){
 return id.match(/&\[([^\]]+)\]$/)?.[1]??id
}
export function CardEditor({widget,version,filters,onSave,onClose,inDrawer=false}:{widget?:Widget;version?:string;filters:Filters;onSave:(w:Widget)=>void;onClose:()=>void;inDrawer?:boolean}){
 const [catalog,setCatalog]=useState(widget?.catalog??'')
 const q=widget?.query
 const [dimension,setDimension]=useState(q?.dimension??'anio')
 const [second,setSecond]=useState(q?.second??'')
 const [measures,setMeasures]=useState(q?.measures??['programas'])
 const [limit,setLimit]=useState(q?.limit??25)
 const [order,setOrder]=useState(q?.order??'natural')
 const [title,setTitle]=useState(widget?.title??'')
 const [chart,setChart]=useState(widget?.chart??'bar')
 const [size,setSize]=useState(widget?.w??6)
 const [field,setField]=useState('')
 const [specific,setSpecific]=useState<Record<string,Option[]>>(()=>Object.fromEntries(Object.entries(q?.filters??{}).map(([key,ids])=>[key,ids.map(id=>({id,label:memberLabel(id)}))])))
 const [preview,setPreview]=useState<{result:Result;kind:string}>()
 const notify=useToast()
 const [loading,setLoading]=useState(false)
 const fields=useQuery({queryKey:['metadata',version],queryFn:()=>api<Metadata>('/analytics/metadata'),retry:false})
 const currentKind=chart
 const selectedSize=presets.find(([,w])=>w===size)
 const timeDimension=dimension.startsWith('anio')||second.startsWith('anio')||catalog==='S2'||catalog==='C3'
 function blocked(kind:string){
  if(timeDimension&&['pie','donut','treemap'].includes(kind))return true
  if(catalog)return ![catalogCards[catalog].chart,'table'].includes(kind)
  if(['pie','donut','treemap','funnel','stack','percent'].includes(kind)&&!(measures.length===1&&measures[0]==='programas'))return true
  if(['matrix','heatmap','stack','percent'].includes(kind)&&(!second||measures.length!==1))return true
  return ['scatter','combo'].includes(kind)&&measures.length!==2
 }
 function draft():Widget{
  const next:Widget={id:widget?.id??crypto.randomUUID(),chart:currentKind,title:title.trim()||null,x:widget?.x??0,y:widget?.y??0,w:size,h:selectedSize?.[2]??widget?.h??4}
  if(catalog)return {...next,catalog}
  const query:Query={...q,dimension,second:second||null,measures,limit,order,filters:Object.fromEntries(Object.entries(specific).filter(([,v])=>v.length).map(([k,values])=>[k,values.map(x=>x.id)]))}
  if(dimension!=='anio'||second)delete query.year
  return {...next,query}
 }
 async function renderPreview(){
  const config=cardContext(draft(),filters)
  if(config.incompatible){notify('Los filtros particulares y globales no tienen valores en común.','error');return}
  setLoading(true)
  try{setPreview({result:await api<Result>(config.url,config.body),kind:currentKind})}
  catch(e){notify(e instanceof Error?e.message:'No se pudo consultar el cubo.','error')}
  finally{setLoading(false)}
 }
 const valid=!!catalog||Boolean(dimension&&measures.length&&dimension!==second)
 return <aside className="board-editor" aria-label={widget?'Editar visualización':'Añadir visualización'}>
  {!inDrawer&&<header><h2>{widget?'Editar visualización':'Añadir visualización'}</h2><button onClick={onClose} aria-label="Cerrar editor">×</button></header>}
  <label>Origen<select value={catalog} onChange={e=>{const id=e.target.value;setCatalog(id);setChart(id?catalogCards[id].chart:'bar');setPreview(undefined)}}><option value="">Consulta personalizada</option>{Object.entries(catalogCards).map(([id,card])=><option key={id} value={id}>{id} · {card.title}</option>)}</select></label>
  <label>Título<input maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Usar el título de la consulta"/></label>
  {catalog?<p>{catalogCards[catalog].detail}</p>:<>
   <fieldset><legend>Medidas</legend>{fields.data?.measures.map(m=><label key={m.id}><input type="checkbox" checked={measures.includes(m.id)} disabled={!measures.includes(m.id)&&measures.length>=4} onChange={e=>setMeasures(e.target.checked?[...measures,m.id]:measures.filter(x=>x!==m.id))}/>{m.label}</label>)}{fields.error&&<p role="alert">{fields.error.message}</p>}</fieldset>
   <label>Agrupar por<select value={dimension} onChange={e=>{setDimension(e.target.value);if(e.target.value===second||e.target.value==='total')setSecond('')}}><option value="total">Total</option>{fields.data?.dimensions.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
   <label>Segunda dimensión<select value={second} disabled={dimension==='total'} onChange={e=>setSecond(e.target.value)}><option value="">Ninguna</option>{fields.data?.dimensions.filter(d=>d.id!==dimension).map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
   <label>Filtro particular<select value={field} onChange={e=>setField(e.target.value)}><option value="">Selecciona un campo</option>{fields.data?.dimensions.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
   {field&&<Members key={field} field={{id:field,label:fields.data?.dimensions.find(d=>d.id===field)?.label??field}} version={version} selected={specific[field]??[]} change={items=>setSpecific({...specific,[field]:items})}/>}
   {!!Object.values(specific).flat().length&&<div className="board-tags">{Object.entries(specific).flatMap(([key,items])=>items.map(item=><button key={key+item.id} onClick={()=>setSpecific({...specific,[key]:items.filter(x=>x.id!==item.id)})}>{item.label} ×</button>))}</div>}
   <label>Orden<select value={order} onChange={e=>setOrder(e.target.value)}><option value="natural">Orden del cubo</option><option value="desc">Mayor a menor</option><option value="asc">Menor a mayor</option></select></label>
   <label>Límite<select value={limit} onChange={e=>setLimit(Number(e.target.value))}>{Array.from(new Set([10,15,25,50,100,300,limit])).sort((a,b)=>a-b).map(n=><option key={n}>{n}</option>)}</select></label>
  </>}
  <label>Tipo de gráfico<select value={chart} onChange={e=>setChart(e.target.value)}>{choices.map(([id,name])=><option key={id} value={id} disabled={blocked(id)}>{name}</option>)}</select></label>
  {blocked(chart)&&<p role="status">Selecciona un gráfico compatible con estas medidas y dimensiones.</p>}
  <label>Tamaño<select value={size} onChange={e=>setSize(Number(e.target.value))}>{presets.map(([name,w])=><option key={w} value={w}>{name}</option>)}{!selectedSize&&<option value={size}>Personalizado</option>}</select></label>
  <div className="actions"><button onClick={renderPreview} disabled={!version||!valid||blocked(chart)||loading}>{loading?'Consultando…':'Vista previa'}</button><button className="primary" onClick={()=>onSave(draft())} disabled={!valid||blocked(chart)}>{widget?'Aplicar cambios':'Añadir al dashboard'}</button></div>
  {preview&&<div className="board-editor-preview"><ChartSnapshot result={preview.result} kind={preview.kind}/></div>}
 </aside>
}
