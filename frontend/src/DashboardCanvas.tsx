import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {useQueries,useQuery,useQueryClient} from '@tanstack/react-query'
import Grid from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import type {ECharts} from 'echarts'
import {api,download,saveFile,type Metadata,type Result} from './client'
import {Kpis,type Filters} from './AnalyticsWorkspace'
import {caption,ChartSnapshot,choices} from './Visual'
import {cardContext,catalogCards,fromTemplate,templates,titleFor,type Dashboard,type SavedDashboard,type Widget} from './dashboardModel'
import {DataDock,WorkDialog} from './DataDock'
import {CardEditor} from './CardEditor'
import {useToast} from './Toast'
import {SideDrawer,useMediaQuery} from './SideDrawer'
import './board.css'

type Context=ReturnType<typeof cardContext>
type CrossSelection={group:string;member:string}
function crossGroup(widget:Widget){
 return widget.query&&widget.query.dimension!=='total'?widget.query.dimension+'|'+(widget.query.second??''):''
}
function readable(error:unknown){return error instanceof Error?error.message:String(error)}
function normalizeLegacyCharts(design:Dashboard):Dashboard{
 if(!Array.isArray(design?.widgets))return design
 return {...design,widgets:design.widgets.map(widget=>widget?.chart==='column3d'?{...widget,chart:'bar'}:widget)}
}
function CanvasCard({widget,title,result,context,failure,reload,loading,chosen,select,showTable,edit,duplicate,remove,editing,menu,setMenu,member,onPick}:{widget:Widget;title:string;result?:Result;context:Context;failure?:string;reload:()=>void;loading:boolean;chosen:boolean;select:()=>void;showTable:()=>void;edit:()=>void;duplicate:()=>void;remove:()=>void;editing:boolean;menu:boolean;setMenu:(open:boolean)=>void;member?:string;onPick?:(member:string)=>void}){
 const chart=useRef<ECharts|null>(null)
 const [information,setInformation]=useState(false)
 const [menuAbove,setMenuAbove]=useState(false)
 const menuWrap=useRef<HTMLDivElement>(null)
 const drawerMenu=useMediaQuery('(max-width: 1023px)')
 const notify=useToast()
 const definition=widget.catalog?catalogCards[widget.catalog]:undefined
 const particular=Object.entries(widget.query?.filters??{}).filter(([,values])=>values.length)
 const pickRef=useRef(onPick)
 useEffect(()=>{pickRef.current=onPick},[onPick])
 const pick=useCallback((value:string)=>pickRef.current?.(value),[])
 useEffect(()=>{
  if(!menu||drawerMenu)return
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!menuWrap.current?.contains(event.target))setMenu(false)}
  document.addEventListener('pointerdown',outside)
  return ()=>document.removeEventListener('pointerdown',outside)
 },[menu,drawerMenu,setMenu])
 function action(callback:()=>void){setMenu(false);callback()}
 async function exportFile(format:string){
  setMenu(false)
  try{
   if(format==='png'){
    const src=chart.current?.getDataURL({type:'png',pixelRatio:2,backgroundColor:'#ffffff'})
    if(!src)throw Error('Este gráfico no tiene imagen disponible.')
    const link=document.createElement('a');link.href=src;link.download='mercury-grafico.png';link.click()
   }else if(result)await download(result.resultId,format,{member:member??''})
  }catch(e){notify(readable(e),'error')}
 }
 const actions=<>
  <button onClick={()=>action(showTable)}>Ver tabla</button><button onClick={()=>action(edit)}>Editar</button>
  <button onClick={()=>action(duplicate)}>Duplicar</button>
  <details><summary>Exportar</summary><div><button disabled={!result} onClick={()=>void exportFile('csv')}>CSV</button><button disabled={!result} onClick={()=>void exportFile('xlsx')}>XLSX</button><button disabled={!chart.current} onClick={()=>void exportFile('png')}>PNG</button></div></details>
  <button onClick={()=>action(()=>setInformation(true))}>Información</button>
  <button className="board-delete" onClick={()=>action(remove)}>Eliminar</button>
 </>
 return <article className={'board-card '+(chosen?'is-selected':'')}>
  <div className="board-card-head">
   <div className="board-card-heading">
    <h3><button className={editing?'board-drag':''} aria-pressed={chosen} onClick={select}>{editing&&<span aria-hidden="true">⠿ </span>}{title}</button></h3>
    <p>{definition?(widget.catalog+' · '+(choices.find(([id])=>id===widget.chart)?.[1]??'Análisis')):choices.find(([id])=>id===widget.chart)?.[1]}</p>
   </div>
   <div className="board-menu-wrap" ref={menuWrap}>
    <button className="board-more" aria-label={'Acciones: '+title} aria-expanded={menu} aria-haspopup={drawerMenu?'dialog':undefined} onKeyDown={e=>{if(e.key==='Escape')setMenu(false)}} onClick={e=>{
     const trigger=e.currentTarget.getBoundingClientRect()
     const area=e.currentTarget.closest('.board-scroll')?.getBoundingClientRect()
     setMenuAbove(Boolean(area&&area.bottom-trigger.bottom<235&&trigger.top-area.top>area.bottom-trigger.bottom))
     setMenu(!menu)
    }}>⋯</button>
    {menu&&(drawerMenu?<SideDrawer title="Acciones de visualización" side="right" onClose={()=>setMenu(false)}><div className="drawer-actions">{actions}</div></SideDrawer>
     :<div className={'board-menu '+(menuAbove?'board-menu-above':'')} aria-label="Acciones de visualización" onKeyDown={e=>{if(e.key==='Escape')setMenu(false)}}>{actions}</div>)}
   </div>
  </div>
  {(context.applied.length>0||context.unavailable.length>0||particular.length>0)&&<div className="board-tags">
   {context.applied.length>0&&<span title={'Filtros globales: '+context.applied.join(', ')}>Global · {context.applied.join(', ')}</span>}
   {particular.length>0&&<span className="tag-specific" title={particular.map(([id,values])=>id+': '+values.join(', ')).join(' · ')}>Particular · {particular.length}</span>}
   {context.unavailable.length>0&&<span className="tag-unavailable" title={context.unavailable.join(', ')}>{context.unavailable.length} no aplican</span>}
  </div>}
  <div className="board-card-main">
   {context.incompatible?<p className="board-state">Los filtros no tienen valores en común.</p>:failure?<div className="board-state" role="status"><p>{failure}</p><button onClick={reload}>Reintentar</button></div>:loading?<p className="board-state" aria-busy="true">Consultando el cubo…</p>:result?<ChartSnapshot result={result} kind={widget.chart} instance={chart} onPick={onPick?pick:undefined}/>:<p className="board-state">Publica datos para ver este gráfico.</p>}
  </div>
  {information&&<WorkDialog title="Acerca de este análisis" close={()=>setInformation(false)}>
   <p><strong>{title}</strong></p><p>{definition?.detail??'Consulta personalizada construida con los campos del cubo.'}</p>
   {widget.catalog&&<p>Consulta original {widget.catalog}</p>}
   {definition?.fixed&&<p>Restricción fija · {definition.fixed}</p>}
   {context.applied.length>0&&<p>Filtros globales · {context.applied.join(', ')}</p>}
   {context.unavailable.length>0&&<p>Filtros incompatibles · {context.unavailable.join(', ')}</p>}
   {result&&<p>Cubo v{result.cubeVersion.slice(0,8)} · {result.rows.length} filas{result.truncated?' · Resultado limitado':''}</p>}
  </WorkDialog>}
 </article>
}

