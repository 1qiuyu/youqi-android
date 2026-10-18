/* Cloud companion. Exact pixel colors, native-only persistence, confirmed app actions. */
(() => {
  'use strict';
  const host=window.YunduoHost;
  if (!host || !window.PIXEL_MAPS) return;
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const defaults={cat:'#f6d5a0',line:'#4b3527',cloud:'#fff6e2',cloudLine:'#a5b8c0'};
  const settings={visible:true,palette:'white',colors:{...defaults},outline:false,saveHistory:false,edge:'right',ratio:.62};
  try {
    const saved=JSON.parse(host.call('loadAssistantSettings'));
    for(const key of ['visible','outline','saveHistory']) if(typeof saved[key]==='boolean')settings[key]=saved[key];
    if(['white','cream','custom'].includes(saved.palette))settings.palette=saved.palette;
    if(['left','right','bottom'].includes(saved.edge))settings.edge=saved.edge;
    if(Number.isFinite(saved.ratio))settings.ratio=Math.max(0,Math.min(1,saved.ratio));
    for(const key of Object.keys(defaults))if(/^#[0-9a-f]{6}$/i.test(saved.colors?.[key]))settings.colors[key]=saved.colors[key];
  } catch (_) { }
  let history=[];
  if(settings.saveHistory)try {
    const saved=JSON.parse(host.call('loadAssistantHistory'));
    if(Array.isArray(saved))history=saved.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string')
      .slice(-30).map(m=>({role:m.role,content:m.content.slice(0,6000)}));
  } catch (_) { }
  let dialogOpen=false,moving=false,dragging=false,frame=0,x=0,y=0,pointer=null,transition=0;
  let waiting=false,epoch=0,recording='idle',audio=null,voiceEpoch=0,ownsAudio=false,wheel=null,saveTimer;
  let voiceMode='',liveSession='',voicePrefix='',voiceMessage='';
  let voiceHeld=false,voiceReview=false,voicePointer=null,voiceKey='',voiceLimit=null,voiceRestart=null,voiceSegment=0;
  const cache=new Map(),requests=[];
  const order=[0,1,2,1,0,3];
  const app=$('appRoot');
  const pet=document.createElement('button');
  pet.id='yunduoCat';pet.className='cat-pet';pet.type='button';
  pet.setAttribute('aria-label','云朵管家，点击对话，拖动停靠');
  pet.innerHTML='<img alt="趴睡的像素猫" draggable="false">';
  const dialog=document.createElement('section');
  dialog.id='catDialog';dialog.className='cat-dialog';dialog.hidden=true;
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','catTitle');
  dialog.innerHTML=`<header class="cat-heading"><strong id="catTitle">云朵管家</strong><div><button type="button" data-cat="new">新对话</button> <button type="button" data-cat="close" aria-label="收起管家">收起</button></div></header>
    <div id="catMessages" class="cat-messages" role="log" aria-label="与云朵管家的对话" aria-live="polite"></div>
    <form id="catForm" class="cat-composer"><label class="sr-only" for="catInput">和云朵说点什么</label><textarea id="catInput" maxlength="4000" placeholder="想去哪个页面，或需要一起理清什么？"></textarea>
      <div class="cat-composer-actions"><button type="button" id="catVoice" class="cat-mic" aria-label="按住说话" title="按住说话" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8"/></svg></button><button type="button" data-cat="transcribe" id="catTranscribe" hidden>重试识别</button><button type="submit" class="cat-send" id="catSend">发送</button></div>
      <div id="catVoiceReview" class="cat-voice-review" hidden><button type="button" data-cat="keep-voice" id="catKeepVoice">保留文字</button><button type="button" data-cat="delete-voice" id="catDeleteVoice">全部删除</button></div>
      <div class="cat-voice-status" id="catVoiceStatus" role="status" hidden></div></form>`;
  document.body.append(pet,dialog);

  function checkedCall(method,...args) {
    const result=JSON.parse(host.call(method,...args));
    if(!result.ok)throw new Error(result.error||'保存失败');
    return result;
  }
  function savePrefs() {
    try { checkedCall('saveAssistantSettings',JSON.stringify(settings)); }
    catch(error){host.toast(error.message);}
  }
  function saveHistory() {
    try {checkedCall('saveAssistantHistory',JSON.stringify(settings.saveHistory?history.slice(-30).map(({role,content})=>({role,content})):[]));}
    catch(error){host.toast(error.message);}
  }
  function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(savePrefs,120);}
  function eye(){const n=frame%42;return [14,15].includes(n)?'closed':[12,13,16].includes(n)?'half':'open';}
  function sprite(pose,gaze) {
    const tail=order[Math.floor(frame/4)%order.length],dark=host.isDark();
    if(settings.palette!=='custom'&&dark)return window.PIXEL_FRAMES[settings.palette][pose][gaze][tail];
    const key=[settings.palette,dark,pose,gaze,tail].join(':');
    if(cache.has(key))return cache.get(key);
    const preset=settings.palette!=='custom';
    const slots=preset?[null,'#171819','#171819','#fff6e2','#596b73',settings.palette==='cream'?'#f4f2e9':'#171819']
      :[null,settings.colors.line,settings.colors.cat,settings.colors.cloud,settings.colors.cloudLine,settings.colors.line];
    const outline=preset?settings.palette==='white':settings.outline;
    const rgb=slots.map(v=>v&&v.slice(1).match(/../g).map(c=>parseInt(c,16)));
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
    const ctx=canvas.getContext('2d'),data=ctx.createImageData(32,32),pixels=window.PIXEL_MAPS[pose][gaze][tail];
    for(let i=0;i<pixels.length;i++){
      const slot=Number(pixels[i]);if(!slot||(outline&&(slot===2||slot===3)))continue;
      data.data.set([...rgb[slot],255],i*4);
    }
    ctx.putImageData(data,0,0);const url=canvas.toDataURL('image/png');cache.set(key,url);return url;
  }
  function paint(){
    const pose=dragging||moving?'drag':dialogOpen?'chat':settings.edge;
    const gaze=dragging||moving?'half':dialogOpen?eye():'closed';
    const src=sprite(pose,gaze);if(pet.firstElementChild.getAttribute('src')!==src)pet.firstElementChild.src=src;
    pet.hidden=!settings.visible||host.hasSheet()||document.hidden;
    pet.setAttribute('aria-label',dialogOpen?'收起云朵管家':'云朵管家，点击对话，拖动停靠');
    pet.setAttribute('aria-expanded',String(dialogOpen));
  }
  function bounds(){
    const bar=$('tabBar').getBoundingClientRect();
    return {w:innerWidth,h:Math.max(150,bar.top||innerHeight-72)};
  }
  function target(){
    const {w,h}=bounds();
    if(settings.edge==='left')return {x:-14,y:Math.max(64,Math.min(h-70,settings.ratio*(h-64)))};
    if(settings.edge==='right')return {x:w-50,y:Math.max(64,Math.min(h-70,settings.ratio*(h-64)))};
    return {x:Math.max(0,Math.min(w-64,settings.ratio*(w-64))),y:h-48};
  }
  function place(nx,ny){x=nx;y=ny;pet.style.left=x+'px';pet.style.top=y+'px';}
  function dock(){const p=target();place(p.x,p.y);paint();}
  async function fly(nx,ny){
    const generation=++transition;
    const anim=pet.animate([{left:x+'px',top:y+'px'},{left:(x+nx)/2+'px',top:((y+ny)/2-18)+'px'},
      {left:nx+'px',top:ny+'px'}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:560,easing:'cubic-bezier(.2,.7,.3,1)'});
    place(nx,ny);try{await anim.finished;}catch{return false;}return generation===transition;
  }
  async function open(){
    if(!settings.visible||moving||dialogOpen||host.hasSheet())return;
    moving=true;paint();
    if(!await fly((innerWidth-64)/2,8))return;
    moving=false;dialogOpen=true;dialog.hidden=false;app.inert=true;renderMessages();paint();
    dialog.setAttribute('aria-owns',pet.id);
    dialog.querySelector('[data-cat="close"]').focus({preventScroll:true});
  }
  function cleanupVoice(){
    voiceEpoch++;
    voiceHeld=false;voiceReview=false;voicePointer=null;voiceKey='';clearTimeout(voiceLimit);clearTimeout(voiceRestart);
    liveSession='';
    if(voiceMode==='live')try{host.call('cancelLiveDictation');}catch(_){}
    if(ownsAudio)try{host.call('cancelRecording');host.call('cancelTranscription');host.call('discardAudio');}catch(_){}
    ownsAudio=false;recording='idle';audio=null;voiceMode='';voiceMessage='';voiceUI();
  }
  async function close(animate=true){
    if(!dialogOpen&&!moving)return;
    cleanupVoice();dialogOpen=false;dialog.hidden=true;app.inert=false;
    if(animate&&settings.visible&&!host.hasSheet()){
      moving=true;paint();const p=target();if(!await fly(p.x,p.y))return;
    }else{transition++;pet.getAnimations().forEach(a=>a.cancel());}
    moving=false;dock();
  }
  function append(role,content,actions=[]){
    history.push({role,content,actions});if(history.length>30)history=history.slice(-30);
    saveHistory();renderMessages();
  }
  function renderMessages(){
    const box=$('catMessages');box.replaceChildren();
    if(!history.length){const p=document.createElement('p');p.className='cat-message assistant';p.textContent='我在。可以带你去日程、查看安排，也能一起拆解待办。需要改动数据时，我会先请你确认。';box.append(p);}
    history.forEach(message=>{
      const row=document.createElement('div');row.className='cat-message '+message.role;
      const who=document.createElement('small');who.textContent=message.role==='user'?'你':'云朵';row.append(who,document.createTextNode(message.content));
      (message.actions||[]).forEach(action=>{
        const card=document.createElement('div');card.className='cat-action';
        const title=document.createElement('strong');title.textContent=action.label;
        const detail=document.createElement('p');detail.textContent=action.detail;
        const button=document.createElement('button');button.type='button';button.textContent=action.used?'已处理':action.type==='complete'?'同意，标记完成':'查看并确认';button.disabled=!!action.used;
        button.onclick=()=>{
          if(action.used)return;
          try{
            host.describe && action.type!=='add' && host.describe(action);
            action.used=true;button.disabled=true;
            close(false);
            const result=host.prepare(action);host.toast(result);append('assistant',result);
          }catch(error){action.used=false;button.disabled=false;host.toast(error.message);}
        };
        const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='不执行';dismiss.disabled=!!action.used;
        dismiss.onclick=()=>{action.used=true;renderMessages();};card.append(title,detail,button,dismiss);row.append(card);
      });box.append(row);
    });
    if(waiting){const p=document.createElement('p');p.className='cat-message assistant';p.textContent='正在想一想…';box.append(p);}
    box.scrollTop=box.scrollHeight;voiceUI();
  }
  function validateActions(actions){
    if(!Array.isArray(actions))return [];
    return actions.slice(0,5).flatMap(action=>{
      if(!action||typeof action!=='object')return [];
      if(action.type==='navigate'){
        if(['home','calendar','tasks','settings'].includes(action.tab)){
          close(false);host.navigate(action.tab);
        }
        return [];
      }
      if(action.type==='add'){
        if(!Array.isArray(action.events)||!action.events.length||action.events.length>30)return [];
        return [{type:'add',events:action.events,label:`新增 ${action.events.length} 项安排`,
          detail:action.events.slice(0,5).map(e=>`${String(e.title||'未命名').slice(0,100)} · ${e.start?`开始 ${e.start} / 结束 ${e.due||'待补充'}`:`截止 ${e.due||'待补充时间'}`}`).join('\n')+'\n打开预览后，检查内容并保存。'}];
      }
      if(!['edit','delete','complete'].includes(action.type)||typeof action.id!=='string')return [];
      try{
        const event=host.describe(action);
        return [{type:action.type,id:action.id,date:typeof action.date==='string'?action.date:'',
          label:({edit:'编辑安排',delete:'删除安排',complete:'标记完成'})[action.type],
          detail:`${event.title} · ${action.date||event.due}${event.urgent?'\n紧急事项：会在接下来和待办中置顶。':''}${event.repeat?'\n重复事项：修改或删除时还会确认范围。':''}`}];
      }catch(_){return [];}
    });
  }
  function localNavigation(text){
    if(!/^(打开|去|带我去|切到|进入|返回|回到)/.test(text))return false;
    const entry=[['设置','settings'],['日历','calendar'],['日程','calendar'],['待办','tasks'],['首页','home'],['接下来','home']].find(([name])=>text.includes(name));
    if(!entry)return false;
    append('user',text);append('assistant',`带你去${entry[0]}。`);close(false);host.navigate(entry[1]);return true;
  }
  async function send(){
    const input=$('catInput'),text=input.value.trim();if(!text||waiting||recording!=='idle'||voiceHeld||voiceReview)return;
    if(localNavigation(text)){input.value='';return;}
    const config=JSON.parse(host.call('getConfig'));
    if(!config.hasKey||!config.model){host.toast('先在设置 → AI 识别接口配置模型；管家沿用同一接口');return;}
    const prior=history.slice(-12).map(({role,content})=>({role,content:content.slice(0,4000)}));
    const generation=epoch;let context={context:[],contextRange:'未提供日程；仅一般问答'};
    try{if(/日程|安排|待办|任务|今天|明天|后天|本周|下周|这周|计划|截止|会议|作业|课程|考试|20\d{2}-\d{2}-\d{2}/.test(text))context=host.context(text);}
    catch(error){host.toast(error.message);return;}
    append('user',text);input.value='';waiting=true;renderMessages();
    try{
      const result=await host.request('assistant',JSON.stringify({text,history:prior,...context}));
      if(generation!==epoch)return;
      const actions=validateActions(result.actions);append('assistant',String(result.reply||'我准备好了，请查看操作方案。'),actions);
    }catch(error){if(generation===epoch){append('assistant',`这次没有完成：${error.message}`);if(!input.value)input.value=text;}}
    finally{waiting=false;renderMessages();}
  }
  function voiceUI(){
    const busy=recording!=='idle'||voiceHeld;
    $('catVoice').disabled=waiting||voiceReview||(busy&&!voiceHeld);
    $('catVoice').classList.toggle('is-held',voiceHeld);
    $('catVoice').setAttribute('aria-pressed',String(voiceHeld));
    $('catVoice').setAttribute('aria-label',voiceHeld?'松开结束':'按住说话');
    $('catVoice').title=voiceHeld?'松开结束':'按住说话';
    $('catTranscribe').hidden=!audio||recording!=='idle';
    $('catSend').disabled=waiting||busy||voiceReview;
    $('catInput').readOnly=busy||voiceReview;
    $('catInput').placeholder=voiceHeld?'正在听…':'想去哪个页面，或需要一起理清什么？';
    $('catVoiceReview').hidden=!voiceReview;
    $('catKeepVoice').disabled=busy||!$('catInput').value.trim();
    const output=$('catVoiceStatus');
    output.textContent=recording==='recording'?(voiceMode==='live'?'正在听，松开结束':voiceMessage||'正在录音，松开后识别')
      :recording==='transcribing'?'正在识别…':recording==='stopping'?'正在整理文字…':recording==='starting'?'正在开启麦克风…':voiceMessage;
    output.hidden=!output.textContent;
  }
  function voiceDraft(text){
    $('catInput').value=[voicePrefix,String(text||'').trim()].filter(Boolean).join('\n').slice(0,4000);
    $('catInput').scrollTop=$('catInput').scrollHeight;
  }
  function voiceError(error,generation){
    if(generation!==voiceEpoch)return;
    recording='idle';ownsAudio=false;liveSession='';voiceMode='';voiceMessage=error.message;voiceUI();
  }
  async function startFallback(generation){
    if(generation!==voiceEpoch||!voiceHeld)return;
    const speech=JSON.parse(host.call('getSpeechConfig'));
    if(!speech.endpoint||!speech.model)throw new Error('系统实时识别不可用，请在设置中配置语音识别 API');
    voiceMode='file';liveSession='';voiceMessage='实时识别不可用；请说话，松开后识别';voiceUI();
    await host.request('startRecording');
    if(generation!==voiceEpoch)return;
    recording='recording';voiceUI();
  }
  async function startLiveSegment(generation){
    if(generation!==voiceEpoch||!voiceHeld)return;
    ownsAudio=true;recording='starting';voiceMode='live';
    liveSession=`cat-${Date.now()}-${generation}-${++voiceSegment}`;voiceUI();
    try{
      try{await host.request('startLiveDictation',liveSession);}
      catch(error){
        if(generation!==voiceEpoch)return;
        if(/权限|正在进行|等待权限/.test(error.message))throw error;
        await startFallback(generation);return;
      }
      if(generation===voiceEpoch&&liveSession&&recording==='starting'){recording='recording';voiceUI();}
    }catch(error){voiceError(error,generation);}
  }
  function beginVoice(){
    if(waiting||recording!=='idle'||voiceHeld||voiceReview)return false;
    const generation=++voiceEpoch;
    voiceHeld=true;voicePrefix=$('catInput').value.trim();voiceMessage='';audio=null;
    voiceLimit=setTimeout(endVoice,300000);
    try{host.call('discardAudio');}catch(_){}
    startLiveSegment(generation);return true;
  }
  async function endVoice(){
    if(!voiceHeld)return;
    voiceHeld=false;voicePointer=null;voiceKey='';voiceReview=true;
    clearTimeout(voiceLimit);clearTimeout(voiceRestart);
    const generation=voiceEpoch;
    // A release during permission/startup must never open a microphone later.
    if(recording==='starting'){
      voiceEpoch++;liveSession='';
      try{host.call('cancelLiveDictation');host.call('cancelRecording');}catch(_){}
      ownsAudio=false;recording='idle';voiceMode='';voiceMessage='';voiceUI();return;
    }
    if(recording!=='recording'){voiceUI();return;}
    recording='stopping';voiceUI();
    try{
      if(voiceMode==='live'){await host.request('stopLiveDictation');return;}
      const result=await host.request('stopRecording');if(generation!==voiceEpoch)return;
      audio=result;recording='idle';transcribe();
    }catch(error){voiceError(error,generation);}
  }
  function chooseVoice(keep){
    if(!voiceReview||(keep&&(recording!=='idle'||voiceHeld)))return;
    cleanupVoice();
    if(!keep)$('catInput').value='';
    voiceUI();$('catInput').focus({preventScroll:true});
  }
  async function transcribe(){
    if(!audio||recording!=='idle'||voiceHeld)return;
    const generation=++voiceEpoch;voicePrefix=$('catInput').value.trim();recording='transcribing';voiceMessage='';voiceUI();
    try{
      const result=await host.request('transcribeAudio',audio.token);
      if(generation!==voiceEpoch)return;
      if(!String(result.text||'').trim())throw new Error('没有识别到语音，请重试');
      voiceDraft(result.text);
      host.call('discardAudio');audio=null;ownsAudio=false;
    }catch(error){if(generation===voiceEpoch)voiceMessage=error.message;}
    finally{if(generation===voiceEpoch){recording='idle';voiceUI();}}
  }
  const mic=$('catVoice');
  mic.addEventListener('contextmenu',event=>event.preventDefault());
  mic.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary)return;
    event.preventDefault();
    if(beginVoice()){voicePointer=event.pointerId;mic.setPointerCapture(event.pointerId);}
  });
  const releaseMic=event=>{if(event.pointerId===voicePointer){event.preventDefault();endVoice();}};
  mic.addEventListener('pointerup',releaseMic);
  mic.addEventListener('pointercancel',releaseMic);
  mic.addEventListener('lostpointercapture',releaseMic);
  mic.addEventListener('keydown',event=>{
    if(![' ','Enter'].includes(event.key))return;
    event.preventDefault();if(!event.repeat&&!voiceHeld&&beginVoice())voiceKey=event.key;
  });
  mic.addEventListener('keyup',event=>{
    if(event.key===voiceKey){event.preventDefault();endVoice();}
  });
  // Screen readers can activate the same control without pointer/key events.
  mic.addEventListener('click',event=>{event.preventDefault();if(event.detail===0){if(voiceHeld)endVoice();else beginVoice();}});
  mic.addEventListener('blur',()=>{if(voiceKey)endVoice();});
  $('catForm').onsubmit=event=>{event.preventDefault();send().catch(error=>host.toast(error.message));};
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('[data-cat]');if(!button)return;
    const action=button.dataset.cat;
    if(action==='close')close();
    if(action==='keep-voice')chooseVoice(true);
    if(action==='delete-voice')chooseVoice(false);
    if(action==='transcribe')transcribe();
    if(action==='new'){epoch++;history=[];requests.length=0;cleanupVoice();$('catInput').value='';saveHistory();renderMessages();}
  });
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      const list=[...dialog.querySelectorAll('button:not([disabled]):not([hidden]),textarea'),pet].filter(el=>el.getClientRects().length);
      const index=list.indexOf(document.activeElement);
      event.preventDefault();list[(index+(event.shiftKey?-1:1)+list.length)%list.length]?.focus();
    }
  });
  pet.addEventListener('pointerdown',event=>{
    if(moving||event.button!==0)return;
    if(dialogOpen){event.preventDefault();close();return;}
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,px:x,py:y,moved:false};pet.setPointerCapture(event.pointerId);
  });
  pet.addEventListener('pointermove',event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    if(!pointer.moved&&Math.hypot(dx,dy)<8)return;
    pointer.moved=true;dragging=true;const {w,h}=bounds();
    place(Math.max(0,Math.min(w-64,pointer.px+dx)),Math.max(0,Math.min(h-48,pointer.py+dy)));paint();
  });
  async function endDrag(event,cancelled=false){
    if(!pointer||pointer.id!==event.pointerId)return;
    const moved=pointer.moved;pointer=null;
    if(!moved){if(!cancelled)open();return;}
    const {w,h}=bounds();const distances=[['left',Math.abs(x+14)],['right',Math.abs(w-50-x)],['bottom',Math.abs(h-48-y)]];
    distances.sort((a,b)=>a[1]-b[1]);settings.edge=distances[0][0];settings.ratio=Math.max(0,Math.min(1,settings.edge==='bottom'?x/(w-64):y/(h-64)));savePrefs();
    moving=true;const p=target();if(!await fly(p.x,p.y))return;dragging=false;moving=false;dock();
  }
  pet.addEventListener('pointerup',event=>endDrag(event));pet.addEventListener('pointercancel',event=>endDrag(event,true));
  pet.addEventListener('click',event=>{if(event.detail===0){if(dialogOpen)close();else open();}});

  function settingsMarkup(){return `<div class="settings-group cat-settings"><h2>智能助手</h2><div class="plain-list">
    <label for="catVisible"><span>显示云朵管家</span><input id="catVisible" type="checkbox" ${settings.visible?'checked':''}></label>
    <label for="catPalette">猫咪配色<select id="catPalette"><option value="white">极简线条</option><option value="cream">奶油填色</option><option value="custom">自定义配色</option></select></label>
    <div class="cat-palette" id="catPaletteDetails" data-open="false">
      <button type="button" class="cat-palette-toggle" id="catPaletteToggle" aria-expanded="false" aria-controls="catPaletteBody"><span class="cat-palette-chevron" aria-hidden="true"></span><span>色圈</span></button>
      <div class="cat-palette-clip" id="catPaletteBody"><div class="cat-palette-body"><div class="cat-wheel-editor"><div class="cat-wheel-area"><canvas id="color-wheel" width="208" height="208" tabindex="0" role="group" aria-label="颜色色圈"></canvas><span id="wheel-marker" class="cat-wheel-marker" aria-hidden="true"></span></div>
      <div class="cat-wheel-fields"><label for="color-part">调整部位<select id="color-part"><option value="cat">猫咪填色</option><option value="line">轮廓 / 五官</option><option value="cloud">云朵填色</option><option value="cloudLine">云朵边线</option></select></label>
      <label for="color-brightness">亮度<input id="color-brightness" type="range" min="0" max="100" value="100" aria-label="颜色亮度"></label>
      <label for="color-hex">颜色值<input id="color-hex" type="text" value="#f6d5a0" maxlength="7" autocomplete="off" spellcheck="false" aria-label="十六进制颜色值"></label><span id="selected-color" class="cat-selected-color"></span></div></div>
      <div class="cat-swatches">${Object.entries({cat:'猫咪',line:'轮廓',cloud:'云朵',cloudLine:'云边'}).map(([key,label])=>`<label>${label}<input type="color" data-cat-color="${key}" value="${settings.colors[key]}" aria-label="${label}颜色"></label>`).join('')}</div>
      <label for="catOutline">仅显示轮廓<input type="checkbox" id="catOutline" ${settings.outline?'checked':''}></label><button type="button" id="catReset">恢复默认外观</button></div></div></div>
    <label for="catSaveHistory">在本机保存聊天记录<input id="catSaveHistory" type="checkbox" ${settings.saveHistory?'checked':''}></label>
    <div style="padding:0 16px 16px"><button type="button" id="catClearHistory">清空聊天记录</button></div>
    </div></div>`;}
  function mountSettings(){
    const mount=$('assistantSettings');if(!mount||mount.dataset.mounted)return;
    mount.dataset.mounted='true';mount.innerHTML=settingsMarkup();window.YunduoSelects?.enhance(mount);$('catPalette').value=settings.palette;$('catPalette')._customRefresh?.();
    const setPaletteOpen=open=>{const panel=$('catPaletteDetails'),toggle=$('catPaletteToggle');if(!panel||!toggle)return;panel.dataset.open=String(open);toggle.setAttribute('aria-expanded',String(open));};
    setPaletteOpen(settings.palette==='custom');
    $('catPaletteToggle').onclick=()=>{const panel=$('catPaletteDetails');setPaletteOpen(panel.dataset.open!=='true');};
    wheel=createColorWheel(hex=>{
      const key=$('color-part').value;settings.colors[key]=hex;settings.palette='custom';
      if(key==='cat'||key==='cloud')settings.outline=false;
      syncColors(false);cache.clear();queueSave();paint();
    });
    function syncColors(updateWheel=true){
      $('catPalette').value=settings.palette;$('catPalette')._customRefresh?.();$('catOutline').checked=settings.outline;
      mount.querySelectorAll('[data-cat-color]').forEach(input=>input.value=settings.colors[input.dataset.catColor]);
      if(updateWheel)wheel.set(settings.colors[$('color-part').value]);
    }
    syncColors();
    $('color-part').onchange=()=>wheel.set(settings.colors[$('color-part').value]);
    $('catVisible').onchange=()=>{settings.visible=$('catVisible').checked;savePrefs();if(!settings.visible)close(false);paint();};
    $('catPalette').onchange=()=>{settings.palette=$('catPalette').value;if(settings.palette==='custom')setPaletteOpen(true);syncColors();savePrefs();paint();};
    mount.querySelectorAll('[data-cat-color]').forEach(input=>input.oninput=()=>{
      const key=input.dataset.catColor;settings.colors[key]=input.value;settings.palette='custom';$('color-part').value=key;
      if(key==='cat'||key==='cloud')settings.outline=false;syncColors();cache.clear();queueSave();paint();
    });
    $('catOutline').onchange=()=>{settings.outline=$('catOutline').checked;settings.palette='custom';syncColors();cache.clear();savePrefs();paint();};
    $('catReset').onclick=()=>{settings.palette='white';settings.colors={...defaults};settings.outline=false;syncColors();cache.clear();savePrefs();paint();};
    $('catSaveHistory').onchange=()=>{settings.saveHistory=$('catSaveHistory').checked;savePrefs();saveHistory();};
    $('catClearHistory').onclick=()=>{epoch++;history=[];saveHistory();renderMessages();host.toast('聊天记录已清空');};
  }
  window.YunduoCat={
    refresh(){mountSettings();if(!dialogOpen&&!moving&&!dragging)dock();else paint();},
    suspend(){close(false);paint();},
    handleBack(){if(dialogOpen||moving){close();return true;}return false;},
    onAudioResult(result){
      if(result.id==='speech-live'){
        if(!ownsAudio||!liveSession||result.data?.session!==liveSession)return true;
        const data=result.data;
        if(data.text)voiceDraft(data.text);
        if(data.final){
          const generation=voiceEpoch;liveSession='';recording='idle';
          voiceMessage=data.error||'';voiceUI();
          if(voiceHeld&&!data.text&&/系统实时识别暂不可用|系统识别正在使用中/.test(data.error)){
            recording='starting';voiceUI();startFallback(generation).catch(error=>{
              voiceError(error,generation);
            });
          }else{
            ownsAudio=false;voiceMode='';
            if(voiceHeld&&(!data.error||data.error==='没有识别到语音，请重试')){
              voicePrefix=$('catInput').value.trim();voiceMessage='';voiceUI();
              voiceRestart=setTimeout(()=>startLiveSegment(generation),300);
            }
          }
        }
        return true;
      }
      if(!ownsAudio||voiceMode!=='file'||!['speech-stopped','speech-interrupted'].includes(result.id))return false;
      voiceHeld=false;voiceReview=true;voicePointer=null;voiceKey='';clearTimeout(voiceLimit);clearTimeout(voiceRestart);
      voiceEpoch++;recording='idle';if(result.ok)audio=result.data;else voiceMessage=result.error;voiceUI();
      if(audio&&!document.hidden&&dialogOpen)transcribe();return true;
    }
  };
  window.addEventListener('yunduo-appearance',()=>{paint();});
  window.addEventListener('resize',()=>{if(moving||dragging)return;if(dialogOpen)place((innerWidth-64)/2,8);else dock();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&voiceHeld)endVoice();
    if(!document.hidden&&dialogOpen&&audio&&recording==='idle')transcribe();paint();
  });
  pet.addEventListener('keydown',event=>{
    if(!dialogOpen)return;
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      event.preventDefault();
      const list=[...dialog.querySelectorAll('button:not([disabled]):not([hidden]),textarea')].filter(el=>el.getClientRects().length);
      (event.shiftKey?list.at(-1):list[0])?.focus();
    }
  });
  window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);savePrefs();cleanupVoice();});
  setInterval(()=>{if(document.hidden||(!settings.visible&&!dialogOpen))return;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)frame++;paint();},160);
  mountSettings();dock();renderMessages();
})();
