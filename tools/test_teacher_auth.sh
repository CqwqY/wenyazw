#!/bin/bash
# 教师身份端到端自测：临时账号 -> 错码拒绝 -> 对码升级 -> 状态确认 -> 讲评任务放行 -> 清理
set -e
cd ~/wenyazw/server
EMAIL="teacher-selftest-$(date +%s)@example.com"
USER="tst$(date +%s)"
SECRET=$(cat data/secret.key)
NOW=$(node -e "console.log(new Date().toISOString())")
EXPIRE=$(node -e "console.log(Math.floor(Date.now()/1000)+3600)")

node -e "
const Database=require('better-sqlite3');const db=new Database('data/wenyazw.db');
db.prepare('INSERT INTO users (username,email,password_hash,credits,reg_ip,last_ip,created_at) VALUES (?,?,?,?,?,?,?)')
  .run('$USER','$EMAIL','',0,'selftest','selftest','$NOW');
console.log('test user created');
"

TOKEN=$(node -e "
const c=require('crypto');
const p=Buffer.from(JSON.stringify({u:'$USER',e:'$EMAIL',iat:Math.floor(Date.now()/1000),exp:$EXPIRE})).toString('base64url');
const sig=c.createHmac('sha256','$SECRET').update(p).digest('base64url');
console.log(p+'.'+sig);
")

echo '=== wrong code ==='
curl -sS --noproxy '*' -o /tmp/tw.txt -w '%{http_code}\n' -X POST https://back.wenyazw.top/api/teacher/apply \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"code":"WRONG-CODE"}'
cat /tmp/tw.txt; echo

echo '=== correct code ==='
curl -sS --noproxy '*' -o /tmp/tc.txt -w '%{http_code}\n' -X POST https://back.wenyazw.top/api/teacher/apply \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"code":"WY-TEACHER-2026"}'
cat /tmp/tc.txt; echo

echo '=== status as teacher ==='
curl -sS --noproxy '*' -H "Authorization: Bearer $TOKEN" https://back.wenyazw.top/api/teacher/status; echo

echo '=== review task guard (teacher, expect not 403; no credits so expect 402) ==='
curl -sS --noproxy '*' -o /tmp/tr.txt -w '%{http_code}\n' -X POST https://back.wenyazw.top/api/llm/task \
  -H 'Content-Type: application/json' -H 'Origin: https://wenyazw.top' -H "Authorization: Bearer $TOKEN" \
  -d '{"task":"review","vars":{"topic":"测试","count":1,"reports":[]}}'
cat /tmp/tr.txt; echo

echo '=== cleanup ==='
node -e "
const Database=require('better-sqlite3');const db=new Database('data/wenyazw.db');
db.prepare('DELETE FROM users WHERE email=?').run('$EMAIL');
console.log('test user removed');
"
