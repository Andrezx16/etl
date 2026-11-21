import {useCallback,useId,useLayoutEffect,useRef,useSyncExternalStore,type ReactNode} from 'react'
import {Icon} from './Icon'

export function useMediaQuery(query:string){
 const subscribe=useCallback((listener:()=>void)=>{
  const media=matchMedia(query)
  media.addEventListener('change',listener)
  return ()=>media.removeEventListener('change',listener)
 },[query])
 return useSyncExternalStore(subscribe,()=>matchMedia(query).matches)
}

export function SideDrawer({id,title,side='left',onClose,children}:{id?:string;title:string;side?:'left'|'right';onClose:()=>void;children:ReactNode}){
 const drawer=useRef<HTMLDialogElement>(null)
 const heading=useId()
 useLayoutEffect(()=>{
  const dialog=drawer.current!
  dialog.showModal()
  return ()=>dialog.close()
 },[])
 function close(){drawer.current?.close();onClose()}
 return <dialog id={id} ref={drawer} className={'side-drawer '+(side==='right'?'side-drawer-right':'')} aria-labelledby={heading}
  onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===e.currentTarget)close()}}>
  <div className="side-drawer-inner">
   <header><h2 id={heading}>{title}</h2><button type="button" aria-label={'Cerrar '+title.toLowerCase()} onClick={close}><Icon name="close" size={20}/></button></header>
   <div className="side-drawer-body">{children}</div>
  </div>
 </dialog>
}
