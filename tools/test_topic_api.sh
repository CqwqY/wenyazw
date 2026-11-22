#!/usr/bin/env bash
# 验证找作文题接口：正确路径 /api/llm/task 存在；旧的错误路径 /llm/task 应为 404。
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
const email="topic.selftest@local";
const now=Math.floor(Date.now()/1000);
const payload=Buffer.from(JSON.stringify({u:"topictest",e:email,iat:now,exp:now+300})).toString("base64url");
process.stdout.write(payload+"."+crypto.createHmac("sha256",secret).update(payload).digest("base64url"));
')
BODY='{"task":"topics","vars":{"stage":"初中","genre":"记叙文","count":1},"stream":false,"max_tokens":64}'
echo "correct path:"
CODE=$(curl -s --noproxy '*' -o /tmp/wy_topic_ok.txt -w '%{http_code}' -X POST https://back.wenyazw.top/api/llm/task \
  -H "Origin: https://wenyazw.top" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d "$BODY")
echo "HTTP $CODE"
head -c 200 /tmp/wy_topic_ok.txt; echo
if [ "$CODE" = "404" ]; then echo "FAIL: correct path missing"; exit 1; fi
if grep -q '未知的任务' /tmp/wy_topic_ok.txt; then echo "FAIL: task not registered"; exit 1; fi
echo "old wrong path:"
CODE2=$(curl -s --noproxy '*' -o /tmp/wy_topic_bad.txt -w '%{http_code}' -X POST https://back.wenyazw.top/llm/task \
  -H "Origin: https://wenyazw.top" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d "$BODY")
echo "HTTP $CODE2 (404 expected)"
rm -f /tmp/wy_topic_ok.txt /tmp/wy_topic_bad.txt
echo TOPIC_API_CHECK_DONE
