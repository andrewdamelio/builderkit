import json, eth_account
from hyperliquid.utils.signing import *
K="0x"+"11"*32
w=eth_account.Account.from_key(K)
B="0xAbCdEf0123456789abcdef0123456789ABCDEF01"
a={"maxFeeRate":"0.05%","builder":B.lower(),"nonce":1731900000000,"type":"approveBuilderFee"}
s1=sign_approve_builder_fee(w,a,True)
for px,sz in [(95123.5,0.0015),(100,2),(0.000123,1500.5)]:
    pass
o=[order_request_to_order_wire({"coin":"BTC","is_buy":True,"sz":0.0015,"limit_px":95123.5,"order_type":{"limit":{"tif":"Gtc"}},"reduce_only":False},0),
   order_request_to_order_wire({"coin":"X","is_buy":False,"sz":1500.5,"limit_px":100.0,"order_type":{"limit":{"tif":"Ioc"}},"reduce_only":True},10107)]
act=order_wires_to_order_action(o,{"b":B.lower(),"f":25})
s2=sign_l1_action(w,act,None,1731900000123,None,True)
s3=sign_l1_action(w,act,"0x1111111111111111111111111111111111111111",1731900000123,1731990000000,False)
print(json.dumps({"addr":w.address,"s1":s1,"act":act,"s2":s2,"s3":s3,"h":action_hash(act,None,1731900000123,None).hex()}))
