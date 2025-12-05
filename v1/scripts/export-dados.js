/**
 * Exporta dados importantes do banco atual
 * 
 * Execute: node scripts/export-dados.js
 * 
 * Gera arquivo: data/backup.json
 */

require('dotenv').config();
const db = require('../src/database');
const fs = require('fs');
const path = require('path');

async function exportar() {
  console.log('📤 Exportando dados do banco...\n');

  await db.initDb();

  const backup = {
    exportadoEm: new Date().toISOString(),
    versao: '1.0',
    dados: {}
  };

  // 1. Usuários
  console.log('1. Exportando usuários...');
  const usuarios = db.usuarios.listarTodos();
  backup.dados.usuarios = usuarios.map(u => ({
    telegram_id: u.telegram_id,
    username: u.username,
    nome: u.nome,
    whatsapp: u.whatsapp,
    plano_id: u.plano_id,
    ativacoes_restantes: u.ativacoes_restantes,
    data_expiracao: u.data_expiracao,
    status: u.status
  }));
  console.log(`   ✅ ${usuarios.length} usuário(s)`);

  // 2. Credenciais
  console.log('2. Exportando credenciais...');
  const credenciais = db.query('SELECT * FROM credenciais');
  backup.dados.credenciais = credenciais.map(c => {
    // Buscar telegram_id do usuário
    const usuario = db.usuarios.buscarPorId(c.usuario_id);
    return {
      usuario_telegram_id: usuario?.telegram_id,
      tipo: c.tipo,
      dados: c.dados // já é JSON string
    };
  }).filter(c => c.usuario_telegram_id); // Remove órfãos
  console.log(`   ✅ ${credenciais.length} credencial(is)`);

  // 3. Bots
  console.log('3. Exportando bots...');
  const bots = db.query('SELECT * FROM bots WHERE token IS NOT NULL');
  backup.dados.bots = bots.map(b => {
    const usuario = db.usuarios.buscarPorId(b.usuario_id);
    return {
      usuario_telegram_id: usuario?.telegram_id,
      token: b.token,
      bot_username: b.bot_username,
      bot_name: b.bot_name,
      status: b.status
    };
  }).filter(b => b.usuario_telegram_id);
  console.log(`   ✅ ${bots.length} bot(s)`);

  // 4. Produtos
  console.log('4. Exportando produtos...');
  const produtos = db.query('SELECT * FROM produtos');
  backup.dados.produtos = produtos.map(p => {
    const usuario = db.usuarios.buscarPorId(p.usuario_id);
    return {
      usuario_telegram_id: usuario?.telegram_id,
      nome: p.nome,
      modulo: p.modulo,
      tier: p.tier,
      preco: p.preco,
      ativo: p.ativo
    };
  }).filter(p => p.usuario_telegram_id);
  console.log(`   ✅ ${produtos.length} produto(s)`);

  // 5. Salvar arquivo
  const backupPath = path.join(__dirname, '../data/backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  
  console.log(`\n✅ Backup salvo em: ${backupPath}`);
  console.log('\n📋 Resumo:');
  console.log(`   • Usuários: ${backup.dados.usuarios.length}`);
  console.log(`   • Credenciais: ${backup.dados.credenciais.length}`);
  console.log(`   • Bots: ${backup.dados.bots.length}`);
  console.log(`   • Produtos: ${backup.dados.produtos.length}`);
  
  console.log('\n🔜 Próximos passos:');
  console.log('   1. pm2 stop ativacao-saas');
  console.log('   2. rm data/database.sqlite');
  console.log('   3. pm2 start ativacao-saas');
  console.log('   4. pm2 stop ativacao-saas');
  console.log('   5. node scripts/import-dados.js');
  console.log('   6. pm2 start ativacao-saas');
}

exportar().catch(console.error);
