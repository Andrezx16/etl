import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {api} from './client'
import {useToast} from './Toast'

type Decision='APROBADA'|'RECHAZADA'|'PENDIENTE'
type Case={
 id_homologacion:number; nivel:string; valor_original:string; departamento_ref:string|null
 valor_homologado:string|null; clasificacion:'REVISION'|'ADVERTENCIA'; estado_revision:Decision
 opciones:{nombre:string;puntaje:number}[]
}
type Review={rows:Case[];more:boolean;canReprocess:boolean}
const labels={APROBADA:'Corrección guardada',RECHAZADA:'Original conservado',PENDIENTE:'Pendiente'}
const score=new Intl.NumberFormat('es-CO',{maximumFractionDigits:2})

function ReviewCase({item,busy,onDecision}:{item:Case;busy:boolean;onDecision:(estado:Decision,valor?:string)=>void}){
 const [choice,setChoice]=useState('')
 const proposed=item.opciones.find(option=>option.nombre===item.valor_homologado)??item.opciones[0]
 const selected=item.opciones.find(option=>option.nombre===choice)??proposed
 const saved=item.estado_revision==='APROBADA'?item.valor_homologado:null
 const exact=item.opciones.find(option=>option.puntaje===100)
 return <article className="geography-case">
  <header className="geography-case-header">
   <div>
    <h4>{item.valor_original}</h4>
    <p>{item.nivel==='MUNICIPIO'?'Municipio':'Departamento'}{item.departamento_ref&&` · ${item.departamento_ref}`} · {item.clasificacion==='REVISION'?'Revisión registrada':'Advertencia registrada'}</p>
   </div>
   <span className="pill">{labels[item.estado_revision]}</span>
  </header>
  {exact&&<p className="geography-match">El catálogo actual ya tiene una coincidencia exacta.</p>}
  {saved&&<p><strong>Corrección elegida</strong> {saved}</p>}
  {selected&&<details className="geography-picker">
   <summary>
    <span>Opción del catálogo DANE<strong>{selected.nombre}</strong></span>
    <span className="geography-score">{score.format(selected.puntaje)} / 100</span>
   </summary>
   <ul aria-label="Opciones del catálogo DANE">
    {item.opciones.map(option=><li key={option.nombre}>
     <button type="button" disabled={busy} aria-pressed={selected.nombre===option.nombre}
      onClick={e=>{
       setChoice(option.nombre)
       const picker=e.currentTarget.closest('details')
       if(picker){picker.open=false;picker.querySelector('summary')?.focus()}
      }}>
      <span>{option.nombre}{item.estado_revision==='PENDIENTE'&&option.nombre===item.valor_homologado&&<small>Propuesta de Mercury</small>}</span>
      <span className="geography-score">{score.format(option.puntaje)} / 100</span>
     </button>
    </li>)}
   </ul>
  </details>}
  <div className="actions geography-actions">
   {selected&&<button disabled={busy||saved===selected.nombre} onClick={()=>onDecision('APROBADA',selected.nombre)}>Usar este nombre</button>}
   <button disabled={busy||item.estado_revision==='RECHAZADA'} onClick={()=>onDecision('RECHAZADA')}>Conservar original</button>
   {item.estado_revision!=='PENDIENTE'&&<button disabled={busy} onClick={()=>{setChoice('');onDecision('PENDIENTE')}}>Restablecer decisión</button>}
  </div>
 </article>
}

export default function GeographyReview({runId,onReprocess}:{runId:string;onReprocess:(id:string)=>void}){
 const [offset,setOffset]=useState(0)
 const cache=useQueryClient()
 const notify=useToast()
 const path='/runs/'+runId+'/geography'
 const review=useQuery({queryKey:['geography',runId,offset],queryFn:()=>api<Review>(path+'?offset='+offset),retry:false})
 const decision=useMutation({
  mutationFn:({id,estado,valor}:{id:number;estado:Decision;valor?:string})=>api(path+'/'+id,{estado,valor},'PUT'),
  onSuccess:async(_,request)=>{
   await cache.invalidateQueries({queryKey:['geography']})
   notify(request.estado==='PENDIENTE'?'Decisión restablecida.':'Decisión guardada para la próxima carga.','success')
  },
  onError:error=>notify(error.message,'error'),
 })
 const reprocess=useMutation({
  mutationFn:()=>api<{id:string}>(path+'/reprocess',{}),
  onSuccess:async result=>{
   void cache.invalidateQueries({queryKey:['history']})
   void cache.invalidateQueries({queryKey:['health']})
   onReprocess(result.id)
   notify('Los Excel se enviaron a la cola de procesamiento.','success')
  },
  onError:error=>notify(error.message,'error'),
 })
 const busy=decision.isPending||reprocess.isPending
 return <section className="card geography-review">
  <div className="between">
   <h3>Revisión geográfica</h3>
   {review.data?.canReprocess&&<button className="primary" disabled={busy} onClick={()=>reprocess.mutate()}>Volver a procesar estos Excel</button>}
  </div>
  <p>Estos casos se detectaron al procesar esta carga. Las decisiones se aplican en el próximo procesamiento. El puntaje compara los nombres completos.</p>
  {review.isPending&&<p role="status">Consultando casos…</p>}
  {review.error&&<p className="notice" role="status">{review.error.message} <button onClick={()=>void review.refetch()}>Reintentar</button></p>}
  {review.data?.rows.map(item=><ReviewCase key={item.id_homologacion} item={item} busy={busy}
   onDecision={(estado,valor)=>decision.mutate({id:item.id_homologacion,estado,valor})}/>)}
  {review.data&&!review.data.rows.length&&<p className="empty">Esta carga no tiene nombres marcados para revisión.</p>}
  {(offset>0||review.data?.more)&&<div className="actions">
   <button disabled={!offset||busy} onClick={()=>setOffset(offset-10)}>Anterior</button>
   <button disabled={!review.data?.more||busy} onClick={()=>setOffset(offset+10)}>Siguiente</button>
  </div>}
 </section>
}
