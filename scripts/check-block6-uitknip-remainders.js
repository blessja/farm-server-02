const mongoose=require('mongoose');require('dotenv').config();const connectDB=require('../config/db');const Block=require('../models/Block');const Worker=require('../models/Worker');
(async()=>{
 await connectDB(); await new Promise(r=>setTimeout(r,1500));
 const b = await Block.findOne({block_name:'Block 6'}).lean();
 if(!b){ console.log('no block 6'); process.exit(0); }
 // focus on rows 8B-33A where we had uitknip partials
 function rowNumKey(rn){
   const m=String(rn).match(/^(\d+)([A-Za-z]*)$/);
   if(!m) return [9999,String(rn)];
   return [parseInt(m[1],10), m[2]||''];
 }
 const rows = (b.rows||[]).filter(r=>{
   const [n,l]=rowNumKey(r.row_number);
   if(n<8 || n>33) return false;
   // include 8B onward roughly
   if(n===8 && l.toUpperCase() < 'B') return false;
   return true;
 }).sort((a,c)=>{const ka=rowNumKey(a.row_number), kb=rowNumKey(c.row_number); return ka[0]-kb[0] || ka[1].localeCompare(kb[1]);});

 for(const row of rows){
   const uitk = (row.active_jobs||[]).filter(j=>String(j.job_type||'').toUpperCase().includes('UITKNIP'));
   if(!uitk.length && Number(row.remaining_stock_count||0)===0) continue; // skip fully done no-uitknip
   console.log(JSON.stringify({
     row: row.row_number,
     stock: row.stock_count,
     rem: row.remaining_stock_count,
     remB: row.remaining_bunch_count,
     bunches: row.bunches,
     shared: row.shared_row,
     activeCount: (row.active_jobs||[]).length,
     uitknipJobs: uitk.map(j=>({id:j.worker_id,name:j.worker_name,job:j.job_type,rem:j.remaining_stock,remB:j.remaining_bunches,start:j.start_time}))
   }));
 }

 // also find any active UITKNIP/UITKNIP02 jobs in Block 6 generally
 let allUitk=[];
 for(const row of (b.rows||[])){
   for(const j of (row.active_jobs||[])){
     const jt=String(j.job_type||'').toUpperCase();
     if(jt.includes('UITKNIP')) allUitk.push({row:row.row_number,id:j.worker_id,name:j.worker_name,job:jt,rem:j.remaining_stock,rowRem:row.remaining_stock_count});
   }
 }
 console.log('ALL_UITKNIP_ACTIVE_IN_BLOCK6_COUNT', allUitk.length);

 await mongoose.disconnect();
})().catch(e=>{console.error(e);process.exit(1)});

