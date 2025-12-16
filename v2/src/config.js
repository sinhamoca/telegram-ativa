// src/config.js - Configurações do sistema

// Carrega variáveis de ambiente do arquivo .env
require('dotenv').config();

// Validar token obrigatório
if (!process.env.MASTER_BOT_TOKEN) {
  console.error('❌ MASTER_BOT_TOKEN não definido!');
  console.error('Crie um arquivo .env com: MASTER_BOT_TOKEN=seu_token_aqui');
  console.error('Ou execute: MASTER_BOT_TOKEN=seu_token npm start');
  process.exit(1);
}

// Parsear ADMIN_IDS (pode ser string separada por vírgula)
const parseAdminIds = () => {
  const ids = process.env.ADMIN_IDS || '1875737830';
  return ids.split(',').map(id => id.trim()).filter(id => id);
};

module.exports = {
  // Token do Bot Master
  MASTER_BOT_TOKEN: process.env.MASTER_BOT_TOKEN,

  // IDs dos administradores (Telegram IDs)
  ADMIN_IDS: parseAdminIds(),

  // API de Automação (VPS FlareSolverr)
  AUTOMATION_API_URL: process.env.AUTOMATION_API_URL || 'http://95.217.161.109:3099',
  AUTOMATION_API_SECRET: process.env.AUTOMATION_API_SECRET || 'sua_chave_secreta_aqui',

  // Planos disponíveis
  PLANOS: {
    TRIAL: {
      id: 'trial',
      nome: '🎁 Trial',
      ativacoes: 20,
      dias: 7,
      preco: 0
    },
    BASICO: {
      id: 'basico',
      nome: '🥉 Básico',
      ativacoes: 50,
      dias: 30,
      preco: 25
    },
    ILIMITADO: {
      id: 'ilimitado',
      nome: '💎 Ilimitado',
      ativacoes: null,
      dias: 30,
      preco: 50
    }
  },

  // Módulos de ativação disponíveis
  MODULOS: {
    // IBO Pro (credencial separada)
    ibo_pro: {
      id: 'ibo_pro',
      nome: 'IBO Pro',
      credencial: 'ibo_pro',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    // Apps IboSol (usam mesma credencial 'ibosol')
    ibo_player: {
      id: 'ibo_player',
      nome: 'IBO Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    bob_player: {
      id: 'bob_player',
      nome: 'BOB Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    bob_pro: {
      id: 'bob_pro',
      nome: 'BOB Pro',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    bob_premium: {
      id: 'bob_premium',
      nome: 'BOB Premium',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    mac_player: {
      id: 'mac_player',
      nome: 'MAC Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    smartone_pro: {
      id: 'smartone_pro',
      nome: 'SmartOne Pro',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    duplex: {
      id: 'duplex',
      nome: 'Duplex 24',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    king_4k: {
      id: 'king_4k',
      nome: 'King 4K Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    flixnet: {
      id: 'flixnet',
      nome: 'Flixnet',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    abe_player: {
      id: 'abe_player',
      nome: 'ABE Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    virginia: {
      id: 'virginia',
      nome: 'Virginia Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    all_player: {
      id: 'all_player',
      nome: 'ALL Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    hush_play: {
      id: 'hush_play',
      nome: 'Hush Play',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    ktn_player: {
      id: 'ktn_player',
      nome: 'KTN Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    family_player: {
      id: 'family_player',
      nome: 'Family Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    iboss_player: {
      id: 'iboss_player',
      nome: 'iBoss Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    ibo_stb: {
      id: 'ibo_stb',
      nome: 'IBO STB',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    iboxx_player: {
      id: 'iboxx_player',
      nome: 'iBoxx Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    ibosol_player: {
      id: 'ibosol_player',
      nome: 'IboSol Player',
      credencial: 'ibosol',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    
    // ========== MÓDULOS GENÉRICOS ==========
    vu_player_pro: {
      id: 'vu_player_pro',
      nome: 'VU Player Pro',
      credencial: 'vu_player_pro',
      tipo: 'generic_reseller',
      dominio: 'vuproplayer.org',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    enzo_player: {
      id: 'enzo_player',
      nome: 'EnzoPlayer',
      credencial: 'enzo_player',
      tipo: 'generic_reseller',
      dominio: 'enzoplayer.com',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    rivolut: {
      id: 'rivolut',
      nome: 'Rivolut Player',
      credencial: 'rivolut',
      tipo: 'generic_reseller',
      dominio: 'rivolutplayer.com',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    cap_player: {
      id: 'cap_player',
      nome: 'Cap Player',
      credencial: 'cap_player',
      tipo: 'generic_reseller',
      dominio: 'capplayer.com',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    
    // ========== OUTROS MÓDULOS ==========
    dreamtv: {
      id: 'dreamtv',
      nome: 'DreamTV',
      credencial: 'dreamtv',
      tiers: {
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' },
        YEAR: { id: 'YEAR', nome: 'Anual' }
      }
    },
    lazer_play: {
      id: 'lazer_play',
      nome: 'Lazer Play',
      credencial: 'lazer_play',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' }
      }
    },
    lumina: {
      id: 'lumina',
      nome: 'Lumina Player',
      credencial: 'lumina',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    assist_plus: {
      id: 'assist_plus',
      nome: 'Assist+',
      credencial: 'assist_plus',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    duplecast: {
      id: 'duplecast',
      nome: 'Duplecast',
      credencial: 'duplecast_codes',
      usaCodigos: true,
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    smartone: {
      id: 'smartone',
      nome: 'SmartOne IPTV',
      credencial: 'smartone_codes',
      usaCodigos: true,
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' },
        LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' }
      }
    },
    vivo_player: {
      id: 'vivo_player',
      nome: 'Vivo Player',
      credencial: 'vivo_player',
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' }
      }
    },
    clouddy: {
      id: 'clouddy',
      nome: 'Clouddy',
      credencial: 'clouddy_cards',
      usaCartao: true,
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' }
      }
    },
    quick_player: {
      id: 'quick_player',
      nome: 'Quick Player',
      credencial: 'quick_player',
      requerOtp: true,
      tiers: {
        YEAR: { id: 'YEAR', nome: 'Anual' }
      }
    },
    
    // ========== MULTI-PLAYER APPS ==========
    mp_iptv_player_io: { id: 'mp_iptv_player_io', nome: 'IPTV Player io', credencial: 'multi_player', app_id: 1, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_iptv_ott: { id: 'mp_iptv_ott', nome: 'IPTV OTT Player', credencial: 'multi_player', app_id: 2, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_iptv_4k: { id: 'mp_iptv_4k', nome: 'IPTV 4K', credencial: 'multi_player', app_id: 3, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_iptv_stream: { id: 'mp_iptv_stream', nome: 'IPTV Stream Player', credencial: 'multi_player', app_id: 4, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_iptv_player: { id: 'mp_iptv_player', nome: 'IPTV Player', credencial: 'multi_player', app_id: 5, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_iptv_play: { id: 'mp_iptv_play', nome: 'IPTV Play', credencial: 'multi_player', app_id: 6, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_iptv_plus: { id: 'mp_iptv_plus', nome: 'IPTV Plus', credencial: 'multi_player', app_id: 7, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_iptv_pro: { id: 'mp_iptv_pro', nome: 'IPTV Pro', credencial: 'multi_player', app_id: 8, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_pro_player: { id: 'mp_pro_player', nome: 'PRO Player', credencial: 'multi_player', app_id: 9, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_iptv_star: { id: 'mp_iptv_star', nome: 'IPTV Star', credencial: 'multi_player', app_id: 10, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_tvip_player: { id: 'mp_tvip_player', nome: 'TVIP Player', credencial: 'multi_player', app_id: 11, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_ego_iptv: { id: 'mp_ego_iptv', nome: 'EGO IPTV', credencial: 'multi_player', app_id: 12, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_scandic_iptv: { id: 'mp_scandic_iptv', nome: 'SCANDIC IPTV', credencial: 'multi_player', app_id: 13, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_flixtra: { id: 'mp_flixtra', nome: 'Flixtra Player', credencial: 'multi_player', app_id: 15, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_ibo_premium: { id: 'mp_ibo_premium', nome: 'IBO Player Premium', credencial: 'multi_player', app_id: 21, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } },
    mp_duplex: { id: 'mp_duplex', nome: 'IPTV Duplex Player', credencial: 'multi_player', app_id: 22, tiers: { YEAR: { id: 'YEAR', nome: 'Anual' }, LIFETIME: { id: 'LIFETIME', nome: 'Vitalício' } } }
  },

  // Tipos de credenciais
  CREDENCIAIS: {
    ibo_pro: { id: 'ibo_pro', nome: 'IBO Pro', campos: ['username', 'password'] },
    ibosol: { id: 'ibosol', nome: 'IboSol (IBO Player, BOB Player, etc)', campos: ['email', 'password'] },
    vu_player_pro: { id: 'vu_player_pro', nome: 'VU Player Pro', campos: ['email', 'password'] },
    enzo_player: { id: 'enzo_player', nome: 'EnzoPlayer', campos: ['email', 'password'] },
    rivolut: { id: 'rivolut', nome: 'Rivolut Player', campos: ['email', 'password'] },
    cap_player: { id: 'cap_player', nome: 'Cap Player', campos: ['email', 'password'] },
    dreamtv: { id: 'dreamtv', nome: 'DreamTV', campos: ['email', 'password'] },
    lazer_play: { id: 'lazer_play', nome: 'Lazer Play', campos: ['email', 'password'] },
    lumina: { id: 'lumina', nome: 'Lumina Player', campos: ['email', 'password'] },
    assist_plus: { id: 'assist_plus', nome: 'Assist+', campos: ['email', 'password'] },
    vivo_player: { id: 'vivo_player', nome: 'Vivo Player', campos: ['email', 'senha'] },
    quick_player: { id: 'quick_player', nome: 'Quick Player', campos: ['username', 'password'] },
    multi_player: { id: 'multi_player', nome: 'Multi-Player (IPTV Player io, OTT, 4K, Duplex, etc)', campos: ['email', 'password'] },
    clouddy_cards: { id: 'clouddy_cards', nome: 'Clouddy (Cartão de Crédito)', campos: ['cardNumber', 'cardExpiry', 'cardCvc', 'cardName', 'cardEmail'] },
    mercadopago: { id: 'mercadopago', nome: 'Mercado Pago', campos: ['accessToken'] }
  },

  // Configurações de notificação
  NOTIFICACOES: {
    DIAS_ANTES_VENCIMENTO: 1,
    HORA_ENVIO: 7
  },

  // Mercado Pago (suas credenciais para receber mensalidades)
  MERCADO_PAGO_MASTER: {
    accessToken: process.env.MP_ACCESS_TOKEN || ''
  },

  // SmartOne IPTV - Credenciais globais
  SMARTONE: {
    email: process.env.SMARTONE_EMAIL || '',
    password: process.env.SMARTONE_PASSWORD || '',
    enabled: !!(process.env.SMARTONE_EMAIL && process.env.SMARTONE_PASSWORD)
  },

  // FlareSolverr - Para bypass Cloudflare
  FLARESOLVERR: {
    url: process.env.FLARESOLVERR_URL || 'http://95.217.161.109:8191/v1'
  },

  // 2Captcha - Para resolver CAPTCHAs
  TWOCAPTCHA: {
    key: process.env.CAPTCHA_2CAPTCHA_KEY || ''
  },

  // Duplecast - Credenciais globais
  DUPLECAST: {
    email: process.env.DUPLECAST_EMAIL || '',
    password: process.env.DUPLECAST_PASSWORD || '',
    enabled: !!(process.env.DUPLECAST_EMAIL && process.env.DUPLECAST_PASSWORD)
  },

  // Captcha
  CAPTCHA: {
    TWO_CAPTCHA: {
      apiKey: process.env.CAPTCHA_2CAPTCHA_KEY || '',
      enabled: !!process.env.CAPTCHA_2CAPTCHA_KEY
    },
    ANTI_CAPTCHA: {
      apiKey: process.env.CAPTCHA_ANTICAPTCHA_KEY || '',
      enabled: !!process.env.CAPTCHA_ANTICAPTCHA_KEY
    },
    defaultService: process.env.CAPTCHA_DEFAULT_SERVICE || '2captcha'
  },

  // Helpers
  isAdmin(telegramId) {
    return this.ADMIN_IDS.includes(telegramId.toString());
  },

  getPlanoById(planoId) {
    return Object.values(this.PLANOS).find(p => p.id === planoId);
  }
};