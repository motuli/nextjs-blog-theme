const ALLOWED=new Set(["orchestrator","diagnostic","critic","tutor","evidence","evaluate","metacognition","advisor","class_planner","progressus"]);

const COMMON=`És um agente pedagógico do SCRIPTORIA. Responde sempre em português europeu.
O aluno mantém autoria integral. Nunca escrevas, completes ou proponhas a versão final.
Nunca inventes evidências.
A decisão final pertence ao professor.
Nunca cries rankings nem comparações públicas entre alunos.
A memória individual serve apenas para apoio individual.
Dados agregados servem apenas para planeamento coletivo.
Não faças inferências psicológicas, clínicas ou pessoais.
A menor intervenção eficaz é preferível a intervenção excessiva.
O objetivo final é retirar progressivamente o apoio quando existem evidências de autonomia.`;

const ROLE={
orchestrator:`Decide os agentes necessários entre diagnostic, critic, tutor, evidence, advisor, class_planner.
Podes escolher nenhum agente se a melhor decisão for autonomia primeiro.
A rota deve ser pedagogicamente parcimoniosa: ativa apenas os agentes necessários.
intensity: low, mid ou high.`,
diagnostic:`Analisa a produção inicial sem reescrever. Dá 1 ponto forte, 2 prioridades e 1 pergunta de regresso ao texto.`,
critic:`Audita o diagnóstico. Procura falta de prova, sobreinterpretação e tentativa de escrever pelo aluno. Máximo 3 observações. Termina com VEREDITO.`,
tutor:`Produz exatamente 3 perguntas socráticas: evidência, interpretação, ligação global. Não forneças respostas.`,
evidence:`Verifica a resposta intermédia. Produz 3 linhas iniciadas por 🟢 ou 🟡: evidência, interpretação, ligação. Depois indica condição para reescrita.`,
evaluate:`Compara produção inicial e revista. Avalia 1-4: Pertinência, Rigor, Consistência, Correção. Mostra V1→V2 com justificação. Não transformar em classificação sumativa automática.`,
metacognition:`Produz exatamente 3 perguntas: diferença entre versões, decisão do aluno, estratégia transferível sem IA.`,
advisor:`Usa apenas o percurso deste aluno. Dá prioridade atual, estratégia concreta, pergunta de autorregulação e reconhecimento de progresso. Nunca compares com colegas.`,
class_planner:`Recebes apenas dados agregados. Propõe aula de 50 minutos com foco, evidência agregada, sequência, diferenciação e exit ticket.`,
progressus:`És o agente longitudinal Progressus.
Recebes um objetivo pedagógico e checkpoints de várias sessões.
Decide o próximo passo do CICLO, não apenas da sessão atual.
Formato:
OBJETIVO DO CICLO
EVIDÊNCIA ATUAL
PRÓXIMO PASSO
INTENSIDADE DE APOIO
JUSTIFICAÇÃO
CRITÉRIO DE SUCESSO
Regras:
- se houver progresso consistente, recomenda reduzir apoio;
- se houver estagnação, recomenda mudar estratégia;
- se houver regressão, recomenda apoio mais estruturado temporário;
- ao atingir o número-alvo de sessões, recomenda tarefa de transferência sem IA;
- nunca rotules o aluno.`
};

const ORCHESTRATOR_SCHEMA={
 type:"json_schema",
 name:"scriptoria_orchestrator_route",
 strict:true,
 schema:{
  type:"object",
  additionalProperties:false,
  properties:{
   route:{type:"array",items:{type:"string",enum:["diagnostic","critic","tutor","evidence","advisor","class_planner"]},maxItems:6},
   reason:{type:"string"},
   autonomy:{type:"number",minimum:0,maximum:100},
   intensity:{type:"string",enum:["low","mid","high"]}
  },
  required:["route","reason","autonomy","intensity"]
 }
};

