const mongoose=require('mongoose');require('dotenv').config();const connectDB=require('../config/db');const Worker=require('../models/Worker');const Block=require('../models/Block');
(async()=>{
 await connectDB(); await new Promise(r=>setTimeout(r,1500));
 const names = [
  'JACOB NGAZIMBI','KUMBULANI KUZEYAMISA','ENIA MUUDZWA','GODKNOWS MARIGA','NOMATTER MEREKA','FARIRAI MARIGA','PROSPER MUPEREKI','ALICE MSIDHANI','TEURAI MASIMBA','TAMBUDZAI NDLOVU','TAPIWA CHIVASA','NTHEOLENG MOSHOESHOE','TAFADZWA PHIRI'
 ];
 const all = await Worker.find({}, {workerID:1,name:1,blocks:1}).lean();
 function norm(s){return String(s||'').toUpperCase().replace(/[^A-Z]/g,'');}
 const results=[];
 for(const q of names){
   const nq=norm(q);
   const parts=q.toUpperCase().split(/\s+/).filter(Boolean);
   const matches = all.filter(w=>{
     const nw=norm(w.name);
     if(nw===nq) return true;
     // contains all parts
     return parts.every(p=>nw.includes(norm(p)));
   });
   results.push({query:q, matches: matches.map(m=>({id:m.workerID,name:m.name}))});
 }
 console.log(JSON.stringify(results, null, 2));

 // also check active jobs for matched ids
 const ids=[...new Set(results.flatMap(r=>r.matches.map(m=>String(m.id))))];
 if(ids.length){
   const blocks=await Block.find({'rows.active_jobs.worker_id':{$in:ids}}).lean();
   const active=[];
   for(const b of blocks){for(const row of b.rows||[]){for(const j of (row.active_jobs||[])){if(ids.includes(String(j.worker_id))){
     active.push({id:j.worker_id,name:j.worker_name,block:b.block_name,row:row.row_number,job:j.job_type,rem:j.remaining_stock,remB:j.remaining_bunches,start:j.start_time});
   }}}}
   console.log('ACTIVE', JSON.stringify(active, null, 2));
 }
 await mongoose.disconnect();
})().catch(e=>{console.error(e);process.exit(1)});
