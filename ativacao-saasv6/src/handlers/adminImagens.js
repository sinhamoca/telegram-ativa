// ============================================
// HANDLER DE IMAGENS DOS MÓDULOS - ADMIN MASTER
// Arquivo: src/handlers/adminImagens.js
// ============================================

const { Markup } = require('telegraf');
const db = require('../database');
const config = require('../config');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Diretório para salvar imagens
const IMAGENS_DIR = path.join(__dirname, '../../data/imagens_modulos');

// Garantir que o diretório existe
if (!fs.existsSync(IMAGENS_DIR)) {
  fs.mkdirSync(IMAGENS_DIR, { recursive: true });
}

// State para controle de fluxo do admin
const adminImagensState = new Map();

/**
 * Baixa uma imagem do Telegram e salva localmente
 */
async function baixarImagem(ctx, fileId, moduloId) {
  try {
    // Obter link do arquivo
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const url = fileLink.href || fileLink.toString();
    
    // Definir caminho local
    const extensao = url.includes('.jpg') ? '.jpg' : '.png';
    const nomeArquivo = `${moduloId}${extensao}`;
    const caminhoLocal = path.join(IMAGENS_DIR, nomeArquivo);
    
    // Baixar arquivo
    return new Promise((resolve, reject) => {
      const protocolo = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(caminhoLocal);
      
      protocolo.get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(caminhoLocal);
        });
      }).on('error', (err) => {
        fs.unlink(caminhoLocal, () => {}); // Deletar arquivo parcial
        reject(err);
      });
    });
  } catch (e) {
    console.error('[AdminImagens] Erro ao baixar imagem:', e.message);
    throw e;
  }
}

/**
 * Menu principal de imagens dos módulos
 */
async function handleImagensModulos(ctx) {
  await ctx.answerCbQuery();

  // Listar todos os módulos do config
  const modulos = Object.keys(config.MODULOS);
  const imagensConfiguradas = db.modulosImagens.listarTodos();
  const imagensMap = new Map(imagensConfiguradas.map(i => [i.modulo, i.caminho_local]));

  let mensagem = `🖼️ <b>IMAGENS DOS APLICATIVOS</b>\n\n`;
  mensagem += `Configure imagens para cada aplicativo.\n`;
  mensagem += `A imagem aparece quando o cliente seleciona o produto.\n\n`;

  // Contar configurados
  const configurados = modulos.filter(m => imagensMap.has(m)).length;
  mensagem += `📊 <b>Status:</b> ${configurados}/${modulos.length} configurados\n\n`;

  // Criar botões (2 por linha para ficar mais compacto)
  const buttons = [];
  const modulosPorLinha = 2;

  for (let i = 0; i < modulos.length; i += modulosPorLinha) {
    const linha = [];
    for (let j = i; j < i + modulosPorLinha && j < modulos.length; j++) {
      const moduloId = modulos[j];
      const moduloConfig = config.MODULOS[moduloId];
      const temImagem = imagensMap.has(moduloId);
      const emoji = temImagem ? '✅' : '❌';
      const nomeCompacto = moduloConfig.nome.length > 12 
        ? moduloConfig.nome.substring(0, 11) + '..' 
        : moduloConfig.nome;
      
      linha.push(Markup.button.callback(`${emoji} ${nomeCompacto}`, `admin_img_${moduloId}`));
    }
    buttons.push(linha);
  }

  buttons.push([Markup.button.callback('🔙 Voltar', 'admin_menu')]);

  // Tentar editar, se falhar (ex: mensagem é foto), envia nova
  try {
    await ctx.editMessageText(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (e) {
    // Se falhar (mensagem atual é foto), deleta e envia nova
    try {
      await ctx.deleteMessage();
    } catch (e2) { /* ignora */ }
    
    await ctx.reply(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
}

/**
 * Detalhes/configuração de imagem de um módulo específico
 */
async function handleImagemModulo(ctx, moduloId) {
  await ctx.answerCbQuery();

  const moduloConfig = config.MODULOS[moduloId];
  
  if (!moduloConfig) {
    await ctx.reply('❌ Módulo não encontrado.');
    return;
  }

  const imagemAtual = db.modulosImagens.buscar(moduloId);

  let mensagem = `🖼️ <b>${moduloConfig.nome}</b>\n\n`;
  mensagem += `<b>Módulo:</b> <code>${moduloId}</code>\n`;
  mensagem += `<b>Credencial:</b> ${moduloConfig.credencial}\n\n`;

  if (imagemAtual && imagemAtual.caminho_local && fs.existsSync(imagemAtual.caminho_local)) {
    mensagem += `✅ <b>Status:</b> Imagem configurada\n`;
    mensagem += `📅 <b>Atualizado:</b> ${new Date(imagemAtual.atualizado_em).toLocaleDateString('pt-BR')}`;
    
    // Mostrar a imagem atual
    try {
      await ctx.deleteMessage();
    } catch (e) { /* ignora */ }

    await ctx.replyWithPhoto(
      { source: imagemAtual.caminho_local },
      {
        caption: mensagem,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Trocar imagem', `admin_img_trocar_${moduloId}`)],
          [Markup.button.callback('🗑️ Remover imagem', `admin_img_remover_${moduloId}`)],
          [Markup.button.callback('🔙 Voltar', 'admin_imagens')]
        ])
      }
    );
  } else {
    mensagem += `❌ <b>Status:</b> Sem imagem\n\n`;
    mensagem += `📷 Envie uma foto para configurar a imagem deste aplicativo.`;

    // Setar estado para aguardar foto
    adminImagensState.set(ctx.from.id, {
      step: 'aguardando_imagem',
      moduloId: moduloId
    });

    try {
      await ctx.editMessageText(mensagem, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancelar', 'admin_imagens')]
        ])
      });
    } catch (e) {
      try {
        await ctx.deleteMessage();
      } catch (e2) { /* ignora */ }
      
      await ctx.reply(mensagem, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancelar', 'admin_imagens')]
        ])
      });
    }
  }
}