function clip(x,n){return String(x??"").slice(0,n)}
function makeInput(b){
 if(b.role==="progressus")return "CONTEXTO ATUAL:\n"+clip(b.task,3000)+"\n\nCICLO LONGITUDINAL:\n"+clip(JSON.stringify(b.cycle),12000);
 if(b.role==="orchestrator")return[
  "TAREFA:\n"+clip(b.task,3000),
  "TEXTO DE REFERÊNCIA:\n"+clip(b.reference,9000),
  "PRODUÇÃO ATUAL:\n"+clip(b.initial,7000),
  b.longitudinal?"MEMÓRIA LONGITUDINAL:\n"+clip(JSON.stringify(b.longitudinal),10000):"",
  b.aggregate?"DADOS AGREGADOS:\n"+clip(JSON.stringify(b.aggregate),5000):""
 ].filter(Boolean).join("\n\n---\n\n");
 if(b.role==="class_planner")return "CONTEXTO:\n"+clip(b.task,3000)+"\n\nDADOS AGREGADOS:\n"+clip(JSON.stringify(b.aggregate),9000);
 return[
  "TAREFA:\n"+clip(b.task,4000),
  "TEXTO DE REFERÊNCIA:\n"+clip(b.reference,12000),
  "PRODUÇÃO INICIAL:\n"+clip(b.initial,9000),
  b.middle?"RESPOSTA INTERMÉDIA:\n"+clip(b.middle,7000):"",
  b.revised?"VERSÃO REVISTA:\n"+clip(b.revised,9000):"",
  b.longitudinal?"MEMÓRIA LONGITUDINAL:\n"+clip(JSON.stringify(b.longitudinal),14000):"",
  b.prior?"ANÁLISES ANTERIORES:\n"+clip(JSON.stringify(b.prior),12000):""
 ].filter(Boolean).join("\n\n---\n\n")
}
function outputText(d){
 if(typeof d.output_text==="string"&&d.output_text.trim())return d.output_text.trim();
 const p=[];for(const i of(d.output||[]))if(i?.type==="message")for(const c of(i.content||[]))if(c?.type==="output_text"&&typeof c.text==="string")p.push(c.text);
 return p.join("\n").trim()
}
function safeApiError(d,status){
 const code=d?.error?.code||d?.error?.type||"api_error";
 if(code==="insufficient_quota"||code==="billing_not_active"||code==="billing_hard_limit_reached")return "API OpenAI sem crédito/faturação disponível.";
 if(code==="invalid_api_key"||code==="authentication_error")return "Chave da API OpenAI inválida ou sem autorização.";
 if(code==="model_not_found")return "O modelo configurado não está disponível para esta conta API.";
 if(status===429)return "Limite temporário ou quota da API atingidos.";
 return "A OpenAI API devolveu um erro ("+status+").";
}

export default async(request)=>{
 const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
 const apiKey=Netlify.env.get("OPENAI_API_KEY");
 const configuredModel=Netlify.env.get("OPENAI_MODEL")||"gpt-5.6-terra";
 if(request.method==="GET")return new Response(JSON.stringify({configured:!!apiKey,model:configuredModel}),{status:200,headers});
 if(request.method!=="POST")return new Response(JSON.stringify({error:"Método não permitido."}),{status:405,headers});
 if(!apiKey)return new Response(JSON.stringify({error:"OPENAI_API_KEY não configurada."}),{status:503,headers});
 let b;try{b=await request.json()}catch{return new Response(JSON.stringify({error:"JSON inválido."}),{status:400,headers})}
 if(!ALLOWED.has(String(b.role||"")))return new Response(JSON.stringify({error:"Agente inválido."}),{status:400,headers});
 const model=configuredModel;
 const wantsJson=b.role==="orchestrator";
 const payload={model,store:false,instructions:COMMON+"\n\n"+ROLE[b.role],input:makeInput(b),reasoning:{effort:"low"},text:wantsJson?{verbosity:"low",format:ORCHESTRATOR_SCHEMA}:{verbosity:"low"},max_output_tokens:1000,metadata:{app:"scriptoria-v7.1",agent:b.role}};
 try{
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)return new Response(JSON.stringify({error:safeApiError(d,r.status),code:d?.error?.code||d?.error?.type||null}),{status:502,headers});
  const text=outputText(d);if(!text)return new Response(JSON.stringify({error:"Resposta sem texto."}),{status:502,headers});
  if(wantsJson){
    try{
      const parsed=JSON.parse(text);
      return new Response(JSON.stringify({...parsed,model:d.model||model,usage:d.usage||null}),{status:200,headers});
    }catch{return new Response(JSON.stringify({error:"A rota recebida da IA não pôde ser interpretada."}),{status:502,headers})}
  }
  return new Response(JSON.stringify({text,model:d.model||model,usage:d.usage||null}),{status:200,headers})
 }catch(e){return new Response(JSON.stringify({error:"Erro de ligação ao serviço de IA."}),{status:502,headers})}
};

export const config={path:"/api/agent"};
