import {useEffect,useState} from 'react'
import {motion,useReducedMotion} from 'motion/react'
import {Icon} from './Icon'

const links=[['inicio','Inicio'],['que-es','Qué es'],['flujo','Cómo funciona'],['tecnologias','Tecnologías'],['vista-previa','Vista previa']]
const steps=[
 ['upload','Importar','Sube los archivos de instituciones y programas del SNIES.'],
 ['check','Validar y transformar','Mercury revisa las hojas e integra los registros en la bodega.'],
 ['cube','Procesar el cubo','Mercury sincroniza y publica los datos para que puedas consultarlos.'],
 ['chart','Explorar','Analiza la oferta educativa con gráficos, tablas y exportaciones.'],
] as const
const technologies=[
 ['data','Carga y validación','Python, FastAPI y PostgreSQL'],
 ['cube','Bodega y cubo','SQL Server y SSAS multidimensional'],
 ['code','Consultas y procesamiento','ASP.NET Core, ADOMD.NET y AMO'],
 ['grid','Interfaz y visualización','React, Vite, TypeScript, Tailwind CSS y ECharts'],
] as const
export function Logo(){return <img className="wordmark" src="/logo.png" alt="Mercury" width="145" height="49"/>}
export default function Landing(){
 const [open,setOpen]=useState(false)
 const [scrolled,setScrolled]=useState(()=>window.scrollY>8)
 useEffect(()=>{
  const update=()=>setScrolled(window.scrollY>8)
  update()
  window.addEventListener("scroll",update,{passive:true})
  return ()=>window.removeEventListener("scroll",update)
 },[])
 const reduced=useReducedMotion()
 const appear=reduced?{}:{initial:{opacity:0,y:14},animate:{opacity:1,y:0},transition:{duration:.65}}
 return <div className="landing">
  <header className={scrolled?"site-head scrolled":"site-head"}><a href="#inicio" aria-label="Mercury, inicio"><Logo/></a>
   <button className="mobile-menu" aria-expanded={open} aria-controls="site-links" onClick={()=>setOpen(!open)}><Icon name={open?'close':'menu'} size={18}/>Menú</button>
   <nav id="site-links" aria-label="Navegación principal" className={open?'links open':'links'}>
    {links.map(([id,label])=><a href={'#'+id} key={id} onClick={()=>setOpen(false)}>{label}</a>)}
    <a className="primary mobile-cta" href="/app">Entrar a la plataforma <Icon name="arrow" size={17}/></a>
   </nav>
   <a className="primary nav-cta" href="/app">Entrar a la plataforma <Icon name="arrow" size={17}/></a>
  </header>
  <main>
   <section className="hero" id="inicio">
    <div className="hero-image" aria-hidden="true"><img src="/hero.webp" alt="" width="1600" height="900" fetchPriority="high"/></div>
    <motion.div className="hero-copy" {...appear}>
     <h1>Transforma datos en decisiones claras</h1>
     <p>Convierte archivos del SNIES en información explorable. Carga, procesa y visualiza la oferta educativa de Colombia desde Mercury.</p>
     <div className="actions"><a className="primary" href="/app">Entrar a la plataforma <Icon name="arrow" size={18}/></a><a className="secondary" href="#flujo">Conocer cómo funciona <Icon name="down" size={17}/></a></div>
    </motion.div>
   </section>
   <section className="section intro" id="que-es"><div><p className="eyebrow">Qué es Mercury</p><h2>Una vista más clara de la oferta educativa</h2></div>
    <p>Mercury reúne la carga de archivos, el procesamiento incremental y la exploración de programas e instituciones de educación superior del SNIES.</p>
   </section>
   <section className="section flow" id="flujo"><p className="eyebrow">Cómo funciona</p><h2>Del archivo al análisis</h2>
    <div className="step-grid">{steps.map(([icon,title,copy])=><article key={title}><span className="landing-icon"><Icon name={icon} size={23}/></span><h3>{title}</h3><p>{copy}</p></article>)}</div>
   </section>
   <section className="section intro" id="tecnologias"><div><p className="eyebrow">Tecnologías</p><h2>Cómo se construyó</h2></div>
    <dl className="stack">{technologies.map(([icon,title,copy])=><div key={title}><dt><span className="landing-icon"><Icon name={icon} size={18}/></span>{title}</dt><dd>{copy}</dd></div>)}</dl>
   </section>
   <section className="section preview" id="vista-previa"><div><p className="eyebrow">Vista previa</p><h2>De una pregunta a un gráfico</h2><p>Abre una consulta preparada o combina dimensiones y medidas en el editor avanzado. Cada visual tiene una tabla vinculada y opciones de exportación.</p><a className="primary" href="/app">Explorar la plataforma <Icon name="arrow" size={18}/></a></div>
    <div className="sample" aria-label="Vista ilustrativa sin datos SNIES"><div className="sample-head"><span className="landing-icon"><Icon name="chart" size={24}/></span><div><p className="eyebrow">Vista ilustrativa</p><h3>Oferta por período</h3></div></div><div className="sample-bars" aria-hidden="true">{[30,49,42,65,57,85,73,93].map((h,i)=><i key={i} style={{height:h+'%'}}/>)}</div></div>
   </section>
  </main>
  <footer className="site-foot"><Logo/><p>Mercury · Plataforma de análisis educativo. Fuente de datos SNIES.</p><a href="#inicio">Volver al inicio <Icon name="up" size={16}/></a></footer>
 </div>
}
