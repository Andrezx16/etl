const paths={
 arrow:'M4 12h15m-6-6 6 6-6 6',
 down:'M12 4v15m-6-6 6 6 6-6',
 up:'M12 20V5m-6 6 6-6 6 6',
 menu:'M4 6h16M4 12h16M4 18h16',
 close:'m6 6 12 12M18 6 6 18',
 upload:'M12 16V4m-4 4 4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
 check:'M12 22s8-3 8-10V6l-8-4-8 4v6c0 7 8 10 8 10Zm-4-10 3 3 5-5',
 cube:'m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9',
 chart:'M4 4v16h16M8 15v-3m5 3V9m5 6V6',
 data:'M20 5c0 1.7-3.6 3-8 3S4 6.7 4 5m16 0c0-1.7-3.6-3-8-3S4 3.3 4 5m16 0v14c0 1.7-3.6 3-8 3s-8-1.3-8-3V5m16 7c0 1.7-3.6 3-8 3s-8-1.3-8-3',
 code:'m8 6-6 6 6 6m8-12 6 6-6 6m-3-13-2 14',
 grid:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
 book:'M12 6v14m0-14c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z',
 wallet:'M20 9V6a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1v-3m0-6h-4a3 3 0 0 0 0 6h4a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1Zm-4 3h.01',
 clock:'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
}

export function Icon({name,size=20}:{name:keyof typeof paths;size?:number}){
 return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>
}
