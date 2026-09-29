// Anonymous booking journey only; never send contact details, dates or clinical text.
(() => {
  if(location.hostname==='localhost'||location.hostname==='127.0.0.1'||navigator.webdriver||new URLSearchParams(location.search).has('test'))return;
  let session;try{session=sessionStorage.getItem('lofi_booking_session');if(!session){session=crypto.randomUUID();sessionStorage.setItem('lofi_booking_session',session);}}catch{return;}
  const sent=new Set();
  const track=step=>{
    if(sent.has(step))return;sent.add(step);
    fetch('/api/booking-funnel',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({step,session,acquisition:window.lofiAttribution?.get()})}).catch(()=>{});
  };
  window.lofiFunnel={session,track};
  document.addEventListener('click',event=>{const a=event.target.closest('a');if(a&&/^\/reservation(?:\/|$)/.test(new URL(a.href,location.href).pathname))track('booking_open');});
  if(/^\/reservation(?:\/|$)/.test(location.pathname)&&!location.pathname.includes('received'))track('booking_open');
  if(location.pathname.includes('/reservation/concerns')){
    document.addEventListener('input',()=>track('details_started'),{once:true});
    document.addEventListener('change',()=>track('details_started'),{once:true});
  }
})();
