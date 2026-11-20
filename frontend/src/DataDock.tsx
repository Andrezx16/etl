import {useEffect,useMemo,useRef,useState,type ReactNode,type PointerEvent} from 'react'
import {Table} from './Visual'
import {useToast} from './Toast'
import {download,type Result} from './client'

export function WorkDialog({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{dialog.current?.showModal()},[])
 return <dialog ref={dialog} className="board-dialog" aria-label={title} onCancel={e=>{e.preventDefault();close()}}>
  <header><h2>{title}</h2><button onClick={close} aria-label="Cerrar">Cerrar</button></header>
  {children}
 </dialog>
}
export function DataDock({title,result,expanded,onToggle,member,dashboard,applied,fixed}:{title?:string;result?:Result;expanded:boolean;onToggle:()=>void;member?:string;dashboard:string;applied:string[];fixed?:string}){
 const [full,setFull]=useState(false)
 const [tab,setTab]=useState<'Datos'|'Consulta'|'Filtros aplicados'>('Datos')
 const [height,setHeight]=useState(()=>Number(sessionStorage.getItem('mercury-dock:'+dashboard))||0)
 const drag=useRef<{start:number;height:number}|undefined>(undefined)
 const dock=useRef<HTMLElement>(null)
 function resize(value:number){
  const next=Math.max(180,Math.min(value,Math.floor(window.innerHeight*.58)))
  setHeight(next)
  sessionStorage.setItem('mercury-dock:'+dashboard,String(next))
 }
 function startResize(event:PointerEvent<HTMLDivElement>){
  drag.current={start:event.clientY,height:dock.current?.clientHeight??220}
  event.currentTarget.setPointerCapture(event.pointerId)
 }
 const [search,setSearch]=useState('')
 const [sort,setSort]=useState('')
 const [descending,setDescending]=useState(false)
 const notify=useToast()
 const rows=useMemo(()=>{
  const needle=search.trim().toLowerCase()
  const filtered=(result?.rows??[]).filter(r=>!needle||Object.values(r).some(v=>v!==null&&String(v).toLowerCase().includes(needle)))
  if(!sort)return filtered
  return [...filtered].sort((a,b)=>{
   const x=a[sort],y=b[sort]
   if(x==null)return y==null?0:1
   if(y==null)return -1
   return (typeof x==='number'&&typeof y==='number'?x-y:String(x)<String(y)?-1:String(x)>String(y)?1:0)*(descending?-1:1)
  })
 },[result,search,sort,descending])
 async function exportFile(kind:string){
  if(!result)return
  try{await download(result.resultId,kind,{search,sort,descending,member:member??''})}
  catch(e){notify(e instanceof Error?e.message:'No se pudo exportar.','error')}
 }
 function controls(prefix:string){
  return <div className="dock-controls">
   <label>Buscar<input value={search} onChange={e=>setSearch(e.target.value)} maxLength={150} placeholder="Buscar en las filas" aria-label={prefix+'Buscar en las filas'}/></label>
   <label>Orden<select value={sort} onChange={e=>setSort(e.target.value)} aria-label={prefix+'Ordenar tabla'}><option value="">Orden de la consulta</option>{result?.columns.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
   {sort&&<button onClick={()=>setDescending(!descending)}>{descending?'Descendente':'Ascendente'}</button>}
   <div className="dock-exports"><button onClick={()=>exportFile('csv')}>Exportar CSV</button><button onClick={()=>exportFile('xlsx')}>Exportar XLSX</button></div>
  </div>
 }
 return <section ref={dock} className={'data-dock '+(expanded?'dock-expanded':'')} aria-label="Panel de datos" style={expanded&&height?{height}:undefined}>
  {expanded&&<div className="dock-resizer" role="separator" tabIndex={0} aria-orientation="horizontal" aria-label="Ajustar altura del panel de datos" onPointerDown={startResize}
   onPointerMove={e=>{if(drag.current)resize(drag.current.height+drag.current.start-e.clientY)}} onPointerUp={()=>{drag.current=undefined}} onPointerCancel={()=>{drag.current=undefined}}
   onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();resize((dock.current?.clientHeight??220)+(e.key==='ArrowUp'?24:-24))}}}/>}
  <header className="dock-bar">
   <div aria-live="polite"><strong>Datos</strong><span>{title?' · '+title:' · Selecciona una visualización'}</span>
    {result&&<span className="dock-count"> · {new Intl.NumberFormat('es-CO').format(rows.length)} filas{result.truncated?' · Resultado limitado':''}</span>}
   </div>
   <div className="dock-actions">{expanded&&result&&<button onClick={()=>setFull(true)}>Ampliar</button>}{title&&<button aria-expanded={expanded} aria-controls="dock-body" onClick={onToggle}>{expanded?'Contraer':'Mostrar tabla'}</button>}</div>
  </header>
  {expanded&&<div id="dock-body" className="dock-body">
   <nav className="dock-tabs" aria-label="Contenido del panel de datos">{(['Datos','Consulta','Filtros aplicados'] as const).map(label=><button key={label} aria-pressed={tab===label} onClick={()=>setTab(label)}>{label}</button>)}</nav>
   {tab==='Datos'&&(result?<>{controls('')}<Table result={result} rows={rows}/></>:<p role="status">{title?'Esperando el resultado de esta visualización.':'Selecciona una visualización.'}</p>)}
   {tab==='Consulta'&&<div className="dock-detail">{result?<><p>Consulta {result.queryId} · Cubo v{result.cubeVersion.slice(0,8)}</p><p>Columnas del resultado: {result.columns.map(c=>c.label).join(', ')}.</p></>:<p>La consulta de esta tarjeta aún no tiene resultado.</p>}</div>}
   {tab==='Filtros aplicados'&&<div className="dock-detail">
    {fixed&&<p>Fijo · {fixed}</p>}
    {applied.length>0&&<p>Global · {applied.join(', ')}</p>}
    {member&&<p>Selección cruzada · {member}</p>}
    {!fixed&&!applied.length&&!member&&<p>Sin filtros globales ni selección cruzada.</p>}
    {result?.filtersApplied&&Object.keys(result.filtersApplied).length>0&&<details><summary>Parámetros de la consulta</summary><pre>{JSON.stringify(result.filtersApplied,null,2)}</pre></details>}
   </div>}
  </div>}
  {full&&result&&<WorkDialog title={title??'Datos'} close={()=>setFull(false)}>
    <p>{rows.length} filas · Cubo v{result.cubeVersion.slice(0,8)}{result.truncated?' · Resultado limitado':''}</p>{controls('Vista ampliada: ')}<Table result={result} rows={rows}/>
  </WorkDialog>}
 </section>
}