export default function DashboardCanvas({section,version,filters,onCanvas,seed,consume}:{section:string;version?:string;filters:Filters;onCanvas:()=>void;seed:string;consume:()=>void}){
 const drawerEditor=useMediaQuery('(max-width: 1279px)')
 const [design,setDesign]=useState<Dashboard>(()=>fromTemplate('panorama'))
 const [source,setSource]=useState('template:panorama')
 const [savedId,setSavedId]=useState('')
 const [savedJson,setSavedJson]=useState(()=>JSON.stringify(fromTemplate('panorama')))
 const [selected,setSelected]=useState('')
 const [expanded,setExpanded]=useState(false)
 const [cross,setCross]=useState<CrossSelection>()
 const [editor,setEditor]=useState<string|null>(null)
 const [editing,setEditing]=useState(false)
 const [menu,setMenu]=useState('')
 const notify=useToast()
 const [width,setWidth]=useState(0)
 const holder=useRef<HTMLDivElement>(null)
 const canvas=section==='analisis'
 const lastSeed=useRef('')
 const cache=useQueryClient()
 const dashboards=useQuery({queryKey:['dashboards'],queryFn:()=>api<SavedDashboard[]>('/dashboards'),retry:false})
 const metadata=useQuery({queryKey:['metadata',version],queryFn:()=>api<Metadata>('/analytics/metadata'),retry:false})
 const names=useMemo(()=>Object.fromEntries([...(metadata.data?.dimensions??[]),...(metadata.data?.measures??[])].map(x=>[x.id,x.label])),[metadata.data])
 const dirty=JSON.stringify(design)!==savedJson
 useEffect(()=>{
  if(!holder.current)return
  const observer=new ResizeObserver(([size])=>{if(size.contentRect.width>0)setWidth(size.contentRect.width)})
  observer.observe(holder.current)
  return ()=>observer.disconnect()
 },[])
 useEffect(()=>{
  if(!seed){lastSeed.current='';return}
  if(lastSeed.current===seed)return
  lastSeed.current=seed
  if(seed==='personalizado')setEditor('new')
  else if(catalogCards[seed]){
   const card=catalogCards[seed]
   setDesign(current=>{
    if(current.widgets.length>=24||current.widgets.some(w=>w.catalog===seed&&w.chart===card.chart))return current
    const y=current.widgets.reduce((bottom,w)=>Math.max(bottom,w.y+w.h),0)
    return {...current,widgets:[...current.widgets,{id:crypto.randomUUID(),catalog:seed,chart:card.chart,x:0,y,w:6,h:5}]}
   })
  }
  consume()
 },[seed,consume])
 const contexts=design.widgets.map(w=>cardContext(w,filters))
 const responses=useQueries({queries:contexts.map(config=>({queryKey:['board-result',version,config.url,config.body],
  queryFn:()=>api<Result>(config.url,config.body),enabled:!!version&&!config.incompatible,staleTime:120000,retry:1}))})
 const selectedIndex=design.widgets.findIndex(w=>w.id===selected)
 const active=design.widgets[selectedIndex]
 const targetMembers=design.widgets.map(w=>cross&&crossGroup(w)===cross.group?cross.member:undefined)
 const scoped=responses.map((response,index)=>{
  const value=response.data,member=targetMembers[index]
  return value&&member?{...value,rows:value.rows.filter(row=>caption(value,row)===member)}:value
 })
 const result=scoped[selectedIndex]
 const crossCount=cross?targetMembers.filter(Boolean).length:0
 function pickChart(widget:Widget,original:Result|undefined,member:string){
  const group=crossGroup(widget)
  if(!group||design.widgets.filter(w=>crossGroup(w)===group).length<2||!original?.rows.some(r=>caption(original,r)===member))return
  setCross(cross?.group===group&&cross.member===member?undefined:{group,member})
 }
 const generatedNames=design.widgets.map(w=>titleFor(w,names))
 const editorWidget=design.widgets.find(w=>w.id===editor)
 function choose(id:string){
  if(id===selected)return
  setSelected(id);setExpanded(false)
 }
 function showTable(id:string){setSelected(id);setExpanded(true)}
 function load(value:string,go=true){
  if(dirty&&!confirm('¿Cambiar de dashboard y descartar los cambios sin guardar?'))return
  const saved=dashboards.data?.find(d=>d.id===value)
  const next=saved?normalizeLegacyCharts({name:saved.name,widgets:saved.widgets}):value==='new'?{name:'Mi dashboard',widgets:[]}:fromTemplate(value.slice(9))
  setDesign(next);setSavedJson(JSON.stringify(next));setSavedId(saved?.id??'');setSource(value);setSelected('');setCross(undefined);setExpanded(false);setEditor(null)
  if(go)onCanvas()
 }
 function addWidget(widget:Widget){
  setDesign(current=>{
   const exists=current.widgets.some(w=>w.id===widget.id)
   if(exists)return {...current,widgets:current.widgets.map(w=>w.id===widget.id?{...widget,x:Math.min(w.x,12-widget.w)}:w)}
   if(current.widgets.length>=24)return current
   const y=current.widgets.reduce((bottom,w)=>Math.max(bottom,w.y+w.h),0)
   return {...current,widgets:[...current.widgets,{...widget,x:0,y}]}
  })
  setEditor(null)
 }
 function removeWidget(id:string){
  if(!confirm('¿Quitar esta visualización del dashboard?'))return
  setDesign(d=>({...d,widgets:d.widgets.filter(w=>w.id!==id)}))
  if(selected===id){setSelected('');setExpanded(false)}
 }
 async function save(asCopy=false,provided=design){
  const id=asCopy?'':savedId
  try{
   const value=await api<SavedDashboard>('/dashboards'+(id?'/'+id:''),provided,id?'PUT':'POST')
   const next={name:value.name,widgets:value.widgets}
   setDesign(next);setSavedId(value.id);setSource(value.id);setSavedJson(JSON.stringify(next));notify('Dashboard guardado.')
   await cache.invalidateQueries({queryKey:['dashboards']})
  }catch(e){notify(readable(e),'error')}
 }
 async function importDesign(file:File){
  try{
   if(file.size>256000)throw Error('El archivo supera 256 KB.')
   await save(true,normalizeLegacyCharts(JSON.parse(await file.text()) as Dashboard))
   onCanvas()
  }catch(e){notify(readable(e),'error')}
 }
 async function deleteDashboard(id:string){
  if(!confirm('¿Eliminar este dashboard compartido?'))return
  try{
   await api('/dashboards/'+id,undefined,'DELETE')
   if(savedId===id){setSavedId('');setSource('new');setSavedJson('')}
   await cache.invalidateQueries({queryKey:['dashboards']})
   notify('Dashboard eliminado.')
  }catch(e){notify(readable(e),'error')}
 }
 const gridLayout=width>=890
 const positions=design.widgets.map(w=>({i:w.id,x:w.x,y:w.y,w:w.w,h:w.h,minW:3,minH:3,maxH:16}))
 function renderCard(widget:Widget,i:number){
  return <div key={widget.id} className={menu===widget.id?'board-menu-open':''} data-wide={widget.w>=8||undefined}
   style={gridLayout?undefined:{height:Math.max(254,widget.h*46)}}>
   <CanvasCard widget={widget} title={generatedNames[i]} result={scoped[i]} member={targetMembers[i]} onPick={crossGroup(widget)?value=>pickChart(widget,responses[i]?.data,value):undefined} context={contexts[i]} failure={responses[i]?.error?.message} reload={()=>void responses[i]?.refetch()} loading={responses[i]?.isFetching??false} chosen={selected===widget.id} select={()=>choose(widget.id)} showTable={()=>showTable(widget.id)} edit={()=>setEditor(widget.id)} duplicate={()=>addWidget({...widget,id:crypto.randomUUID()})} remove={()=>removeWidget(widget.id)} editing={editing&&gridLayout} menu={menu===widget.id} setMenu={open=>setMenu(open?widget.id:'')}/>
  </div>
 }
 const editorPanel=editor&&<CardEditor key={editor} widget={editorWidget} version={version} filters={filters} onSave={addWidget} onClose={()=>setEditor(null)} inDrawer={drawerEditor}/>
 return <div className={'board-root '+(canvas?'board-active':'')}>
  <div className="board-workspace" hidden={!canvas}>
   <header className="board-toolbar">
    <div className="board-title"><label htmlFor="board-source">Dashboard</label><select id="board-source" value={source} onChange={e=>load(e.target.value,false)}><optgroup label="Plantillas">{templates.map(t=><option key={t.id} value={'template:'+t.id}>{t.name}</option>)}</optgroup><optgroup label="Diseños"><option value="new">Mi dashboard</option>{dashboards.data?.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</optgroup></select></div>
    <div className="board-toolbar-actions">
     {dirty&&<small role="status">Cambios sin guardar</small>}
     {gridLayout&&<button aria-pressed={editing} onClick={()=>setEditing(!editing)}>{editing?'Terminar edición':'Editar diseño'}</button>}
     <button onClick={()=>void save()}>{savedId?'Guardar cambios':'Guardar dashboard'}</button>
     <button className="primary" disabled={design.widgets.length>=24} onClick={()=>setEditor('new')}>+ Añadir visualización</button>
    </div>
   </header>
   {cross&&crossCount>0&&<div className="board-cross"><span>Selección cruzada · {cross.member} · {crossCount} visualizaciones</span><button onClick={()=>setCross(undefined)}>Limpiar selección</button></div>}
   <div className={'board-center '+(editor&&!drawerEditor?'with-board-editor':'')}>
    <div className="board-scroll" onClick={e=>{if(e.target instanceof Element&&!e.target.closest('.board-menu-wrap'))setMenu('')}}>
     <Kpis version={version} filters={filters}/>
     <div className="board-grid" ref={holder}>
      {!design.widgets.length&&<div className="board-empty"><h3>Tu dashboard está vacío</h3><p>Añade una consulta guardada o construye una visualización para este lienzo.</p><button className="primary" onClick={()=>setEditor('new')}>Añadir visualización</button></div>}
      {gridLayout?<Grid width={width} cols={12} rowHeight={38} margin={[14,14]} containerPadding={[0,0]} layout={positions} draggableHandle=".board-drag" draggableCancel=".board-menu-wrap" isDraggable={editing} isResizable={editing}
       onLayoutChange={items=>{
        if(!editing)return
        setDesign(current=>{
         const widgets=current.widgets.map(w=>{const item=items.find(x=>x.i===w.id);return item?{...w,x:item.x,y:item.y,w:item.w,h:item.h}:w})
         return JSON.stringify(widgets)===JSON.stringify(current.widgets)?current:{...current,widgets}
        })
       }}>
       {design.widgets.map(renderCard)}
      </Grid>:<div className={'board-adaptive '+(width>=650?'board-adaptive-split':'')}>
       {design.widgets.map((widget,i)=>({widget,i})).sort((a,b)=>a.widget.y-b.widget.y||a.widget.x-b.widget.x).map(({widget,i})=>renderCard(widget,i))}
      </div>}
     </div>
    </div>
    {editorPanel&&(drawerEditor?<SideDrawer title={editorWidget?'Editar visualización':'Añadir visualización'} side="right" onClose={()=>setEditor(null)}>{editorPanel}</SideDrawer>:editorPanel)}
   </div>
   <DataDock key={active?.id??'none'} title={active?generatedNames[selectedIndex]:undefined} result={result} dashboard={source} applied={contexts[selectedIndex]?.applied??[]} fixed={active?.catalog?catalogCards[active.catalog]?.fixed:undefined} member={targetMembers[selectedIndex]} expanded={expanded} onToggle={()=>setExpanded(!expanded)}/>
  </div>
  {section==='analisis/mis-dashboards'&&<div className="board-library">
   <div className="between"><h2>Mis dashboards</h2><button className="primary" onClick={()=>load('new')}>Crear dashboard</button></div>
   <p>Los diseños se comparten en esta instalación.</p>
   <div className="actions"><label>Nombre del dashboard actual <input value={design.name} onChange={e=>setDesign({...design,name:e.target.value})} maxLength={100}/></label><button onClick={()=>void save()}>Guardar</button><button onClick={()=>void save(true,{...design,name:(design.name+' (copia)').slice(0,100)})}>Guardar como copia</button><button onClick={()=>saveFile(new Blob([JSON.stringify(design,null,2)],{type:'application/json'}),'mercury-dashboard.json')}>Exportar JSON</button><label>Importar JSON <input type="file" accept=".json" onChange={e=>{const file=e.target.files?.[0];if(file)void importDesign(file);e.target.value=''}}/></label></div>
   {dashboards.error&&<p role="alert">{dashboards.error.message}</p>}
   <div className="board-library-cards">{dashboards.data?.map(d=><article className="card" key={d.id}><h3>{d.name}</h3><p>{d.widgets.length} visualizaciones</p><div className="actions"><button onClick={()=>load(d.id)}>Abrir</button><button onClick={()=>void deleteDashboard(d.id)}>Eliminar</button></div></article>)}</div>
   {!dashboards.data?.length&&<p>Aún no hay dashboards guardados.</p>}
   <h2>Plantillas</h2><div className="board-library-cards">{templates.map(t=><article className="card" key={t.id}><h3>{t.name}</h3><p>{t.cards.length} visualizaciones del cubo</p><button onClick={()=>load('template:'+t.id)}>Usar plantilla</button></article>)}</div>
  </div>}
 </div>
}
