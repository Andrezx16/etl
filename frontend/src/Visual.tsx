import {useEffect,useMemo,useRef,useState,type RefObject} from 'react'
import {useQuery} from '@tanstack/react-query'
import {flexRender,getCoreRowModel,getPaginationRowModel,useReactTable} from '@tanstack/react-table'
import * as echarts from 'echarts'
import {useToast} from './Toast'
import {api,download,type Cell,type Result,type Query} from './client'

export const choices=[
 ['bar','Columnas'],['horizontal','Barras'],['line','Líneas'],['area','Áreas'],['stack','Columnas apiladas'],
 ['percent','Apiladas al 100 %'],['combo','Columnas y línea'],['donut','Dona'],['pie','Circular'],['scatter','Dispersión'],
 ['treemap','Mapa de árbol'],['funnel','Embudo'],['kpi','Indicador'],['gauge','Medidor'],['heatmap','Mapa de calor'],['matrix','Matriz'],['table','Tabla']
]
const palette=['#000080','#3B6FD8','#2BB3C0','#F2A93B','#E0607E','#7A5CC9','#3FA37A','#8A94A6']
const fmt=new Intl.NumberFormat('es-CO',{maximumFractionDigits:2})
const format=(v:Cell|undefined)=>v===null||v===undefined?'—':typeof v==='number'?fmt.format(v):String(v)
const measureKind=(s:string)=>/pct|dif vs|crecimiento/i.test(s)?"percent":/matr[ií]cula/i.test(s)?"currency":/cr[eé]ditos/i.test(s)?"credits":"count"
const percentage=new Intl.NumberFormat("es-CO",{style:"percent",maximumFractionDigits:2})
const currency=new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:2})
const display=(v:Cell|undefined,label:string)=>typeof v==="number"&&/dif vs/i.test(label)?fmt.format(v*100)+" pp":typeof v==="number"&&measureKind(label)==="percent"?percentage.format(v):typeof v==="number"&&measureKind(label)==="currency"?currency.format(v):format(v)
const dimensions=(result:Result)=>result.columns.filter(c=>c.key.startsWith('d'))
const measures=(result:Result)=>result.columns.filter(c=>c.key.startsWith('m'))
export const caption=(result:Result,row:Record<string,Cell>)=>dimensions(result).map(c=>format(row[c.key])).join(' / ')
const compactMoney=new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',notation:'compact',maximumFractionDigits:1})
const paletteTheme={color:palette,textStyle:{fontFamily:'Quicksand, sans-serif'}}
export function Table({result,rows}:{result:Result;rows:Result['rows']}){
 const columns=useMemo(()=>result.columns.map(c=>({accessorKey:c.key,header:c.label,cell:({getValue}:{getValue:()=>unknown})=>display(getValue() as Cell,c.label)})),[result.columns])
 const table=useReactTable({data:rows,columns,getCoreRowModel:getCoreRowModel(),getPaginationRowModel:getPaginationRowModel(),initialState:{pagination:{pageIndex:0,pageSize:12}}})
 return <><div className="table-over"><table><thead>{table.getHeaderGroups().map(group=><tr key={group.id}>{group.headers.map(h=><th key={h.id}>{flexRender(h.column.columnDef.header,h.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map(r=><tr key={r.id}>{r.getVisibleCells().map(c=><td key={c.id}>{flexRender(c.column.columnDef.cell,c.getContext())}</td>)}</tr>)}</tbody></table></div>
 <div className="actions pagination"><button onClick={()=>table.previousPage()} disabled={!table.getCanPreviousPage()}>Anterior</button><span>{rows.length?table.getState().pagination.pageIndex+1:0} / {table.getPageCount()} · {rows.length} filas</span><button onClick={()=>table.nextPage()} disabled={!table.getCanNextPage()}>Siguiente</button></div></>
}
function options(result:Result,rows:Result['rows'],kind:string,compact:boolean):echarts.EChartsOption|null{
 const cols=measures(result)
 const labels=rows.map(r=>caption(result,r))
 const numeric=cols.map(c=>rows.map(r=>typeof r[c.key]==='number'?Number(r[c.key]):null))
 const points=labels.map((name,i)=>({name,value:numeric[0]?.[i]??null}))
 const base:echarts.EChartsOption={...paletteTheme,animation:!matchMedia('(prefers-reduced-motion: reduce)').matches,
  tooltip:{trigger:'item',renderMode:'richText'},toolbox:compact?undefined:{feature:{saveAsImage:{title:'Guardar imagen',name:'Mercury'}}}}
 if(kind==='pie'||kind==='donut'||kind==='funnel'||kind==='treemap'){
  if(cols.length!==1||points.some(p=>p.value!==null&&p.value<0)) return null
  const data=points.filter((p):p is {name:string;value:number}=>p.value!==null)
  if(compact&&(kind==='donut'||kind==='pie')){
   const additive=/^(n[uú]mero de programas)$/i.test(cols[0].label)
   const sorted=[...data].sort((a,b)=>b.value-a.value)
   const visible=additive&&sorted.length>6?[...sorted.slice(0,6),{name:'Otros',value:sorted.slice(6).reduce((n,x)=>n+x.value,0),itemStyle:{color:'#8A94A6'}}]:sorted
   const total=data.reduce((n,x)=>n+x.value,0)
   return {...base,tooltip:{trigger:'item',renderMode:'richText',formatter:'{b}\n{c} ({d} %)'},legend:{type:'scroll',orient:'vertical',top:4,bottom:4,left:'54%',right:3,itemWidth:9,itemHeight:9,itemGap:5,pageIconSize:9,pageButtonGap:4,tooltip:{show:true},
      formatter:name=>{const label=name.length>14?name.slice(0,13)+'…':name;const item=visible.find(x=>x.name===name);return item&&total>0&&additive?label+'  '+percentage.format(item.value/total):label},
      textStyle:{fontSize:10,fontWeight:600,color:'#303957'}},
    title:kind==='donut'&&additive?{text:fmt.format(total),left:'28%',top:'center',textAlign:'center',textStyle:{fontSize:16,fontWeight:700,color:'#000080'}}:undefined,
    series:[{type:'pie',center:['28%','50%'],radius:kind==='donut'?['39%','63%']:'60%',data:visible,label:{show:false},itemStyle:{borderColor:'#fff',borderWidth:2},avoidLabelOverlap:true}]}
  }
  const series:echarts.SeriesOption=kind==='treemap'?{type:'treemap',data,roam:false}:kind==='funnel'?{type:'funnel',data,left:'15%',width:'70%'}:{type:'pie',data,radius:kind==='donut'?['42%','68%']:'67%'}
  return {...base,series:[series]}
 }
 if(kind==='gauge'){
  if(rows.length!==1||cols.length!==1||numeric[0][0]===null||numeric[0][0]<0) return null
  const value=numeric[0][0]
  return {...base,series:[{type:'gauge',max:Math.max(1,10**Math.ceil(Math.log10(value||1))),detail:{formatter:'{value}'},data:[{value,name:cols[0].label}]}]}
 }
 if(kind==='scatter'){
  if(cols.length!==2) return null
  return {...base,xAxis:{name:cols[0].label,type:'value'},yAxis:{name:cols[1].label,type:'value'},
   series:[{type:'scatter',symbolSize:11,data:points.flatMap((p,i)=>numeric[0][i]===null||numeric[1][i]===null?[]:[{name:p.name,value:[numeric[0][i],numeric[1][i]]}])}]}
 }
 if(kind==='heatmap'){
  const dims=dimensions(result)
  if(cols.length!==1||dims.length!==2) return null
  const x=Array.from(new Set(rows.map(r=>format(r[dims[0].key])))),y=Array.from(new Set(rows.map(r=>format(r[dims[1].key]))))
  const range=numeric[0].filter((v):v is number=>v!==null)
  return {...base,grid:{containLabel:true,bottom:50},xAxis:{type:'category',data:x},yAxis:{type:'category',data:y},
   visualMap:{min:Math.min(0,...range),max:Math.max(1,...range),orient:'horizontal',left:'center',bottom:0,inRange:{color:['#e5e4ff','#4b45d2']}},
   series:[{type:'heatmap',data:rows.flatMap((r,i)=>numeric[0][i]===null?[]:[[x.indexOf(format(r[dims[0].key])),y.indexOf(format(r[dims[1].key])),numeric[0][i]]])}]}
 }
 const horizontal=kind==='horizontal'
 const stacked=kind==='stack'||kind==='percent'
 const groupedBars=kind==='bar'&&cols.length===1&&dimensions(result).length===2
 const units=Array.from(new Set(cols.map(c=>measureKind(c.label))))
 const axisIndex=cols.map(c=>units.indexOf(measureKind(c.label)))
 if(horizontal&&units.length>1)return null
 if(stacked&&(dimensions(result).length!==2||cols.length!==1||numeric[0].some(v=>v!==null&&v<0)))return null
 if(kind==='combo'&&cols.length!==2) return null
 const category={type:'category' as const,data:labels,axisLabel:{hideOverlap:true,width:112,overflow:'truncate' as const}}
 const value={type:'value' as const,splitLine:{lineStyle:{color:'#e8e8f3'}},minInterval:0.01}
 const line=kind==='line'||kind==='area'
 let series:echarts.SeriesOption[]=cols.map((c,i)=>line || (kind==='combo'&&i===1)
 ?{name:c.label,type:'line',smooth:false,data:numeric[i],symbolSize:compact?3:6,showSymbol:!compact,areaStyle:kind==='area'?{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#00008033'},{offset:1,color:'#00008005'}])}:undefined,yAxisIndex:axisIndex[i],tooltip:{valueFormatter:v=>display(v as Cell,c.label)},lineStyle:{width:compact?2:1,type:/movil|móvil/i.test(c.label)?'dashed':'solid'}}
 :{name:c.label,type:'bar',data:numeric[i],barMaxWidth:38,yAxisIndex:horizontal?0:axisIndex[i],tooltip:{valueFormatter:v=>display(v as Cell,c.label)},itemStyle:{borderRadius:[5,5,0,0]}})
 let grouped=labels
 if(stacked||groupedBars){
  const [first,second]=dimensions(result)
  grouped=Array.from(new Set(rows.map(r=>format(r[first.key]))))
  const groups=Array.from(new Set(rows.map(r=>format(r[second.key]))))
  const cells=new Map(rows.map((r,i)=>[JSON.stringify([format(r[first.key]),format(r[second.key])]),numeric[0][i]]))
  const sums=grouped.map(a=>groups.reduce((total,b)=>total+(cells.get(JSON.stringify([a,b]))??0),0))
  series=groups.map(b=>({type:'bar',name:b,stack:stacked?'total':undefined,barMaxWidth:32,data:grouped.map((a,i)=>{
   const v=cells.get(JSON.stringify([a,b]))
   return v==null?null:kind==='percent'&&sums[i]>0?100*v/sums[i]:v
  })}))
 }
 const valueAxes=units.map((unit,i)=>({...value,position:i===0?'left' as const:'right' as const,offset:Math.max(0,i-1)*52,splitLine:{show:i===0,lineStyle:{color:'#e8e8f3'}},
  axisLabel:{formatter:(n:number)=>kind==='percent'?n+'%':unit==='percent'?percentage.format(n):unit==='currency'?compactMoney.format(n):fmt.format(n)}}))
 const zoom=grouped.length>15
 const zoomSize=compact?11:17
 const showLegend=!(compact&&cols.length===1&&!groupedBars&&!stacked)
 const tooltip={trigger:'axis' as const,renderMode:'richText' as const,valueFormatter:(v:unknown)=>typeof v==='number'?fmt.format(v):String(v??'—')}
 return {...base,grid:{left:14,right:units.length>2?65:zoom&&horizontal?26:22,top:showLegend?(compact?36:55):12,bottom:zoom&&!horizontal?zoomSize+24:12,containLabel:true},legend:showLegend?{top:compact?2:10,left:compact?5:0,right:8,type:'scroll',textStyle:{fontSize:10}}:undefined,
  tooltip,xAxis:horizontal?{...value,axisLabel:valueAxes[0]?.axisLabel}:{...category,data:grouped},
  yAxis:horizontal?{...category,inverse:true}:valueAxes,
  dataZoom:zoom?[{type:'slider',orient:horizontal?'vertical':'horizontal',end:compact&&line?100:Math.min(100,1500/grouped.length),showDetail:false,brushSelect:false,...(horizontal?{right:3,width:zoomSize}:{bottom:3,height:zoomSize})},{type:'inside',orient:horizontal?'vertical':'horizontal'}]:undefined,series}
}
const noPick=()=>{}
function Chart({result,rows,kind,onPick=noPick,compact=false,instance}:{result:Result;rows:Result['rows'];kind:string;onPick?:(s:string)=>void;compact?:boolean;instance?:RefObject<echarts.ECharts|null>}){
 const ref=useRef<HTMLDivElement>(null)
 const option=useMemo(()=>options(result,rows,kind,compact),[result,rows,kind,compact])
 useEffect(()=>{
  const host=ref.current
  if(!host||!option)return
  let chart:echarts.ECharts|undefined
  function resize(){
   if(!host?.clientWidth||!host.clientHeight)return
   if(!chart){
    chart=echarts.init(host)
    chart.setOption(option!)
    chart.on('click',e=>{if(e.name)onPick(e.name)})
    if(instance)instance.current=chart
   }else chart.resize()
  }
  const observer=new ResizeObserver(resize)
  observer.observe(host)
  resize()
  return ()=>{observer.disconnect();chart?.dispose();if(instance)instance.current=null}
 },[option,onPick,instance])
 return option?<div className="chart" ref={ref} role="img" aria-label={'Gráfico '+kind+' de '+result.queryId}/>:<div className="empty">Esta visualización requiere una combinación compatible. Los datos siguen disponibles en la tabla.</div>
}
export function ChartSnapshot({result,kind,instance,onPick}:{result:Result;kind:string;instance?:RefObject<echarts.ECharts|null>;onPick?:(value:string)=>void}){
 if(!result.rows.length)return <p className="board-state">Sin filas para los filtros seleccionados.</p>
 if(kind==='table')return <Table result={result} rows={result.rows}/>
 if(kind==='matrix')return <Matrix result={result} rows={result.rows}/>
 if(kind==='kpi'){
  if(result.rows.length!==1)return <p className="board-state">El indicador requiere un total o un solo miembro.</p>
  return <div className="metric-grid">{measures(result).map(c=><div key={c.key}><strong>{display(result.rows[0][c.key],c.label)}</strong><p>{c.label}</p></div>)}</div>
 }
 return <Chart result={result} rows={result.rows} kind={kind} compact instance={instance} onPick={onPick}/>
}
export function Visual({catalog,query,kind,version,cross,onCross,catalogFilter,insight}:{catalog?:string;query?:Query;kind:string;version?:string;cross?:string;onCross?:(s:string)=>void;catalogFilter?:{labels:string[];start?:number;end?:number};insight?:boolean}){
 const response=useQuery({queryKey:['visual',version,catalog,query,catalogFilter],queryFn:()=>catalog?api<Result>('/analytics/catalog/'+catalog+'/execute',catalogFilter??{}):api<Result>('/analytics/query',query),retry:false})
 return response.isPending?<div className="empty" aria-busy="true">Consultando el cubo…</div>:response.error?<div className="empty" role="status">{response.error.message} <button onClick={()=>response.refetch()}>Volver a consultar</button></div>:<ResultView key={response.data.resultId} result={response.data} kind={kind} cross={cross} onCross={onCross} insight={insight}/>
}
function Matrix({result,rows}:{result:Result;rows:Result["rows"]}){
 const dims=dimensions(result), cols=measures(result)
 if(dims.length!==2||cols.length!==1)return <p className="notice">La matriz requiere dos dimensiones y una medida.</p>
 const [a,b]=dims,[m]=cols
 const prefixes=Array.from(new Set(rows.map(r=>format(r[a.key]))))
 const headers=Array.from(new Set(rows.map(r=>format(r[b.key]))))
 if(headers.length>50)return <p className="notice">La matriz admite hasta 50 columnas. Usa la tabla para ver todas las filas.</p>
 const values=new Map(rows.map(r=>[JSON.stringify([format(r[a.key]),format(r[b.key])]),r[m.key]]))
 return <div className="table-over"><table><caption>{m.label}</caption><thead><tr><th>{a.label}</th>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{prefixes.map(p=><tr key={p}><th>{p}</th>{headers.map(h=><td key={h}>{format(values.get(JSON.stringify([p,h])))}</td>)}</tr>)}</tbody></table></div>
}
function ResultView({result,kind,cross,onCross,insight}:{result:Result;kind:string;cross?:string;onCross?:(s:string)=>void;insight?:boolean}){
 const [table,setTable]=useState(kind==='table'),[search,setSearch]=useState(''),[sort,setSort]=useState(''),[descending,setDescending]=useState(false),[member,setMember]=useState('')
 const notify=useToast()
 const [drill,setDrill]=useState<number>()
 const current=cross??member
 const names=useMemo(()=>Array.from(new Set(result.rows.map(r=>caption(result,r)))).filter(Boolean),[result])
 const rows=useMemo(()=>{
  const normalized=search.trim().toLowerCase()
  const filtered=result.rows.filter(row=>(!current||caption(result,row)===current)&&(!normalized||Object.values(row).some(v=>v!==null&&String(v).toLowerCase().includes(normalized))))
  return sort?filtered.sort((a,b)=>{
   const x=a[sort],y=b[sort]
   if(x==null)return y==null?0:1
   if(y==null)return -1
   return (typeof x==='number'&&typeof y==='number'?x-y:String(x)<String(y)?-1:String(x)>String(y)?1:0)*(descending?-1:1)
  }):filtered
 },[current,result,search,sort,descending])
 const peak=insight&&rows.length>1?rows.reduce<Record<string,Cell>|undefined>((best,row)=>typeof row.m0==='number'&&(!best||Number(row.m0)>Number(best.m0))?row:best,undefined):undefined
 const choose=useMemo(()=> (s:string)=>{if(names.includes(s)){if(onCross)onCross(current===s?'':s);else setMember(current===s?'':s)}},[current,names,onCross])
 async function get(format:string){try{await download(result.resultId,format,{search,sort,descending,member:current})}catch(e){notify(e instanceof Error?e.message:'No se pudo exportar.','error')}}
 if(drill!==undefined)return <div className="visual"><div className="actions"><button onClick={()=>setDrill(undefined)}>Volver a los años</button><strong>Meses de {drill}</strong></div><Visual query={{dimension:"anio",measures:["programas"],limit:12,year:drill}} kind="line" version={result.cubeVersion}/></div>
 return <div className="visual">
  <div className="actions visual-controls"><label>Filtrar filas <select value={current} onChange={e=>onCross?onCross(e.target.value):setMember(e.target.value)}><option value="">Todos los miembros</option>{names.map(n=><option key={n}>{n}</option>)}</select></label>
   {result.queryId==="S2"&&/^(19|20|21)[0-9]{2}$/.test(current)&&<button onClick={()=>setDrill(Number(current))}>Ver meses de {current}</button>}
   {kind!=='table'&&<button onClick={()=>setTable(!table)}>{table?'Ver gráfico':'Ver tabla'}</button>}
  </div>
  {result.truncated&&<p className="notice">El cubo devolvió más filas que el límite de esta vista. La tabla y la exportación incluyen las filas mostradas.</p>}
  {!table&&kind!=='table'&&(!rows.length?<div className="empty">La consulta no devolvió filas para estos filtros.</div>:kind==='kpi'
   ?rows.length===1?<div className="metric-grid">{measures(result).map(c=><div key={c.key}><strong>{format(rows[0][c.key])}</strong><p>{c.label}</p></div>)}</div>:<div className="empty">Selecciona un miembro para ver sus indicadores.</div>
   :kind==="matrix"?<Matrix result={result} rows={rows}/>:<Chart result={result} rows={rows} kind={kind} onPick={choose}/>)}
  {(table||kind==='table')&&<><div className="actions visual-controls">
   <label>Buscar <input value={search} maxLength={150} onChange={e=>setSearch(e.target.value)}/></label>
   <label>Ordenar <select value={sort} onChange={e=>setSort(e.target.value)}><option value="">Orden del cubo</option>{result.columns.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
   {sort&&<button onClick={()=>setDescending(!descending)}>{descending?'Descendente':'Ascendente'}</button>}
  </div><Table result={result} rows={rows}/><div className="actions visual-controls"><button onClick={()=>get('csv')}>Exportar CSV</button><button onClick={()=>get('xlsx')}>Exportar XLSX</button></div></>}
  {peak&&!table&&<p className="bi-insight"><strong>Mayor valor visible</strong> {caption(result,peak)}: {display(peak.m0,measures(result)[0]?.label??'')} {measures(result)[0]?.label.toLocaleLowerCase('es')}.</p>}
  <small>Versión publicada {result.cubeVersion.slice(0,8)}</small>
 </div>
}
