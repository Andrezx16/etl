import {AnalyticsWorkspace, emptyFilters, type Filters} from './AnalyticsWorkspace'
import DashboardCanvas from './DashboardCanvas'
import {catalogCards} from './dashboardModel'
import {useCallback,useEffect,useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {api,date,type Health,type Option,type Run} from './client'
import {Logo} from './Landing'
import {Visual} from './Visual'
import {useToast} from './Toast'
import {Icon} from './Icon'
import {SideDrawer,useMediaQuery} from './SideDrawer'

const navigation=[['resumen','Resumen','◈'],['carga','Cargar datos','↑'],['historial','Historial','◷'],['analisis','Espacio de análisis','▥'],['configuracion','Configuración','⚙']]
const analysisTabs=[['analisis','Lienzo'],['analisis/catalogo','Catálogo de análisis'],['analisis/mis-dashboards','Mis dashboards']] as const
const oldAnalysisRoutes:Record<string,string>={dashboard:'analisis',explorador:'analisis',consultas:'analisis/catalogo'}
function resolveRoute(hash:string){
 return oldAnalysisRoutes[hash]??(navigation.some(([id])=>id===hash)||analysisTabs.some(([id])=>id===hash)?hash:'resumen')
}
const filenames=['Instituciones.xlsx','Programas.xlsx']
const stateLabel=(value:string)=>({VALIDADA:'Validada',EN_COLA:'En cola',EN_PROCESO:'En proceso',COMPLETADA:'Completada',ERROR:'Error'}[value]??value)
const titles:{[k:string]:string}={S1:'Programas y matrícula por sector',S2:'Programas registrados por año',S3:'Pregrado y créditos por campo CINE',C1:'Alta calidad por departamento',C2:'Oferta de alta calidad en Nariño',C3:'Tendencia y promedio móvil'}
const states=['EN_COLA','EN_PROCESO','COMPLETADA','ERROR']
const jobActive=(r?:Run|null)=>r && (r.state==='EN_COLA'||r.state==='EN_PROCESO')
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e)
function Status({value}:{value?:string}){return <span className={'status '+(value==='Disponible'?'ok':'')}>{value||'Comprobando…'}</span>}
function Notice({children}:{children:React.ReactNode}){return <div className="notice" role="status">{children}</div>}
function Services({health}:{health?:Health}){
 return <div className="services">{([['PostgreSQL',health?.postgres,'ETL y bodega'],['SQL Server',health?.sqlServer,'Réplica relacional'],['SSAS',health?.ssas,'Cubo multidimensional']] as const).map(([name,status,copy])=><article className="service card" key={name}><div><h3>{name}</h3><p>{copy}</p></div><Status value={status}/></article>)}</div>
}
function Progress({job,onRetry}:{job:Run;onRetry:()=>void}){
 const count=job.detail.etl?.carga?.hecho
 const rejected=Object.values(job.detail.etl?.validacion??{}).reduce((n,x)=>n+x.rechazados,0)+Object.values(job.detail.etl?.staging??{}).reduce((n,x)=>n+x.rechazados,0)
 return <article className="card progress">
  <div className="between"><div><h3>{job.stage}</h3><small>{job.id}</small></div><span className="pill">{stateLabel(job.state)}</span></div>
  <progress max={3} value={job.checkpoint}/>
  {count&&<p>{count.nuevos} insertados · {count.actualizados} actualizados · {count.sin_cambios} sin cambios · {rejected} rechazados</p>}
  {job.error&&<Notice>{job.error} <button onClick={onRetry}>Reintentar</button></Notice>}
  <details><summary>Ver etapas de ETL</summary><ul>{job.detail.events?.map((event,i)=><li key={i}>{event.name} · {event.state} · {date(event.at)}</li>)}</ul></details>
  {job.detail.etl_id&&<a className="secondary" href={'/api/runs/'+job.id+'/rejections'}>Descargar rechazos</a>}
 </article>
}
type Sheet={name:string;columns:string[];rows:number;duplicates:number;notes?:number;preview:(string|number|null)[][]}
type Report={id:string;files:{filename:string;original:string;bytes:number;sheets:Sheet[]}[]}
function Upload({health,track}:{health?:Health;track:(id:string)=>void}){
 const [files,setFiles]=useState<Record<string,File>>({}),[report,setReport]=useState<Report>(),[busy,setBusy]=useState(false)
 const notify=useToast()
 const [active,setActive]=useState('')
 const cache=useQueryClient()
 const schema=useQuery({queryKey:['schema'],queryFn:()=>api<Record<string,{hoja:string;columnas:Record<string,string>}[]>>('/sources/schema')})
 const job=useQuery({queryKey:['run',active],enabled:Boolean(active),queryFn:()=>api<Run>('/runs/'+active),refetchInterval:q=>jobActive(q.state.data)?1000:false})
 useEffect(()=>{
  if(!active||!jobActive(job.data))return
  const source=new EventSource('/api/runs/'+active+'/events')
  source.onmessage=message=>{
   const update=JSON.parse(message.data) as Run
   cache.setQueryData(['run',active],update)
   if(!jobActive(update)){source.close();void cache.invalidateQueries({queryKey:['health']})}
  }
  return ()=>source.close()
 },[active,job.data?.state,cache])
 async function action(kind:'validate'|'start'|'retry'){
  setBusy(true)
  try{
   if(kind==='validate'){
    const form=new FormData()
    for(const name of filenames){form.append('files',files[name]);form.append('sources',name)}
    setReport(await api<Report>('/uploads/validate',form))
   }else{
    const r=kind==='start'?await api<{id:string}>('/runs',{id:report!.id}):await api<{id:string}>('/runs/'+active+'/retry',{})
    setActive(r.id);track(r.id);setReport(undefined)
    void cache.invalidateQueries({queryKey:['run',r.id]})
    void cache.invalidateQueries({queryKey:['health']})
   }
  }catch(e){notify(errorText(e),'error')}finally{setBusy(false)}
 }
 return <div className="content-stack">
  <div className="upload-grid">{filenames.map(name=><article key={name} className="card upload-card"><h3>{name.replace('.xlsx','')}</h3>
   <p>{schema.data?.[name]?.map(f=>f.hoja).join(' · ')}</p>
   <label className="drop">
    <span>{files[name]?files[name].name+' · '+(files[name].size/1048576).toFixed(2)+' MB':'Seleccionar archivo .xlsx'}</span>
    <input type="file" accept=".xlsx" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file){setFiles({...files,[name]:file});setReport(undefined)}}}/>
   </label>
   <div className="actions"><a href={'/api/sources/template/'+name}>Descargar plantilla</a></div>
   <details><summary>Ver columnas requeridas</summary>{schema.data?.[name]?.map(f=><p key={f.hoja}><strong>{f.hoja}</strong> · {Object.keys(f.columnas).join(', ')}</p>)}</details>
  </article>)}</div>
  <div className="actions"><button className="primary" disabled={busy||Object.keys(files).length!==2} onClick={()=>action('validate')}>{busy?'Procesando…':'Validar archivos'}</button></div>
  
  {report&&<article className="card"><h3>Archivos validados</h3><p>La carga inserta los registros nuevos, actualiza los que cambiaron y conserva los registros existentes que falten en el archivo.</p>
   {report.files.map(f=><div key={f.filename}><h4>{f.original} · {(f.bytes/1048576).toFixed(2)} MB</h4>{f.sheets.map(s=><details key={s.name}><summary>{s.name} · {s.rows} filas · {s.duplicates} duplicados idénticos{Boolean(s.notes)&&` · ${s.notes} notas al pie omitidas`}</summary><div className="table-over"><table><thead><tr>{s.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{s.preview.map((row,i)=><tr key={i}>{row.map((value,j)=><td key={j}>{value??'—'}</td>)}</tr>)}</tbody></table></div></details>)}</div>)}
   <button className="primary" disabled={busy||Boolean(jobActive(health?.lastRun))} onClick={()=>action('start')}>Confirmar carga incremental</button>
  </article>}
  {job.data&&<Progress job={job.data} onRetry={()=>action('retry')}/>}
 </div>
}
function History({initial}:{initial:string}){
 const [state,setState]=useState(''),[since,setSince]=useState(''),[offset,setOffset]=useState(0),[id,setId]=useState(initial)
 const notify=useToast()
 const cache=useQueryClient()
 const history=useQuery({queryKey:['history',state,since,offset],queryFn:()=>api<Run[]>('/runs?'+new URLSearchParams({...(state?{state}:{}),since,offset:String(offset)})),refetchInterval:4000})
 const selected=useQuery({queryKey:['run',id],enabled:Boolean(id),queryFn:()=>api<Run>('/runs/'+id),refetchInterval:q=>jobActive(q.state.data)?1000:false})
 async function retry(){try{await api('/runs/'+id+'/retry',{});void cache.invalidateQueries({queryKey:['run',id]});void history.refetch()}catch(e){notify(errorText(e),'error')}}
 return <div className="content-stack"><article className="card">
  <div className="actions"><label>Estado <select value={state} onChange={e=>{setState(e.target.value);setOffset(0)}}><option value="">Todos</option>{states.map(s=><option value={s} key={s}>{stateLabel(s)}</option>)}</select></label>
  <label>Desde <input type="date" value={since} onChange={e=>{setSince(e.target.value);setOffset(0)}}/></label></div>
  {history.error&&<Notice>{history.error.message}</Notice>}
  {!history.data?.length?<p className="empty">No hay corridas para estos filtros.</p>:<div className="table-over"><table><thead><tr><th>Corrida</th><th>Fecha</th><th>Archivos</th><th>Estado</th><th>Duración</th><th>Insertados</th><th>Actualizados</th><th>Sin cambios</th><th>Rechazados</th><th>Publicación</th></tr></thead><tbody>{history.data.map(r=>{
   const count=r.detail.etl?.carga?.hecho
   return <tr key={r.id}><td><button onClick={()=>setId(r.id)}>{r.id.slice(0,8)}</button></td><td>{date(r.created)}</td><td>{r.files.join(', ')||r.stage}</td><td>{stateLabel(r.state)}</td><td>{r.started&&r.ended?Math.round((Date.parse(r.ended)-Date.parse(r.started))/1000)+' s':'—'}</td><td>{count?.nuevos??'—'}</td><td>{count?.actualizados??'—'}</td><td>{count?.sin_cambios??'—'}</td><td>{r.detail.etl?Object.values(r.detail.etl.validacion??{}).concat(Object.values(r.detail.etl.staging??{})).reduce((n,x)=>n+x.rechazados,0):'—'}</td><td>{r.detail.published_version?r.detail.published_version.slice(0,8):'—'}</td></tr>
  })}</tbody></table></div>}
  <div className="actions"><button disabled={offset===0} onClick={()=>setOffset(offset-50)}>Anterior</button><button disabled={(history.data?.length??0)<50} onClick={()=>setOffset(offset+50)}>Siguiente</button></div>
 </article>{selected.data&&<Progress job={selected.data} onRetry={retry}/>}</div>
}
function Basic({version,queryOnly,add}:{version?:string;queryOnly:boolean;add:(id:string)=>void}){
 const [id,setId]=useState('S2')
 const catalog=useQuery({queryKey:['catalog'],queryFn:()=>api<(Option&{mdx:string})[]>('/analytics/catalog')})
 return <article className="card basic">
  <div className="between"><h3>{titles[id]}</h3><div className="actions"><button onClick={()=>add(id)}>Añadir al lienzo</button><label>Consulta <select value={id} onChange={e=>setId(e.target.value)}>{Object.entries(titles).map(([key,label])=><option key={key} value={key}>{key} · {label}</option>)}</select></label></div></div>
  {queryOnly&&<details><summary>Ver consulta MDX</summary><pre>{catalog.data?.find(c=>c.id===id)?.mdx}</pre></details>}
  <Visual key={id+queryOnly} catalog={id} kind={queryOnly?'table':id==='S2'||id==='C3'?'line':id==='C1'||id==='C2'?'horizontal':'bar'} version={version}/>
 </article>
}
function Settings({health,refresh,track}:{health?:Health;refresh:()=>Promise<Health>;track:(id:string)=>void}){
 const notify=useToast()
 const [checking,setChecking]=useState(false)
 async function checkConnections(){
  setChecking(true)
  try{
   const checked=await refresh()
   const statuses=[['PostgreSQL',checked.postgres],['SQL Server',checked.sqlServer],['SSAS',checked.ssas]]
   const unavailable=statuses.filter(([,status])=>status!=='Disponible')
   const summary=unavailable.length
    ?unavailable.map(([name,status])=>name+' ('+status+')').join(', ')+'.'
    :'PostgreSQL, SQL Server y SSAS disponibles.'
   notify(summary,unavailable.length?'info':'success')
  }catch(e){
   notify('No se pudieron comprobar las conexiones. '+errorText(e),'error')
  }finally{
   setChecking(false)
  }
 }
 async function initialize(){
  if(!confirm("¿Crear los esquemas y desplegar el cubo si falta? Verifica antes las conexiones y el respaldo de las instancias."))return
  try{const r=await api<{id:string}>("/setup/initialize",{});track(r.id)}catch(e){notify(errorText(e),'error')}
 }
 async function process(){if(!confirm('¿Reprocesar el cubo SSAS con la última bodega sincronizada?'))return
  try{const r=await api<{id:string}>('/cube/process',{});track(r.id)}catch(e){notify(errorText(e),'error')}
 }
 return <div className="content-stack"><Services health={health}/><div className="card"><h3>Versiones de datos</h3>
  <dl className="stack">{[['dw','Bodega PostgreSQL'],['sql','Réplica SQL Server'],['cube','Cubo publicado']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{health?.versions[key]??'Sin versión registrada'}</dd></div>)}</dl>
  <div className="actions"><button onClick={checkConnections} disabled={checking}>{checking?'Comprobando conexiones…':'Comprobar conexiones'}</button>{!health?.shared&&<button disabled={!health?.versions.sql||Boolean(jobActive(health?.lastRun))} onClick={process}>Reprocesar cubo</button>}</div></div>
  {!health?.shared&&<div className="card"><h3>Conectar esta instalación</h3><p>La preparación crea los esquemas y despliega el cubo si hace falta. Hazla antes de la primera carga de Excel.</p><div className="actions"><button className="primary" disabled={!health?.setupReady||Boolean(jobActive(health?.lastRun))} onClick={initialize}>Preparar instalación</button></div>{!health?.setupReady&&<small>Ejecuta <code>./scripts/setup.ps1 -Configure -SkipDependencies</code> en PowerShell y reinicia Mercury para habilitar esta acción.</small>}<p>Los dashboards guardados son compartidos por quienes acceden a esta instalación.</p></div>}
 </div>
}
export default function App(){
 const initial=location.hash.slice(1)
 const [tab,setTab]=useState(()=>resolveRoute(initial))
 
 const [run,setRun]=useState(''),[seed,setSeed]=useState(initial==='explorador'?'personalizado':'')
 const health=useQuery({queryKey:['health'],queryFn:()=>api<Health>('/health'),retry:false,refetchInterval:q=>q.state.data?.shared?30000:7000})
 const version=health.data?.versions.cube
 const consume=useCallback(()=>setSeed(""),[])
 useEffect(()=>{
  function follow(){
   const hash=location.hash.slice(1)
   const route=resolveRoute(hash)
   if(hash==='explorador')setSeed('personalizado')
   if(oldAnalysisRoutes[hash])history.replaceState(null,'','#'+route)
   setTab(route)
  }
  follow()
  addEventListener('hashchange',follow)
  return()=>removeEventListener('hashchange',follow)
 },[])
 function go(id:string){
  setTab(id);setNavOpen(false)
  if(location.hash!=='#'+id)location.hash=id
  window.scrollTo(0,0)
 }
 function openEditor(id?:string){
  if(id)setSeed(id)
  go('analisis')
 }
 function track(id:string){setRun(id);void health.refetch()}
 const [filters,setFilters]=useState<Filters>(emptyFilters)
 const overlayFilters=useMediaQuery('(max-width: 1279px)')
 const [desktopFilters,setDesktopFilters]=useState(true)
 const [drawerFilters,setDrawerFilters]=useState(false)
 const mobileNav=useMediaQuery('(max-width: 1023px)')
 const analytic=tab==='analisis'||tab.startsWith('analisis/')
 const [sidebarOpen,setSidebarOpen]=useState(()=>sessionStorage.getItem('mercury-navigation')==='open'||(sessionStorage.getItem('mercury-navigation')===null&&window.innerWidth>=1280))
 useEffect(()=>{
  const wide=window.matchMedia('(min-width: 1280px)')
  const update=()=>{if(sessionStorage.getItem('mercury-navigation')===null)setSidebarOpen(wide.matches)}
  wide.addEventListener('change',update)
  return()=>wide.removeEventListener('change',update)
 },[])
 function toggleNavigation(){
  setSidebarOpen(!sidebarOpen)
  sessionStorage.setItem('mercury-navigation',sidebarOpen?'closed':'open')
 }
 const [navOpen,setNavOpen]=useState(false)
 useEffect(()=>{if(!mobileNav)setNavOpen(false)},[mobileNav])
 useEffect(()=>{if(!overlayFilters||!analytic)setDrawerFilters(false)},[overlayFilters,analytic])
 const filterOpen=overlayFilters?drawerFilters:desktopFilters
 function toggleFilters(){(overlayFilters?setDrawerFilters:setDesktopFilters)(open=>!open)}
 const section=analytic?'analisis':tab
 const label=navigation.find(([id])=>id===section)?.[1]
 const sidebar=<>
   <a href="/" aria-label="Mercury"><Logo/></a>
   <nav id="app-nav" aria-label="Secciones de trabajo">{navigation.map(([id,text,icon])=><a className={section===id?'active':''} aria-current={section===id?'page':undefined} aria-label={text} title={text} key={id} href={'#'+id} onClick={e=>{e.preventDefault();go(id)}}><i aria-hidden="true">{icon}</i><span>{text}</span></a>)}</nav>
   <a className="back" href="/" title="Volver al sitio">Volver al sitio</a>
 </>
 const navigationOpen=mobileNav?navOpen:sidebarOpen
 return <div className={['app mercury-app',analytic&&'bi-app bi-unified',mobileNav?'app-narrow':!sidebarOpen&&(analytic?'bi-nav-rail':'app-nav-hidden')].filter(Boolean).join(' ')}>
  {mobileNav?navOpen&&<SideDrawer id="app-sidebar" title="Menú" onClose={()=>setNavOpen(false)}><div className="drawer-navigation">{sidebar}</div></SideDrawer>:<aside id="app-sidebar" className="aside">{sidebar}</aside>}
  <main className="workspace"><header className="work-head"><div className="work-heading">
   <button className="work-nav-toggle" onClick={mobileNav?()=>setNavOpen(!navOpen):toggleNavigation} aria-expanded={navigationOpen} aria-controls={mobileNav&&!navOpen?undefined:'app-sidebar'} aria-haspopup={mobileNav?'dialog':undefined} title={mobileNav?'Abrir menú':navigationOpen?'Plegar navegación':'Expandir navegación'} aria-label={mobileNav?'Abrir menú':navigationOpen?'Plegar navegación':'Expandir navegación'}><Icon name="menu" size={20}/></button>
   {analytic?<h1>{label}</h1>:<span>Mercury <span className="slash">/</span> {label}</span>}
  </div><div className="work-status">
   {analytic&&version&&<span className="cube-version" title={'Versión '+version+(health.data?.publication?.published?' · '+date(health.data.publication.published):'')}>Cubo <strong>v{version.slice(0,8)}</strong></span>}
   <Status value={health.error?'API sin conexión':health.data?.ssas}/>
  </div></header>
   {analytic&&<nav className="analysis-tabs" aria-label="Espacio de análisis">{analysisTabs.map(([id,name])=><a key={id} href={'#'+id} aria-current={tab===id?'page':undefined} onClick={e=>{e.preventDefault();go(id)}}>{name}</a>)}</nav>}
   <div className="work-body">{!analytic&&<div className="page-title"><h1>{label}</h1>{tab==='resumen'&&<button className="primary" onClick={()=>go('carga')}>Cargar Excel</button>}</div>}
   {health.error&&<Notice>{health.error.message} <button onClick={()=>health.refetch()}>Reintentar conexión</button></Notice>}
   {health.data?.pending&&<Notice>Hay una versión de la bodega pendiente de publicación. Los resultados guardados corresponden a la última versión publicada.</Notice>}
   {tab==='resumen'&&<div className="content-stack"><Services health={health.data}/><div className="summary-grid">
    <article className="card"><p>Última ejecución</p><h3>{date(health.data?.lastRun?.created)}</h3><span>{health.data?.lastRun?stateLabel(health.data.lastRun.state):'Sin corridas'}</span></article>
    <article className="card"><p>Versión publicada del cubo</p><h3>{version?.slice(0,8)??'Sin publicar'}</h3><span>{version?date(health.data?.publication?.published):'Importa y procesa los archivos SNIES'}</span></article>{health.data?.publication&&<article className="card"><p>Programas en el cubo publicado</p><h3>{new Intl.NumberFormat("es-CO").format(health.data.publication.programs)}</h3><span>Indicador verificado por MDX</span></article>}</div>
    {version?<article className="card"><h3>Programas registrados por año</h3><Visual version={version} catalog="S2" kind="area"/></article>:<article className="card welcome"><div><h2>Publica tus primeros datos</h2><p>Valida los dos archivos Excel, confirma la carga y sigue el procesamiento desde el historial.</p><button className="primary" onClick={()=>go('carga')}>Ir a Cargar datos</button></div></article>}
   </div>}
   {tab==='carga'&&<Upload health={health.data} track={track}/>}
   {tab==='historial'&&<History initial={run}/>}
   {analytic&&<AnalyticsWorkspace mode="Área analítica" filters={filters} setFilters={setFilters} open={filterOpen} overlay={overlayFilters} toggle={toggleFilters} version={version}>
    {tab==='analisis/catalogo'&&<section className="board-catalog">
     <h2>Catálogo de análisis</h2>
     <div className="board-library-cards">{Object.entries(catalogCards).map(([id,card])=><article className="card" key={id}><small>{id}</small><h3>{card.title}</h3><p>{card.detail}</p><button onClick={()=>openEditor(id)}>Añadir al dashboard</button></article>)}</div>
     <details className="card"><summary>Consultar resultados y MDX</summary><Basic version={version} queryOnly add={openEditor}/></details>
    </section>}
    <DashboardCanvas section={tab} version={version} filters={filters} onCanvas={()=>go('analisis')} seed={seed} consume={consume}/>
   </AnalyticsWorkspace>}
   {tab==='configuracion'&&<Settings health={health.data} refresh={async()=>{const result=await health.refetch({throwOnError:true});return result.data!}} track={id=>{track(id);go('historial')}}/>}
   </div>
  </main>
 </div>
}
