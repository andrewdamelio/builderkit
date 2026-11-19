global.ethers=require('ethers'); global.MessagePack=require('@msgpack/msgpack');
const HL=require('../src/core.js'); const ref=JSON.parse(require('child_process').execSync('python3 '+__dirname+'/ref.py').toString()); const fs=require('fs'); const {execSync}=require('child_process');
(async()=>{
 const w=new ethers.Wallet("0x"+"11".repeat(32));
 const a=HL.buildApproveAction({builder:"0xAbCdEf0123456789abcdef0123456789ABCDEF01",maxFeeRate:"0.05%",nonce:1731900000000});
 const s1=await HL.signTyped(w,HL.approveTypedData(a));
 console.log('approve', JSON.stringify(s1)===JSON.stringify(ref.s1)?'MATCH':'DIFF',s1,ref.s1);
 const o=[HL.orderWire({asset:0,isBuy:true,px:95123.5,sz:0.0015}),HL.orderWire({asset:10107,isBuy:false,px:100,sz:1500.5,reduceOnly:true,tif:"Ioc"})];
 const act=HL.buildOrderAction(o,{b:"0xAbCdEf0123456789abcdef0123456789ABCDEF01",f:25});
 console.log('wire', JSON.stringify(act)===JSON.stringify(ref.act)?'MATCH':'DIFF');
 const h=HL.actionHash(act,1731900000123); console.log('hash', h.slice(2)===ref.h.replace(/^0x/,'')?'MATCH':'DIFF');
 const s2=await HL.signTyped(w,HL.l1TypedData(h,true)); console.log('l1', JSON.stringify(s2)===JSON.stringify(ref.s2)?'MATCH':'DIFF');
 const h3=HL.actionHash(act,1731900000123,"0x1111111111111111111111111111111111111111",1731990000000);
 const s3=await HL.signTyped(w,HL.l1TypedData(h3,false)); console.log('l1 vault+exp', JSON.stringify(s3)===JSON.stringify(ref.s3)?'MATCH':'DIFF');
 const r=HL.inspectExchangeBody({action:{...a},nonce:a.nonce,signature:s1}); console.log('inspect approve',r.signer===ref.addr, r.notes);
 const r2=HL.inspectExchangeBody({action:act,nonce:1731900000123,signature:s2}); console.log('inspect order',r2.signer===ref.addr);
 // lz4
 const csv="time,user,coin,side,px,sz,builder_fee\n"+Array.from({length:20000},(_,i)=>`${i},0xabc${i%50},BTC,B,${95000+i%300},0.01,0.0${i%9}`).join("\n");
 process.chdir(require('os').tmpdir());fs.writeFileSync('x.csv',csv); execSync("python3 -c \"import lz4.frame as f;open('x.csv.lz4','wb').write(f.compress(open('x.csv','rb').read(),block_linked=True,content_checksum=True,store_size=True))\"");
 const dec=new TextDecoder().decode(HL.lz4Decode(fs.readFileSync('x.csv.lz4'))); console.log('lz4',dec===csv?'MATCH':'DIFF', fs.statSync('x.csv.lz4').size);
 console.log(HL.fToRateString(25),HL.fToRateString(100),HL.fToRateString(1),HL.parseRateString("0.025%"));
})();
