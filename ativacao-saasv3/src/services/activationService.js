// src/services/activationService.js - Orquestra o processo de ativação

const db = require('../database');
const config = require('../config');
const { createActivator: createIboProActivator } = require('../modules/ibo_pro');
const { createActivator: createIboSolActivator } = require('../modules/ibosol');
const { createActivator: createLazerPlayActivator } = require('../modules/lazer_play');
const { createActivator: createLuminaActivator } = require('../modules/lumina');
const { createActivator: createAssistPlusActivator } = require('../modules/assist_plus');
const { createActivator: createDuplecastActivator } = require('../modules/duplecast');
const { createActivator: createSmartOneActivator } = require('../modules/smartone');
const { createClouddyActivator } = require('../modules/clouddy');
const { createActivator: createQuickPlayerActivator } = require('../modules/quick_player');
const { createActivator: createDreamTVActivator } = require('../modules/dreamtv');
const genericReseller = require('../modules/generic_reseller');
const multiPlayerModule = require('../modules/multi_player');
const vivoPlayerModule = require('../modules/vivo_player');

// Lista de módulos que usam IboSol
const IBOSOL_MODULES = [
  'ibo_player', 'bob_player', 'bob_pro', 'bob_premium', 'mac_player',
  'smartone_pro', 'duplex', 'king_4k', 'flixnet', 'abe_player',
  'virginia', 'all_player', 'hush_play', 'ktn_player', 'family_player',
  'iboss_player', 'ibo_stb', 'iboxx_player', 'ibosol_player'
];

// Lista de módulos que usam Multi-Player (prefixo mp_)
const MULTI_PLAYER_MODULES = [
  'mp_iptv_player_io', 'mp_iptv_ott', 'mp_iptv_4k', 'mp_iptv_stream',
  'mp_iptv_player', 'mp_iptv_play', 'mp_iptv_plus', 'mp_iptv_pro',
  'mp_pro_player', 'mp_iptv_star', 'mp_tvip_player', 'mp_ego_iptv',
  'mp_scandic_iptv', 'mp_flixtra', 'mp_ibo_premium', 'mp_duplex'
];

class ActivationService {
  constructor() {
    this.activators = {};
  }

  /**
   * Obtém o tipo de credencial para um módulo
   */
  getCredentialType(modulo) {
    const moduloConfig = config.MODULOS[modulo];
    return moduloConfig?.credencial || modulo;
  }

  /**
   * Obtém o ativador correto baseado no módulo
   */
  getActivator(modulo, credentials) {
    if (modulo === 'ibo_pro') {
      return createIboProActivator(credentials);
    }
    
    if (IBOSOL_MODULES.includes(modulo)) {
      return createIboSolActivator(modulo, credentials);
    }

    if (modulo === 'dreamtv') {
      return createDreamTVActivator(credentials);
    }

    if (modulo === 'lazer_play') {
      return createLazerPlayActivator(credentials);
    }

    if (modulo === 'lumina') {
      return createLuminaActivator(credentials);
    }

    if (modulo === 'assist_plus') {
      return createAssistPlusActivator(credentials);
    }
    
    if (modulo === 'quick_player') {
      return createQuickPlayerActivator(credentials);
    }

    // Duplecast - usa credenciais GLOBAIS do config
    if (modulo === 'duplecast') {
      const globalCredentials = {
        email: config.DUPLECAST?.email,
        password: config.DUPLECAST?.password
      };
      
      if (!globalCredentials.email || !globalCredentials.password) {
        throw new Error('Duplecast não está configurado no sistema (credenciais globais ausentes no .env)');
      }
      
      return createDuplecastActivator(globalCredentials);
    }

    // SmartOne - usa credenciais GLOBAIS do config (igual Duplecast)
    if (modulo === 'smartone') {
      const globalCredentials = {
        email: config.SMARTONE?.email,
        password: config.SMARTONE?.password
      };
      
      if (!globalCredentials.email || !globalCredentials.password) {
        throw new Error('SmartOne não está configurado no sistema (credenciais globais ausentes no .env)');
      }
      
      return createSmartOneActivator(globalCredentials);
    }

    // Vivo Player - usa credenciais do revendedor
    if (modulo === 'vivo_player') {
      return {
        activate: async (mac, tier) => {
          return await vivoPlayerModule.processarAtivacao(credentials, mac, tier);
        },
        
        extractMacAddress: (mac) => {
          const cleaned = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
          if (cleaned.length === 12) {
            return cleaned.match(/.{2}/g).join(':');
          }
          return null;
        },
        
        validateMac: (mac) => {
          const cleaned = mac.replace(/[^a-fA-F0-9]/g, '');
          return cleaned.length === 12 && /^[0-9A-Fa-f]{12}$/.test(cleaned);
        }
      };
    }

    // Multi-Player modules
    if (MULTI_PLAYER_MODULES.includes(modulo) || modulo.startsWith('mp_')) {
      const moduloConfig = config.MODULOS[modulo];
      const appId = moduloConfig?.app_id || 1;
      
      return {
        activate: async (mac, tier) => {
          const result = await multiPlayerModule.activate(credentials, mac, { 
            app_id: appId, 
            tier 
          });
          
          if (result.success) {
            return {
              success: true,
              message: result.message,
              macAddress: result.data?.mac,
              expireDate: result.data?.expiryFormatted || result.data?.expiry,
              apiResponse: result.data
            };
          }
          return result;
        },
        
        extractMacAddress: (mac) => {
          const validation = multiPlayerModule.validateMac(mac);
          return validation.valid ? validation.formatted : null;
        },
        
        testConnection: async () => {
          return await multiPlayerModule.testConnection(credentials);
        },
        
        getSaldo: async () => {
          return await multiPlayerModule.getCredits(credentials);
        }
      };
    }

    // Módulos genéricos (VU Player Pro, EnzoPlayer, Rivolut, Cap Player, etc)
    const moduloConfig = config.MODULOS[modulo];
    if (moduloConfig?.tipo === 'generic_reseller' && moduloConfig?.dominio) {
      return genericReseller.createActivator(moduloConfig.dominio, credentials, {
        name: moduloConfig.nome
      });
    }
    
    throw new Error(`Módulo não suportado: ${modulo}`);
  }

