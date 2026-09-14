(() => {
  const input = document.getElementById('chatFiles');
  const list = document.getElementById('chatAttachments');
  let files = [], reading = false;
  function render() {
    list.replaceChildren();
    files.forEach((file, index) => {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'quick-btn'; chip.textContent = file.name + ' ×';
      chip.setAttribute('aria-label', file.name + ' 첨부 취소');
      chip.onclick = () => { if (!document.getElementById('sendBtn').disabled) { files.splice(index, 1); render(); } };
      list.append(chip);
    });
  }
  async function attach(selected) {
    if (reading || document.getElementById('sendBtn').disabled) return;
    if (files.length + selected.length > 4 || selected.some(f => f.size > 4*1024*1024) || [...files,...selected].reduce((n,f)=>n+f.size,0)>12*1024*1024) { alert('최대 4개, 파일당 4MB, 전체 12MB까지 첨부할 수 있습니다.'); return; }
    reading = true;
    try {
      for (const file of selected) {
        if (!/\.(png|jpe?g|webp|pdf|txt|csv|md)$/i.test(file.name)) throw new Error('PNG·JPG·WebP·PDF·TXT·CSV·MD 파일을 지원합니다.');
        const data = await new Promise((resolve,reject) => { const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(new Error('파일을 읽지 못했습니다.')); r.readAsDataURL(file); });
        files.push({name:file.name,size:file.size,data});
      }
    } catch(e) { alert(e.message); } finally { reading=false; render(); }
  }
  input.onchange = () => { attach(Array.from(input.files)); input.value=''; };
  document.getElementById('attachFilesBtn').onclick = () => { if (!reading && !document.getElementById('sendBtn').disabled) input.click(); };
  document.getElementById('composer').addEventListener('paste', event => {
    const pasted=Array.from(event.clipboardData?.files||[]);
    if(pasted.length){event.preventDefault();attach(pasted);}
  });
  window.adminAttachments = { get:()=>files.map(({name,data})=>({name,data})), ready:()=>!reading, clear:()=>{files=[];render();} };
})();
