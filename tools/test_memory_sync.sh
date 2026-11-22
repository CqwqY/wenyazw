#!/usr/bin/env bash
# 服务器端自测：签名一个临时 token，验证记忆进度接口读写，然后清理测试数据。
set -e
DIR="$HOME/wenyazw/server"
cd "$DIR"
TOK=$(node -e '
const fs=require("fs"),crypto=require("crypto"),path=require("path");
const dir=process.env.HOME+"/wenyazw/server";
const env=fs.readFileSync(dir+"/.env","utf8");
let dataDir=path.join(dir,"data");
const m=env.match(/^DATA_DIR=(.*)$/m);
if(m && m[1].trim()) dataDir=m[1].trim();
const secret=fs.readFileSync(path.join(dataDir,"secret.key"),"utf8").trim();
const email="memory.selftest@local";
const now=Math.floor(Date.now()/1000);
const payload=Buffer.from(JSON.stringify({u:"memtest",e:email,iat:now,exp:now+300})).toString("base64url");
const sig=crypto.createHmac("sha256",secret).update(payload).digest("base64url");
process.stdout.write(payload+"."+sig);
')
AT=$(node -e 'process.stdout.write(String(Date.now()))')
echo "POST:"
curl -s --noproxy '*' -X POST https://back.wenyazw.top/api/memory/sync \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d "{\"progress\":{\"q001\":{\"box\":2,\"due\":\"2026-11-24\",\"seen\":3,\"ts\":$AT}},\"settings\":{\"batch\":7},\"logs\":[{\"id\":\"q001\",\"text\":\"selftest\",\"theme\":\"成长\",\"kind\":\"quote\",\"ok\":true,\"mode\":\"cloze\",\"at\":$AT}]}" \
  > /tmp/wy_mem_post.json
python3 -c 'import json; d=json.load(open("/tmp/wy_mem_post.json")); print("post ok",d["ok"],"batch",d["settings"]["batch"],"box",d["progress"]["q001"]["box"],"logs",len(d["logs"]))'
echo "GET:"
curl -s --noproxy '*' https://back.wenyazw.top/api/memory/sync \
  -H "Authorization: Bearer $TOK" > /tmp/wy_mem_get.json
python3 -c 'import json; d=json.load(open("/tmp/wy_mem_get.json")); print("get ok",d["ok"],"batch",d["settings"]["batch"],"box",d["progress"]["q001"]["box"],"logs",len(d["logs"]))'
# 清理：只删这个测试账号写下的两行
node -e '
const path=require("path"),Database=require("better-sqlite3");
const dir=process.env.HOME+"/wenyazw/server";
const env=require("fs").readFileSync(dir+"/.env","utf8");
let dataDir=path.join(dir,"data");
const m=env.match(/^DATA_DIR=(.*)$/m);
if(m && m[1].trim()) dataDir=m[1].trim();
const db=new Database(path.join(dataDir,"wenyazw.db"));
const email="memory.selftest@local";
console.log("cleanup progress",db.prepare("DELETE FROM memory_progress WHERE email=?").run(email).changes);
console.log("cleanup logs",db.prepare("DELETE FROM memory_log WHERE email=?").run(email).changes);
db.close();
'
rm -f /tmp/wy_mem_post.json /tmp/wy_mem_get.json