  /**
   * Processa uma ativação completa
   */
  async processarAtivacao(pedidoId) {
    const pedido = db.pedidos.buscarPorId(pedidoId);
    if (!pedido) {
      return { success: false, error: 'Pedido não encontrado' };
    }

    const produto = db.produtos.buscarPorId(pedido.produto_id);
    if (!produto) {
      return { success: false, error: 'Produto não encontrado' };
    }

    const bot = db.bots.buscarPorId(pedido.bot_id);
    if (!bot) {
      return { success: false, error: 'Bot não encontrado' };
    }

    const usuario = db.usuarios.buscarPorId(bot.usuario_id);
    if (!usuario) {
      return { success: false, error: 'Usuário não encontrado' };
    }

    const podeAtivar = db.usuarios.podeAtivar(usuario.id);
    if (!podeAtivar.pode) {
      db.pedidos.marcarErro(pedidoId, podeAtivar.motivo);
      return { success: false, error: podeAtivar.motivo };
    }

    // TRATAMENTO ESPECIAL PARA DUPLECAST (usa códigos)
    if (produto.modulo === 'duplecast') {
      return await this.processarAtivacaoDuplecast(pedidoId, pedido, produto, usuario);
    }

    // TRATAMENTO ESPECIAL PARA SMARTONE (usa códigos)
    if (produto.modulo === 'smartone') {
      return await this.processarAtivacaoSmartone(pedidoId, pedido, produto, usuario);
    }

    // TRATAMENTO ESPECIAL PARA CLOUDDY (usa cartão)
    if (produto.modulo === 'clouddy') {
      return await this.processarAtivacaoClouddy(pedidoId, pedido, produto, usuario);
    }

    // FLUXO NORMAL (outros módulos)
    const tipoCredencial = this.getCredentialType(produto.modulo);
    const credenciaisDB = db.credenciais.buscar(usuario.id, tipoCredencial);
    
    if (!credenciaisDB || !credenciaisDB.dados) {
      db.pedidos.marcarErro(pedidoId, `Credenciais não configuradas para ${tipoCredencial}`);
      return { success: false, error: `Configure suas credenciais de ${tipoCredencial} primeiro` };
    }

    console.log(`[Activation] Processando pedido ${pedido.codigo} - MAC: ${pedido.mac_address}`);
    console.log(`[Activation] Módulo: ${produto.modulo}, Tier: ${produto.tier}`);

    try {
      const activator = this.getActivator(produto.modulo, credenciaisDB.dados);
      const dadosExtra = pedido.dados_extra ? JSON.parse(pedido.dados_extra) : {};
      const resultado = await activator.activate(pedido.mac_address, produto.tier, dadosExtra);
      
      if (resultado.success) {
        // Registrar histórico de ativação
        db.ativacoes.criar(
          pedidoId,
          usuario.id,
          pedido.mac_address,
          produto.modulo,
          produto.tier || 'YEAR',
          resultado.apiResponse || resultado,
          true
        );

        // Marcar pedido como ativado
        db.pedidos.marcarAtivado(pedidoId);
        
        // Decrementar ativações do revendedor (se não for ilimitado)
        if (usuario.ativacoes_restantes !== null) {
          db.usuarios.decrementarAtivacao(usuario.id);
        }
        console.log(`[Activation] ✅ Pedido ${pedido.codigo} ativado com sucesso`);
        
        return {
          success: true,
          message: resultado.message,
          expireDate: resultado.expireDate,
          data: resultado.data
        };
      } else {
        // Registrar falha no histórico
        db.ativacoes.criar(
          pedidoId,
          usuario.id,
          pedido.mac_address,
          produto.modulo,
          produto.tier || 'YEAR',
          { error: resultado.error },
          false
        );
        
        db.pedidos.marcarErro(pedidoId, resultado.error);
        console.log(`[Activation] ❌ Pedido ${pedido.codigo} falhou: ${resultado.error}`);
        return resultado;
      }
    } catch (error) {
      const errorMessage = error.message || 'Erro desconhecido';
      db.pedidos.marcarErro(pedidoId, errorMessage);
      console.error(`[Activation] ❌ Erro no pedido ${pedido.codigo}:`, error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Processa ativação de Duplecast (usa códigos de ativação)
   */
  async processarAtivacaoDuplecast(pedidoId, pedido, produto, usuario) {
    console.log(`[Activation] Processando Duplecast com código de ativação`);
    
    const codigo = db.duplecastCodes.buscarDisponivel(usuario.id, produto.tier);
    
    if (!codigo) {
      db.pedidos.marcarErro(pedidoId, `Sem códigos ${produto.tier} disponíveis`);
      return { 
        success: false, 
        error: `Você não tem códigos ${produto.tier === 'YEAR' ? 'Anuais' : 'Vitalícios'} disponíveis.` 
      };
    }
    
    try {
      const globalCredentials = {
        email: config.DUPLECAST?.email,
        password: config.DUPLECAST?.password
      };
      
      if (!globalCredentials.email || !globalCredentials.password) {
        throw new Error('Duplecast não está configurado no sistema');
      }
      
      const activator = createDuplecastActivator(globalCredentials);
      const resultado = await activator.activate(pedido.mac_address, produto.tier, {
        activationCode: codigo.codigo
      });
      
      if (resultado.success) {
        db.duplecastCodes.marcarUsado(codigo.id, pedido.mac_address);
        
        // Registrar histórico de ativação
        db.ativacoes.criar(
          pedidoId,
          usuario.id,
          pedido.mac_address,
          produto.modulo,
          produto.tier || 'YEAR',
          { codigoUsado: codigo.codigo, ...resultado },
          true
        );
        
        db.pedidos.marcarAtivado(pedidoId);
        if (usuario.ativacoes_restantes !== null) {
          db.usuarios.decrementarAtivacao(usuario.id);
        }
        console.log(`[Activation] ✅ Duplecast ativado com código ${codigo.codigo}`);
        
        return {
          success: true,
          message: resultado.message,
          expireDate: resultado.expireDate,
          codigoUsado: codigo.codigo
        };
      } else {
        // Registrar falha
        db.ativacoes.criar(
          pedidoId,
          usuario.id,
          pedido.mac_address,
          produto.modulo,
          produto.tier || 'YEAR',
          { error: resultado.error },
          false
        );
        
        db.pedidos.marcarErro(pedidoId, resultado.error);
        return resultado;
      }
    } catch (error) {
      db.pedidos.marcarErro(pedidoId, error.message);
      console.error(`[Activation] ❌ Erro Duplecast:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Processa ativação de SmartOne (usa códigos de ativação)
   */
  async processarAtivacaoSmartone(pedidoId, pedido, produto, usuario) {
    console.log(`[Activation] Processando SmartOne com código de ativação`);
    
    const codigo = db.smartoneCodes.buscarDisponivel(usuario.id, produto.tier);
    
    if (!codigo) {
      db.pedidos.marcarErro(pedidoId, `Sem códigos SmartOne ${produto.tier} disponíveis`);
      return { 
        success: false, 
        error: `Você não tem códigos SmartOne ${produto.tier === 'YEAR' ? 'Anuais' : 'Vitalícios'} disponíveis.` 
      };
    }
    
    try {
      const globalCredentials = {
        email: config.SMARTONE?.email,
        password: config.SMARTONE?.password
      };
      
      if (!globalCredentials.email || !globalCredentials.password) {
        throw new Error('SmartOne não está configurado no sistema');
      }
      
      const activator = createSmartOneActivator(globalCredentials);
      const resultado = await activator.activate(pedido.mac_address, produto.tier, {
        activationCode: codigo.codigo
      });
      
      if (resultado.success) {
        db.smartoneCodes.marcarUsado(codigo.id, pedido.mac_address);
        
        // Registrar histórico de ativação
        db.ativacoes.criar(
          pedidoId,
          usuario.id,
          pedido.mac_address,
          produto.modulo,
          produto.tier || 'YEAR',
          { codigoUsado: codigo.codigo, ...resultado },
          true
        );
        
        db.pedidos.marcarAtivado(pedidoId);
        if (usuario.ativacoes_restantes !== null) {
          db.usuarios.decrementarAtivacao(usuario.id);
        }
        console.log(`[Activation] ✅ SmartOne ativado com código ${codigo.codigo}`);
        
        return {
          success: true,
          message: resultado.message,
          expireDate: resultado.expireDate,
          codigoUsado: codigo.codigo
        };
      } else {
        // Registrar falha
        db.ativacoes.criar(
          pedidoId,
          usuario.id,
          pedido.mac_address,
          produto.modulo,
          produto.tier || 'YEAR',
          { error: resultado.error },
          false
        );
        
        db.pedidos.marcarErro(pedidoId, resultado.error);
        return resultado;
      }
    } catch (error) {
      db.pedidos.marcarErro(pedidoId, error.message);
      console.error(`[Activation] ❌ Erro SmartOne:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Processa ativação de Clouddy (usa cartão de crédito)
   */
  async processarAtivacaoClouddy(pedidoId, pedido, produto, usuario) {
    console.log(`[Activation] Processando Clouddy com cartão de crédito`);
    
    if (!db.clouddyCards.temCartao(usuario.id)) {
      db.pedidos.marcarErro(pedidoId, 'Cartão Clouddy não configurado');
      return { 
        success: false, 
        error: 'Configure seu cartão de crédito em Credenciais > Cartão Clouddy' 
      };
    }
    
    const cartao = db.clouddyCards.buscar(usuario.id);
    
    if (!cartao) {
      db.pedidos.marcarErro(pedidoId, 'Erro ao buscar cartão');
      return { success: false, error: 'Erro ao buscar dados do cartão' };
    }

    // Clouddy usa email/senha do cliente, não MAC Address
    // Os dados podem estar em cliente_email_clouddy/cliente_senha_clouddy ou em dados_extra
    let clienteEmail = pedido.cliente_email_clouddy;
    let clienteSenha = pedido.cliente_senha_clouddy;

    // Fallback: tentar buscar de dados_extra (JSON)
    if (!clienteEmail || !clienteSenha) {
      try {
        if (pedido.dados_extra) {
          const dadosExtra = typeof pedido.dados_extra === 'string' 
            ? JSON.parse(pedido.dados_extra) 
            : pedido.dados_extra;
          clienteEmail = clienteEmail || dadosExtra.cliente_email_clouddy || dadosExtra.email;
          clienteSenha = clienteSenha || dadosExtra.cliente_senha_clouddy || dadosExtra.senha || dadosExtra.password;
        }
      } catch (e) {
        console.error('[Activation] Erro ao parsear dados_extra:', e.message);
      }
    }

    if (!clienteEmail || !clienteSenha) {
      db.pedidos.marcarErro(pedidoId, 'Email/senha do cliente não informados');
      return { 
        success: false, 
        error: 'Email e senha do cliente Clouddy são obrigatórios para ativação' 
      };
    }

    console.log(`[Activation] Cliente Clouddy: ${clienteEmail}`);
    
    try {
      const activator = createClouddyActivator({
        cardNumber: cartao.cardNumber,
        cardExpiry: cartao.cardExpiry,
        cardCvc: cartao.cardCvc,
        cardName: cartao.cardName,
        cardEmail: cartao.cardEmail
      });
      
      // Passar email e senha do CLIENTE (não mac_address)
      const resultado = await activator.activate(clienteEmail, clienteSenha);
      
      if (resultado.success) {
        // Registrar histórico de ativação
        db.ativacoes.criar(
          pedidoId,
          usuario.id,
          clienteEmail, // Usamos o email como identificador
          produto.modulo,
          produto.tier || 'YEAR',
          resultado.apiResponse || resultado,
          true
        );

        // Marcar pedido como ativado
        db.pedidos.marcarAtivado(pedidoId);

        // Decrementar ativações do revendedor (se não for ilimitado)
        if (usuario.ativacoes_restantes !== null) {
          db.usuarios.decrementarAtivacao(usuario.id);
        }
        
        console.log(`[Activation] ✅ Clouddy ativado via cartão`);
        
        return {
          success: true,
          message: resultado.message,
          expireDate: resultado.expireDate
        };
      } else {
        // Registrar falha no histórico
        db.ativacoes.criar(
          pedidoId,
          usuario.id,
          clienteEmail,
          produto.modulo,
          produto.tier || 'YEAR',
          { error: resultado.error },
          false
        );
        
        db.pedidos.marcarErro(pedidoId, resultado.error);
        return resultado;
      }
    } catch (error) {
      db.pedidos.marcarErro(pedidoId, error.message);
      console.error(`[Activation] ❌ Erro Clouddy:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Extrai MAC Address de uma string
   */
  extractMacAddress(modulo, mac) {
    try {
      const moduloConfig = config.MODULOS[modulo];
      
      if (moduloConfig?.tipo === 'generic_reseller' && moduloConfig?.dominio) {
        const activator = genericReseller.createActivator(moduloConfig.dominio, {}, { name: moduloConfig.nome });
        return activator.extractMacAddress(mac);
      }
      
      const activator = this.getActivator(modulo, {});
      
      if (activator.extractMacAddress) {
        return activator.extractMacAddress(mac);
      }
      
      const cleaned = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
      if (cleaned.length === 12) {
        return cleaned.match(/.{2}/g).join(':');
      }
      return null;
    } catch (error) {
      const cleaned = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
      if (cleaned.length === 12) {
        return cleaned.match(/.{2}/g).join(':');
      }
      return null;
    }
  }

  /**
   * Valida MAC Address para um módulo específico
   */
  validarMac(modulo, mac) {
    try {
      const moduloConfig = config.MODULOS[modulo];
      
      if (moduloConfig?.tipo === 'generic_reseller' && moduloConfig?.dominio) {
        const macFormatado = this.extractMacAddress(modulo, mac);
        if (macFormatado) {
          return { valido: true, macFormatado };
        }
        return { valido: false, erro: 'MAC Address inválido' };
      }
      
      const activator = this.getActivator(modulo, {});
      
      if (activator && activator.extractMacAddress) {
        const macFormatado = activator.extractMacAddress(mac);
        if (macFormatado) {
          return { valido: true, macFormatado };
        }
        return { valido: false, erro: 'MAC Address inválido' };
      }
      
      const cleaned = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
      if (cleaned.length === 12) {
        return {
          valido: true,
          macFormatado: cleaned.match(/.{2}/g).join(':')
        };
      }
      
      return {
        valido: false,
        erro: 'MAC inválido'
      };
    } catch (error) {
      return {
        valido: false,
        erro: error.message || 'Erro ao validar MAC'
      };
    }
  }

  /**
   * Testa credenciais de um módulo
   */
  async testarCredenciais(modulo, credentials) {
    try {
      if (modulo === 'duplecast') {
        const globalCredentials = {
          email: config.DUPLECAST?.email,
          password: config.DUPLECAST?.password
        };
        
        if (!globalCredentials.email || !globalCredentials.password) {
          return { 
            success: false, 
            error: 'Duplecast não está configurado no sistema.' 
          };
        }
        
        const activator = createDuplecastActivator(globalCredentials);
        return await activator.testConnection();
      }

      if (modulo === 'smartone') {
        const globalCredentials = {
          email: config.SMARTONE?.email,
          password: config.SMARTONE?.password
        };
        
        if (!globalCredentials.email || !globalCredentials.password) {
          return { 
            success: false, 
            error: 'SmartOne não está configurado no sistema.' 
          };
        }
        
        const activator = createSmartOneActivator(globalCredentials);
        return await activator.testConnection();
      }

      if (modulo === 'clouddy') {
        return {
          success: true,
          message: 'Clouddy usa cartão de crédito. Configure em Credenciais > Cartão Clouddy'
        };
      }

      if (modulo === 'vivo_player') {
        return await vivoPlayerModule.testarCredenciais(credentials.email, credentials.senha);
      }

      // Módulos genéricos
      const moduloConfig = config.MODULOS[modulo];
      if (moduloConfig?.tipo === 'generic_reseller' && moduloConfig?.dominio) {
        return await genericReseller.testConnection(moduloConfig.dominio, credentials, {
          name: moduloConfig.nome
        });
      }

      const activator = this.getActivator(modulo, credentials);
      const resultado = await activator.testConnection();
      
      return resultado;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Busca saldo de créditos de um módulo
   */
  async getSaldo(modulo, credentials) {
    try {
      if (modulo === 'duplecast') {
        const usuarioId = credentials.usuarioId;
        if (!usuarioId) {
          return { success: false, error: 'ID do usuário não fornecido' };
        }
        
        const contagem = db.duplecastCodes.contar(usuarioId);
        const porTier = db.duplecastCodes.contarPorTier(usuarioId);
        
        return {
          success: true,
          credits: contagem.disponiveis,
          username: 'Códigos cadastrados',
          name: `Anual: ${porTier.YEAR} | Vitalício: ${porTier.LIFETIME}`,
          active: contagem.disponiveis > 0,
          detalhes: { disponiveis: contagem.disponiveis, usados: contagem.usados, total: contagem.total, porTier }
        };
      }

      if (modulo === 'smartone') {
        const usuarioId = credentials.usuarioId;
        if (!usuarioId) {
          return { success: false, error: 'ID do usuário não fornecido' };
        }
        
        const contagem = db.smartoneCodes.contar(usuarioId);
        const porTier = db.smartoneCodes.contarPorTier(usuarioId);
        
        return {
          success: true,
          credits: contagem.disponiveis,
          username: 'Códigos cadastrados',
          name: `Anual: ${porTier.YEAR} | Vitalício: ${porTier.LIFETIME}`,
          active: contagem.disponiveis > 0,
          detalhes: { disponiveis: contagem.disponiveis, usados: contagem.usados, total: contagem.total, porTier }
        };
      }

      if (modulo === 'clouddy') {
        const usuarioId = credentials.usuarioId;
        if (!usuarioId) {
          return { success: false, error: 'ID do usuário não fornecido' };
        }
        
        const temCartao = db.clouddyCards.temCartao(usuarioId);
        
        return {
          success: true,
          credits: temCartao ? '∞' : 0,
          username: temCartao ? 'Cartão configurado' : 'Sem cartão',
          name: temCartao ? 'Cobrança por ativação ($2.00)' : 'Configure seu cartão em Credenciais',
          active: temCartao,
          detalhes: { temCartao, valorPorAtivacao: '$2.00' }
        };
      }

      if (modulo === 'vivo_player') {
        const resultado = await vivoPlayerModule.consultarCreditos(credentials.email, credentials.senha);
        
        if (resultado.success) {
          return {
            success: true,
            credits: resultado.credits,
            username: resultado.username,
            name: resultado.email,
            active: resultado.credits > 0
          };
        }
        
        return { success: false, error: resultado.error };
      }

      // Módulos genéricos
      const moduloConfig = config.MODULOS[modulo];
      if (moduloConfig?.tipo === 'generic_reseller' && moduloConfig?.dominio) {
        return await genericReseller.getCredits(moduloConfig.dominio, credentials, {
          name: moduloConfig.nome
        });
      }

      const activator = this.getActivator(modulo, credentials);
      
      if (typeof activator.getSaldo !== 'function') {
        return { success: false, error: 'Este módulo não suporta consulta de saldo' };
      }

      const resultado = await activator.getSaldo();
      return resultado;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca saldo usando tipo de credencial diretamente
   */
  async getSaldoPorCredencial(credentialType, credentials) {
    try {
      if (credentialType === 'ibosol') {
        return await this.getSaldo('ibo_player', credentials);
      }
      
      if (credentialType === 'multi_player') {
        return await multiPlayerModule.getCredits(credentials);
      }
      
      if (credentialType === 'duplecast') {
        return await this.getSaldo('duplecast', credentials);
      }
      
      if (credentialType === 'smartone') {
        return await this.getSaldo('smartone', credentials);
      }
      
      if (credentialType === 'clouddy' || credentialType === 'clouddy_cards') {
        return await this.getSaldo('clouddy', credentials);
      }
      
      if (credentialType === 'vivo_player') {
        const saldo = await vivoPlayerModule.getSaldo(credentials.email, credentials.senha);
        return { success: true, saldo };
      }
      
      return await this.getSaldo(credentialType, credentials);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Singleton
const activationService = new ActivationService();

module.exports = activationService;