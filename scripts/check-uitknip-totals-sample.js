const mongoose=require('mongoose');require('dotenv').config();const connectDB=require('../config/db');const Worker=require('../models/Worker');
(async()=>{
 await connectDB(); await new Promise(r=>setTimeout(r,1500));
 const ids=['4145','4102','4149','4161','5107'];
 const workers=await Worker.find({workerID:{$in:ids}},{workerID:1,name:1,blocks:1}).lean();
 for(const w of workers){
   let uitknip=0, uitknip02=0, uitknipRows=[];
   for(const b of (w.blocks||[])){
     for(const r of (b.rows||[])){
       const jt=String(r.job_type||'').toUpperCase();
       if(jt==='UITKNIP'){uitknip+=(Number(r.stock_count)||0); uitknipRows.push({block:b.block_name,row:r.row_number,v:Number(r.stock_count)||0,b:Number(r.bunch_count)||0,ex:!!r.totalsExcluded});}
       if(jt==='UITKNIP02') uitknip02+=(Number(r.stock_count)||0);
     }
   }
   console.log(JSON.stringify({id:w.workerID,name:w.name,uitknipVines:uitknip,uitknip02Vines:uitknip02,uitknipRows}));
 }
 await mongoose.disconnect();
})().catch(e=>{console.error(e);process.exit(1)});

