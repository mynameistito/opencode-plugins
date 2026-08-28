/** Static client-only viewer. It never sends the fragment to the Worker. */
export const viewer = (origin: string): Response =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OpenCode Share</title><main><h1>OpenCode Share</h1><p id="status">Decrypting locally...</p><pre id="content"></pre></main><style>body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem}pre{white-space:pre-wrap;overflow:auto;background:#f4f4f4;padding:1rem;border-radius:8px}</style><script type="module">const status=document.querySelector('#status'),content=document.querySelector('#content');const id=location.pathname.split('/').pop();const key=location.hash.slice(1);const b=v=>{const p=v.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(p+'='.repeat((4-p.length%4)%4)),c=>c.charCodeAt(0))};try{if(!id||!key)throw Error('Missing share key');const r=await fetch('/api/shares/'+encodeURIComponent(id));if(!r.ok)throw Error('Share unavailable');const p=await r.json();const k=await crypto.subtle.importKey('raw',b(key),{name:'AES-GCM'},false,['decrypt']);const text=new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:b(p.iv)},k,b(p.ciphertext)));content.textContent=text;status.textContent='Decrypted locally. The server never received the key.'}catch(e){status.textContent=e instanceof Error?e.message:'Unable to decrypt share'}</script>`,
    {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      },
    }
  );
