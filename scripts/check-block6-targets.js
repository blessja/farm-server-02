const mongoose=require('mongoose');require('dotenv').config();const connectDB=require('../config/db');const Block=require('../models/Block');
(async()=>{
 await connectDB(); await new Promise(r=>setTimeout(r,1500));
 const b = await Block.findOne({block_name:'Block 6'}).lean();
 const targets = ['8B','9A','9B','10A','10B','11A','11B','12A','12B','13A','13B','14A','14B','15A','15B','16A','16B','17A','17B','18A','18B','19A','19B','20A','20B','21A','21B','22A','22B','23A','23B','24A','24B','25A','25B','26A','26B','27A','27B','28A','28B','29A','29B','30A','30B','31A','31B','32A','32B','33A'];
 for(const rn of targets){
   const row = (b.rows||[]).find(r=>String(r.row_number)===rn);
   if(!row){ console.log(rn,'NOT_FOUND'); continue; }
   const jobs = (row.active_jobs||[]).map(j=>({id:j.worker_id,name:j.worker_name,job:j.job_type,rem:j.remaining_stock,remB:j.remaining_bunches}));
   console.log(JSON.stringify({row:rn,stock:row.stock_count,rem:row.remaining_stock_count,remB:row.remaining_bunch_count,bunches:row.bunches,shared:row.shared_row,activeCount:(row.active_jobs||[]).length,jobs}));
 }
 await mongoose.disconnect();
})().catch(e=>{console.error(e);process.exit(1)});

