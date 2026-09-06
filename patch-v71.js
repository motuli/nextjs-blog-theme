(()=>{
  'use strict';
  // v7.1 — transparência do motor: cada intervenção identifica a sua origem.
  try { if (typeof AI_ENGINE !== 'undefined') window.AI_ENGINE = AI_ENGINE; } catch (_) {}

  const css = document.createElement('style');
  css.id = 'scriptoria-v71-source-css';
  css.textContent = `
    .agent-source{display:inline-flex;align-items:center;gap:6px;margin:0 0 9px;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:.035em;border:1px solid transparent;line-height:1}
    .agent-source.ai{background:#e9fbf3;color:#137a55;border-color:#bfead6}
    .agent-source.local{background:#edf2f5;color:#5e707d;border-color:#d8e0e5}
    .agent-source.fallback{background:#fff4df;color:#9a6200;border-color:#f3d99b}
    .agent-source.pending{background:#e8f7fa;color:#167386;border-color:#c9e9ef}
    .agent-source[hidden]{display:none!important}`;
  document.head.appendChild(css);

  const sourceTargets = {
    diagnostic:'src1', critic:'src2', tutor:'src3', evidence:'src4',
    evaluate:'src5', metacognition:'src6', advisor:'advisorSource',
    class_planner:'classPlanSource', orchestrator:'orchestratorSource', progressus:'progressusSource'
  };
  const agentSource = window.SCRIPTORIA_AGENT_SOURCE = window.SCRIPTORIA_AGENT_SOURCE || {};

  function sourceText(mode){
    const model = (window.AI_ENGINE && window.AI_ENGINE.model) || '';
    if(mode==='ai') return '🟢 IA REAL' + (model ? ' · '+model : '');
    if(mode==='fallback') return '🟠 FALLBACK LOCAL';
    if(mode==='pending') return '◌ A VERIFICAR ORIGEM';
    return '⚪ MOTOR LOCAL';
  }
  function setSource(role, mode, detail=''){
    agentSource[role] = {mode, detail, at:new Date().toISOString(), model:(window.AI_ENGINE&&window.AI_ENGINE.model)||null};
    const el = document.getElementById(sourceTargets[role]);
    if(!el) return;
    el.hidden = false;
    el.className = 'agent-source '+mode;
    el.textContent = sourceText(mode);
    el.title = detail || ({
      ai:'Intervenção produzida por uma chamada à API OpenAI.',
      local:'Intervenção produzida pelo motor local da aplicação.',
      fallback:'A chamada à IA falhou e o SCRIPTORIA ativou o motor local.',
      pending:'A confirmar a origem desta intervenção.'
    }[mode]||'');
  }
  function copySource(role,targetId){
    const src=agentSource[role], el=document.getElementById(targetId);
    if(!src||!el) return;
    el.hidden=false; el.className='agent-source '+src.mode; el.textContent=sourceText(src.mode); el.title=src.detail||'';
  }
  window.setScriptoriaAgentSource=setSource;

  function addBadge(id, beforeId){
    if(document.getElementById(id)) return;
    const before=document.getElementById(beforeId); if(!before) return;
    const b=document.createElement('div'); b.id=id; b.className='agent-source local'; b.hidden=true; b.textContent='⚪ MOTOR LOCAL';
    before.parentNode.insertBefore(b,before);
  }
  for(let i=1;i<=6;i++) addBadge('src'+i,'o'+i);
  addBadge('advisorSource','advisorOutput');
  addBadge('classPlanSource','classPlan');
  addBadge('orchestratorSource','routeReason');
  addBadge('progressusSource','progressusOutput');
  addBadge('studentTutorSource','studentTutor');
  addBadge('studentAdviceSource','studentAdvice');

  // Marca a origem a partir da chamada real ao backend.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init={}){
    let role=null;
    try{
      const url = typeof input==='string' ? input : input?.url || '';
      const method=(init?.method||'GET').toUpperCase();
      if(url.includes('/api/agent') && method==='POST' && init?.body){
        const body=JSON.parse(init.body); role=body?.role||null;
        if(role) setSource(role,'pending');
      }
    }catch(_){ }
    try{
      const res=await nativeFetch(input,init);
      if(role) setSource(role,res.ok?'ai':'fallback',res.ok?'':'Backend devolveu HTTP '+res.status+'.');
      return res;
    }catch(err){
      if(role) setSource(role,'fallback',err?.message||String(err));
      throw err;
    }
  };

  // Em cada execução, se não houver chamada ao backend, identifica explicitamente motor local.
  function wrap(name,role){
    const original=window[name]; if(typeof original!=='function'||original.__v71wrapped) return;
    const wrapped=async function(...args){
      const before=agentSource[role]?.at;
      const hasAI=!!(window.AI_ENGINE&&window.AI_ENGINE.available);
      if(!hasAI) setSource(role,'local',(window.AI_ENGINE&&window.AI_ENGINE.lastError)||'IA real não ativa nesta sessão.');
      else setSource(role,'pending');
      try{
        const result=await original.apply(this,args);
        // Se a função não fez qualquer POST ao backend, então executou localmente.
        if(agentSource[role]?.mode==='pending' && agentSource[role]?.at!==before) setSource(role,'local');
        // O motor híbrido central desativa AI_ENGINE quando faz fallback.
        if(role!=='orchestrator' && role!=='advisor' && role!=='class_planner' && role!=='progressus' && hasAI && window.AI_ENGINE && !window.AI_ENGINE.available && agentSource[role]?.mode==='ai'){
          setSource(role,'fallback',window.AI_ENGINE.lastError||'A chamada à IA não concluiu a intervenção.');
        }
        return result;
      }catch(err){ setSource(role,'fallback',err?.message||String(err)); throw err; }
    };
    wrapped.__v71wrapped=true; window[name]=wrapped;
  }
  wrap('runDiagnostic','diagnostic'); wrap('runCritic','critic'); wrap('runTutor','tutor');
  wrap('runEvidence','evidence'); wrap('runEval','evaluate'); wrap('runMeta','metacognition');
  wrap('generateAdvice','advisor'); wrap('generateClassPlan','class_planner');
  wrap('planRoute','orchestrator'); wrap('runProgressus','progressus');

  // Propaga a transparência para o que o aluno recebe, sem alterar o controlo do professor.
  const approveOriginal=window.approveStep;
  if(typeof approveOriginal==='function'){
    window.approveStep=async function(n,...args){
      const r=await approveOriginal.call(this,n,...args);
      if(n===3) copySource('tutor','studentTutorSource');
      return r;
    };
  }
  const adviceOriginal=window.sendAdviceToStudent;
  if(typeof adviceOriginal==='function'){
    window.sendAdviceToStudent=function(...args){ const r=adviceOriginal.apply(this,args); copySource('advisor','studentAdviceSource'); return r; };
  }

  // Identidade de manutenção: evolução funcional, não uma nova arquitetura conceptual.
  const kicker=document.querySelector('.hero-card.hero-copy .kicker');
  if(kicker) kicker.textContent='MVP v7.1 · CICLOS ADAPTATIVOS · TRANSPARÊNCIA DO MOTOR · PROGRESSUS';
  const footer=document.querySelector('.footer');
  if(footer) footer.textContent=footer.textContent.replace('MVP v7 ·','MVP v7.1 ·').replace('Ciclos adaptativos ·','Ciclos adaptativos · Transparência do motor ·');
})();
