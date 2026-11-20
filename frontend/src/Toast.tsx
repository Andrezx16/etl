import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {Icon} from './Icon'

type Tone='success'|'info'|'error'
type Notify=(text:string,tone?:Tone)=>void
const ToastContext=createContext<Notify>(()=>{})
export const useToast=()=>useContext(ToastContext)

export function ToastProvider({children}:{children:ReactNode}){
 const [notice,setNotice]=useState<{text:string;tone:Tone}>()
 const [hovered,setHovered]=useState(false)
 const [focused,setFocused]=useState(false)
 const popover=useRef<HTMLDivElement>(null)
 const notify=useCallback<Notify>((text,tone='success')=>setNotice({text,tone}),[])
 useEffect(()=>{
  const element=popover.current
  if(!notice||!element)return
  if(!element.matches(':popover-open'))element.showPopover()
  return ()=>element.hidePopover()
 },[notice])
 useEffect(()=>{
  if(!notice||hovered||focused)return
  const timer=window.setTimeout(()=>setNotice(undefined),notice.tone==='error'?9500:5500)
  return ()=>window.clearTimeout(timer)
 },[notice,hovered,focused])
 return <ToastContext.Provider value={notify}>
  {children}
  <div className="sr-only" role="status" aria-atomic="true">{notice?.tone!=='error'?notice?.text:undefined}</div>
  <div className="sr-only" role="alert" aria-atomic="true">{notice?.tone==='error'?notice.text:undefined}</div>
  <div ref={popover} popover="manual" className="mercury-toast" data-tone={notice?.tone}
   onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)}
   onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}>
   <span className="toast-mark" aria-hidden="true">{notice?.tone==='success'?'✓':notice?.tone==='error'?'!':'i'}</span>
   <p className="toast-copy" aria-hidden="true">{notice?.text}</p>
   <button type="button" aria-label="Cerrar aviso" onClick={()=>{setHovered(false);setFocused(false);setNotice(undefined)}}><Icon name="close" size={18}/></button>
  </div>
 </ToastContext.Provider>
}
