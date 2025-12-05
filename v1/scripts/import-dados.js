/**
 * Importa dados do backup para banco novo
 * 
 * Execute: node scripts/import-dados.js
 * 
 * Lê arquivo: data/backup.json
 */

require('dotenv').config();
const db = require('../src/database');
const fs = require('fs');
const path = require('path');

async function importar() {
  console.log('📥 Importando dados para o banco...\n');

  // Carregar backup
  const backupPath = path.join(__dirname, '../data/backup.json');
  
  if (!fs.existsSync(backupPath)) {
    console.error('❌ Arquivo backup.json não encontrado!');
    console.log('   Execute primeiro: node scripts/export-dados.js');
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  console.log(`📅 Backup de: ${backup.exportadoEm}\n`);

  await db.initDb();

  // Mapa de telegram_id -> novo id
  const usuarioMap = new Map();

  // 1. Importar usuários
  console.log('1. Importando usuários...');
  let usuariosImportados = 0;
  
  for (const u of backup.dados.usuarios) {
    // Verificar se já existe
    const existente = db.usuarios.buscarPorTelegramId(u.telegram_id);
    
    if (existente) {
      usuarioMap.set(u.telegram_id, existente.id);
      console.log(`   ⏭️  ${u.nome} já existe`);
      continue;
    }

    // Criar usuário
    try {
      db.run(`
        INSERT INTO usuarios (telegram_id, username, nome, whatsapp, plano_id, ativacoes_restantes, data_expiracao, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [u.telegram_id, u.username, u.nome, u.whatsapp, u.plano_id, u.ativacoes_restantes, u.data_expiracao, u.status]);
      
      const novoUsuario = db.usuarios.buscarPorTelegramId(u.telegram_id);
      usuarioMap.set(u.telegram_id, novoUsuario.id);
      
      // Gerar código de afiliado
      const codigo = db.afiliados.gerarCodigo(u.nome, u.username);
      db.afiliados.definirCodigo(novoUsuario.id, codigo);
      
      // Criar registro de bot vazio
      db.bots.criar(novoUsuario.id);
      
      console.log(`   ✅ ${u.nome} (código: ${codigo})`);
      usuariosImportados++;
    } catch (e) {
      console.error(`   ❌ Erro ao importar ${u.nome}: ${e.message}`);
    }
  }
  console.log(`   Total: ${usuariosImportados} importado(s)\n`);

  // 2. Importar credenciais
  console.log('2. Importando credenciais...');
  let credenciaisImportadas = 0;
  
  for (const c of backup.dados.credenciais) {
    const usuarioId = usuarioMap.get(c.usuario_telegram_id);
    if (!usuarioId) {
      console.log(`   ⚠️  Usuário ${c.usuario_telegram_id} não encontrado para credencial ${c.tipo}`);
      continue;
    }

    try {
      // Verificar se já existe
      const existente = db.credenciais.buscar(usuarioId, c.tipo);
      if (existente) {
        console.log(`   ⏭️  ${c.tipo} já existe para usuário ${c.usuario_telegram_id}`);
        continue;
      }

      db.run(`
        INSERT INTO credenciais (usuario_id, tipo, dados)
        VALUES (?, ?, ?)
      `, [usuarioId, c.tipo, c.dados]);
      
      console.log(`   ✅ ${c.tipo} para usuário ${c.usuario_telegram_id}`);
      credenciaisImportadas++;
    } catch (e) {
      console.error(`   ❌ Erro: ${e.message}`);
    }
  }
  console.log(`   Total: ${credenciaisImportadas} importada(s)\n`);

  // 3. Importar bots (atualizar os existentes)
  console.log('3. Importando bots...');
  let botsImportados = 0;
  
  for (const b of backup.dados.bots) {
    const usuarioId = usuarioMap.get(b.usuario_telegram_id);
    if (!usuarioId) {
      console.log(`   ⚠️  Usuário ${b.usuario_telegram_id} não encontrado para bot`);
      continue;
    }

    try {
      // Atualizar bot existente
      db.run(`
        UPDATE bots 
        SET token = ?, bot_username = ?, bot_name = ?, status = ?
        WHERE usuario_id = ?
      `, [b.token, b.bot_username, b.bot_name, b.status, usuarioId]);
      
      console.log(`   ✅ @${b.bot_username}`);
      botsImportados++;
    } catch (e) {
      console.error(`   ❌ Erro: ${e.message}`);
    }
  }
  console.log(`   Total: ${botsImportados} importado(s)\n`);

  // 4. Importar produtos
  console.log('4. Importando produtos...');
  let produtosImportados = 0;
  
  for (const p of backup.dados.produtos) {
    const usuarioId = usuarioMap.get(p.usuario_telegram_id);
    if (!usuarioId) {
      console.log(`   ⚠️  Usuário ${p.usuario_telegram_id} não encontrado para produto ${p.nome}`);
      continue;
    }

    try {
      // Verificar se já existe
      const existentes = db.produtos.listarPorUsuario(usuarioId);
      const jaExiste = existentes.some(e => e.nome === p.nome && e.modulo === p.modulo && e.tier === p.tier);
      
      if (jaExiste) {
        console.log(`   ⏭️  ${p.nome} já existe`);
        continue;
      }

      db.run(`
        INSERT INTO produtos (usuario_id, nome, modulo, tier, preco, ativo)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [usuarioId, p.nome, p.modulo, p.tier, p.preco, p.ativo]);
      
      console.log(`   ✅ ${p.nome}`);
      produtosImportados++;
    } catch (e) {
      console.error(`   ❌ Erro: ${e.message}`);
    }
  }
  console.log(`   Total: ${produtosImportados} importado(s)\n`);

  // 5. Salvar banco
  console.log('5. Salvando banco de dados...');
  db.saveDb();
  console.log('   ✅ Banco salvo\n');

  console.log('✅ Importação concluída!\n');
  console.log('📋 Resumo:');
  console.log(`   • Usuários: ${usuariosImportados}`);
  console.log(`   • Credenciais: ${credenciaisImportadas}`);
  console.log(`   • Bots: ${botsImportados}`);
  console.log(`   • Produtos: ${produtosImportados}`);
  
  console.log('\n🔜 Agora inicie o sistema:');
  console.log('   pm2 start ativacao-saas');
}

importar().catch(console.error);
