export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
 const upload = body instanceof FormData
 const response = await fetch('/api'+path,{method:method ?? (body===undefined?'GET':'POST'),
  headers:body===undefined || upload ? undefined : {'Content-Type':'application/json'},
  body:body===undefined?undefined:upload?body:JSON.stringify(body)})
 if(!response.ok){
  const problem=await response.json().catch(()=>null)
  throw new Error(typeof problem?.message==='string'?problem.message:'La plataforma no pudo completar la solicitud.')
 }
 return (response.status===204?undefined:await response.json()) as T
}
export async function download(resultId:string,format:string,view:Record<string,unknown>){
 const response=await fetch('/api/analytics/export',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({result_id:resultId,format,...view})})
 if(!response.ok) throw new Error('No se pudo exportar. Ejecuta de nuevo la consulta.')
 saveFile(await response.blob(),'mercury.'+format)
}
export function saveFile(blob:Blob,name:string){
 const url=URL.createObjectURL(blob)
 const a=document.createElement('a')
 a.href=url
 a.download=name
 a.click()
 setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export const date=(s:string|null|undefined)=>s?new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(s)):'—'
export type Cell=string|number|boolean|null
export type Result={resultId:string;queryId:string;cubeVersion:string;columns:{key:string;label:string;type:string}[];rows:Record<string,Cell>[];totalRows:number;truncated:boolean;filtersApplied?:Record<string,unknown>}
export type Query={dimension:string;second?:string|null;measures:string[];limit:number;year?:number;filters?:Record<string,string[]>;start?:number;end?:number;date_role?:string;order?:string}
export type Option={id:string;label:string}
export type Metadata={dimensions:Option[];measures:Option[]}
export type Run={id:string;created:string;started:string|null;ended:string|null;state:string;stage:string;error:string|null;checkpoint:number;files:string[];
 detail:{published_version?:string;etl_id?:string;etl?:{carga?:{hecho?:{nuevos:number;actualizados:number;sin_cambios:number}};validacion?:Record<string,{rechazados:number}>;staging?:Record<string,{rechazados:number}>};events?:{name:string;state:string;at:string}[]}}
export type Health={publication?:{published:string;programs:number}|null;setupReady?:boolean;postgres:string;sqlServer:string;ssas:string;versions:Record<string,string>;lastRun:Run|null;published:boolean;pending:boolean}
