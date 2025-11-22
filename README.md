# Boat Arena — Multiplayer

## Rodando localmente
1. `git clone ...` ou cole os arquivos em uma pasta
2. `npm install`
3. `node server.js`
4. Abra `http://localhost:3000` no navegador

## Testando via internet (deploy grátis no Render)
1. Crie conta em https://render.com
2. Crie um novo Web Service e conecte seu repositório GitHub com este projeto
3. Use build command `npm ci` e Start command `node server.js`
4. Após deploy, abra a URL pública gerada pelo Render — todos podem acessar e jogar

## Notas e melhorias
- Você pode trocar assets em `public/assets/` por sprites melhores
- Para reduzir latência, ajuste `TICK_RATE` e `SNAPSHOT_RATE`
- Segurança: faça rate limiting e autenticação se for abrir ao público
