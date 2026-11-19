const mongoose=require('mongoose');require('dotenv').config();const connectDB=require('../config/db');const Block=require('../models/Block');const Worker=require('../models/Worker');
(async()=>{
 await connectDB(); await new Promise(r=>setTimeout(r,1500));
 const workers=await Worker.find({name:new RegExp('Farirai','i')}).lean();
 console.log('WORKERS', JSON.stringify(workers.map(w=>({id:w.workerID,name:w.name,total:w.total_stock_count})), null, 2));
 const ids=workers.map(w=>String(w.workerID));
 const blocks=await Block.find({'rows.active_jobs.worker_id':{$in:ids}}).lean();
 for(const b of blocks){for(const row of b.rows||[]){for(const j of (row.active_jobs||[])){if(ids.includes(String(j.worker_id))){
   console.log('ACTIVE', JSON.stringify({block:b.block_name,row:row.row_number,rowStock:row.stock_count,rowBunch:row.bunches,rowRem:row.remaining_stock_count,rowBrem:row.remaining_bunch_count,shared:row.shared_row,job:j}));
 }}}}
 const blocks2=await Block.find({'rows.worker_id':{$in:ids}}).lean();
 for(const b of blocks2){for(const row of b.rows||[]){ if(ids.includes(String(row.worker_id)) && row.start_time && !row.time_spent){
   console.log('LEGACY', JSON.stringify({block:b.block_name,row:row.row_number,worker_id:row.worker_id,worker_name:row.worker_name,job:row.job_type,remaining:row.remaining_stock_count,remB:row.remaining_bunch_count,start:row.start_time}));
 }}}
 const allBlocks=await Block.find({'rows.row_number':'21A'}).lean();
 for(const b of allBlocks){ const row=(b.rows||[]).find(r=>String(r.row_number)==='21A'); if(row){
   console.log('ROW21A', JSON.stringify({block:b.block_name,row:'21A',stock:row.stock_count,bunches:row.bunches,remS:row.remaining_stock_count,remB:row.remaining_bunch_count,shared:row.shared_row,active:row.active_jobs,worker_id:row.worker_id,job_type:row.job_type,start:row.start_time,time_spent:row.time_spent}));
 }}
 await mongoose.disconnect();
})().catch(e=>{console.error(e);process.exit(1)});
