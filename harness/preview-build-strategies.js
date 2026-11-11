'use strict';
// 手动真实模型回放；凭据只从项目配置读取，报告不保存配置或密钥。
const fs=require('node:fs');
const path=require('node:path');
const {readLlmConfig,createOpenAiClient}=require('../agent/llm/openai');
const {cardGuidance,buildStrategyContext,guidanceSignature}=require('../agent/knowledge/card-guidance');
const {applyAiChoices}=require('../agent/knowledge/card-guidance-service');
const cases=[
  ['ironclad',['HELLRAISER','PERFECTED_STRIKE','POMMEL_STRIKE','STRIKE_IRONCLAD'],['PRIMAL_FORCE','GIANT_ROCK']],
  ['silent',['REFLEX','ACROBATICS','TACTICIAN'],['BULLET_TIME','BACKFLIP']],
  ['defect',['GLACIER','DEFRAGMENT'],['HYPERBEAM','BIASED_COGNITION']],
  ['regent',['ALIGNMENT','GLOW'],['CORRUPTION','BATTLE_TRANCE']],
  ['necrobinder',['CALCIFY','FETCH','HAUNT','GRAVE_WARDEN'],['PRIMAL_FORCE','BATTLE_TRANCE']]
];
async function main(){
  const output=path.join(__dirname,'..','.runtime','card-guidance');fs.mkdirSync(output,{recursive:true});
  const fixtures=cases.flatMap(([character,deck,ids])=>['reward','shop'].map(context=>{
    const input={character,deck,relics:[],context,signature:`strategy-${character}-${context}`,candidates:ids.map(id=>({id}))};
    return {type:'card_guidance',context,signature:input.signature,deckSignature:guidanceSignature(input),character,source:'rules',cards:input.candidates.map(c=>cardGuidance(character,deck,[],c))};
  }));
  fs.writeFileSync(path.join(output,'protocol-fixtures.json'),JSON.stringify(fixtures,null,2));
  if(process.argv.includes('--fixtures-only'))return;
  const config=readLlmConfig();if(!config.enabled)throw Error('Model not configured');
  const client=createOpenAiClient({...config,thinking:'disabled',temperature:.1,maxTokens:4000},{timeoutMs:60000});
  const results=await Promise.all(cases.map(async([character,deck],i)=>{
    const base=fixtures[i*2],strategyContext=buildStrategyContext(character,deck,[]),start=Date.now();
    try{
      const result=await client.completeBuildGuidance({character,deck:strategyContext.deck,relics:[],strategyContext,player:{hp:70,maxHp:80},cards:base.cards.filter(c=>c.systems.length)});
      const accepted=applyAiChoices(base,result);
      return {character,accepted:Boolean(accepted),elapsedMs:Date.now()-start,systems:strategyContext.systems.map(s=>s.systemId),result};
    }catch(error){return {character,accepted:false,elapsedMs:Date.now()-start,error:error.message};}
  }));
  fs.writeFileSync(path.join(output,'strategy-model-preview.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));
  console.log(JSON.stringify(results.map(({character,accepted,elapsedMs,error})=>({character,accepted,elapsedMs,error}))));
  if(results.some(r=>!r.accepted))process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