/**
 * Preparar para trocar imagem de um módulo
 */
async function handleTrocarImagem(ctx, moduloId) {
  await ctx.answerCbQuery();

  const moduloConfig = config.MODULOS[moduloId];

  adminImagensState.set(ctx.from.id, {
    step: 'aguardando_imagem',
    moduloId: moduloId
  });

  await ctx.reply(
    `🔄 <b>Trocar imagem - ${moduloConfig.nome}</b>\n\n` +
    `📷 Envie a nova foto para este aplicativo:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'admin_imagens')]])
    }
  );
}

/**
 * Confirmar remoção de imagem
 */
async function handleConfirmarRemoverImagem(ctx, moduloId) {
  await ctx.answerCbQuery();

  const moduloConfig = config.MODULOS[moduloId];

  await ctx.editMessageCaption(
    `⚠️ <b>Confirmar remoção</b>\n\n` +
    `Deseja remover a imagem do <b>${moduloConfig.nome}</b>?\n\n` +
    `Esta ação não pode ser desfeita.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Sim, remover', `admin_img_confirmar_rem_${moduloId}`)],
        [Markup.button.callback('❌ Cancelar', `admin_img_${moduloId}`)]
      ])
    }
  );
}

/**
 * Executar remoção de imagem
 */
async function handleExecutarRemocao(ctx, moduloId) {
  await ctx.answerCbQuery();

  const moduloConfig = config.MODULOS[moduloId];
  
  // Buscar caminho atual para deletar arquivo
  const imagemAtual = db.modulosImagens.buscar(moduloId);
  if (imagemAtual && imagemAtual.caminho_local) {
    try {
      fs.unlinkSync(imagemAtual.caminho_local);
    } catch (e) { /* ignora se não existir */ }
  }
  
  const resultado = db.modulosImagens.remover(moduloId);

  if (resultado.success) {
    await ctx.reply(
      `✅ Imagem do <b>${moduloConfig.nome}</b> removida com sucesso!`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'admin_imagens')]])
      }
    );
  } else {
    await ctx.reply(
      `❌ Erro ao remover: ${resultado.error}`,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'admin_imagens')]])
    );
  }
}

/**
 * Processa foto enviada pelo admin
 */
async function handleAdminPhoto(ctx) {
  const state = adminImagensState.get(ctx.from.id);
  
  if (!state || state.step !== 'aguardando_imagem') {
    return false; // Não está aguardando imagem
  }

  const moduloId = state.moduloId;
  const moduloConfig = config.MODULOS[moduloId];

  // Pegar o file_id da foto (maior resolução)
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;

  try {
    // Baixar e salvar localmente
    const caminhoLocal = await baixarImagem(ctx, fileId, moduloId);
    
    // Salvar no banco (caminho local ao invés de file_id)
    const resultado = db.modulosImagens.salvar(moduloId, caminhoLocal);
    adminImagensState.delete(ctx.from.id);

    if (resultado.success) {
      await ctx.replyWithPhoto(
        { source: caminhoLocal },
        {
          caption: `✅ <b>Imagem configurada!</b>\n\n` +
            `📱 <b>Aplicativo:</b> ${moduloConfig.nome}\n` +
            `🆔 <b>Módulo:</b> <code>${moduloId}</code>\n\n` +
            `Esta imagem será exibida quando clientes selecionarem este app.`,
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Trocar', `admin_img_trocar_${moduloId}`)],
            [Markup.button.callback('🔙 Voltar', 'admin_imagens')]
          ])
        }
      );
    } else {
      await ctx.reply(
        `❌ Erro ao salvar imagem: ${resultado.error}`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'admin_imagens')]])
      );
    }
  } catch (e) {
    console.error('[AdminImagens] Erro:', e);
    await ctx.reply(
      `❌ Erro ao processar imagem: ${e.message}`,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'admin_imagens')]])
    );
  }

  return true; // Processou a foto
}

/**
 * Cancela operação de imagem
 */
function cancelarOperacao(userId) {
  adminImagensState.delete(userId);
}

/**
 * Retorna o caminho da imagem de um módulo (para uso externo)
 */
function getCaminhoImagem(moduloId) {
  const imagem = db.modulosImagens.buscar(moduloId);
  if (imagem && imagem.caminho_local && fs.existsSync(imagem.caminho_local)) {
    return imagem.caminho_local;
  }
  return null;
}

module.exports = {
  handleImagensModulos,
  handleImagemModulo,
  handleTrocarImagem,
  handleConfirmarRemoverImagem,
  handleExecutarRemocao,
  handleAdminPhoto,
  cancelarOperacao,
  getCaminhoImagem,
  adminImagensState,
  IMAGENS_DIR
};