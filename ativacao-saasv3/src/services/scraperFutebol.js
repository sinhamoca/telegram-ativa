// src/services/scraperFutebol.js - Scraper de Jogos de Futebol

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Diretório de cache
const CACHE_DIR = path.join(__dirname, '../../data/cache');

// Garantir que diretório existe
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

class ScraperFutebol {
  constructor() {
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    };
    
    this.url = 'https://doentesporfutebol.com.br/guiadejogos/';
    this.jogos = [];
  }

  /**
   * Busca HTML de uma URL
   */
  async fetchHtml(url) {
    try {
      console.log(`[Scraper] Buscando: ${url}`);
      const response = await axios.get(url, { 
        headers: this.headers,
        timeout: 15000 
      });
      console.log('[Scraper] Página carregada');
      return response.data;
    } catch (error) {
      console.error(`[Scraper] Erro ao buscar ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Retorna data atual no fuso horário de São Paulo (YYYY-MM-DD)
   */
  getDataBrasil(offsetDias = 0) {
    // Criar data no fuso horário de São Paulo
    const agora = new Date();
    
    // Se tem offset, adicionar dias
    if (offsetDias !== 0) {
      agora.setDate(agora.getDate() + offsetDias);
    }
    
    // Converter para string no fuso de São Paulo
    const opcoes = { 
      timeZone: 'America/Sao_Paulo', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    };
    
    // Formatar como YYYY-MM-DD
    const partes = agora.toLocaleDateString('pt-BR', opcoes).split('/');
    return `${partes[2]}-${partes[1]}-${partes[0]}`;
  }

  /**
   * Retorna data formatada (YYYY-MM-DD) com offset de dias
   * CORRIGIDO: usa fuso horário de São Paulo
   */
  getDataFormatada(offsetDias = 0) {
    return this.getDataBrasil(offsetDias);
  }

  /**
   * Retorna dia da semana em português
   */
  getDiaSemana(dataStr) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const data = new Date(dataStr + 'T12:00:00');
    return dias[data.getDay()];
  }

  /**
   * Parse do site doentesporfutebol.com.br
   * O site usa tabs para separar: Horário | Campeonato | Times | Canal
   */
  parseDPF(html) {
    const $ = cheerio.load(html);
    const texto = $('body').text();
    
    const jogos = [];
    const linhas = texto.split('\n').map(l => l.trim()).filter(l => l);
    
    let dataAtual = this.getDataFormatada(0);
    let diaIndex = 0;

    console.log(`[Scraper] Data base (hoje no Brasil): ${dataAtual}`);

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];

      // Detectar mudança de dia
      if (linha.includes('Horário de Brasília')) {
        if (diaIndex > 0) {
          dataAtual = this.getDataFormatada(diaIndex);
          console.log(`[Scraper] Mudança de dia detectada: ${dataAtual}`);
        }
        diaIndex++;
        continue;
      }

      // Detectar linha com horário (formato 🕗 HH:MM ou apenas HH:MM)
      const matchHorario = linha.match(/^🕗?\s*(\d{1,2}:\d{2})/);
      
      if (matchHorario) {
        const horario = matchHorario[1];
        
        // Dividir por tabs para extrair os campos
        const partes = linha.split(/\t+/).map(p => p.trim()).filter(p => p && p !== '🕗');
        
        // Procurar campeonato (geralmente após o horário)
        // Procurar times (formato "Time1 x Time2")
        // Procurar canal (após 📺)
        
        let campeonato = '';
        let timeCasa = '';
        let timeFora = '';
        let canais = [];
        
        for (const parte of partes) {
          // Pular se for só o horário
          if (/^\d{1,2}:\d{2}$/.test(parte)) continue;
          
          // Se tem "x" ou "X", é os times
          const matchTimes = parte.match(/^(.+?)\s+[xX]\s+(.+)$/);
          if (matchTimes) {
            timeCasa = matchTimes[1].trim();
            timeFora = matchTimes[2].trim();
            continue;
          }
          
          // Se começa com 📺, é canal
          if (parte.startsWith('📺')) {
            const canalStr = parte.replace('📺', '').trim();
            if (canalStr) {
              canais = canalStr.split(/[;|]/).map(c => c.trim()).filter(c => c);
            }
            continue;
          }
          
          // Se parece com canal (letras maiúsculas, +, números)
          if (/^[A-Z0-9\s\+]+$/.test(parte) && parte.length < 30) {
            canais.push(parte);
            continue;
          }
          
          // Senão, provavelmente é o campeonato
          if (!campeonato && parte.length > 3) {
            campeonato = parte;
          }
        }
        
        // Só adiciona se tiver os dados mínimos
        if (timeCasa && timeFora) {
          jogos.push({
            data: dataAtual,
            horario,
            campeonato: campeonato || 'Campeonato',
            timeCasa,
            timeFora,
            canais,
            diaSemana: this.getDiaSemana(dataAtual)
          });
        }
      }
    }

    return jogos;
  }

  /**
   * Busca jogos do site
   */
  async buscarJogos() {
    const html = await this.fetchHtml(this.url);
    if (!html) return [];
    
    console.log('[Scraper] Processando dados...');
    const jogos = this.parseDPF(html);
    console.log(`[Scraper] ${jogos.length} jogos encontrados`);
    
    this.jogos = jogos;
    return jogos;
  }

  /**
   * Filtra apenas jogos de hoje
   */
  filtrarHoje() {
    const hoje = this.getDataFormatada(0);
    console.log(`[Scraper] Filtrando jogos de hoje: ${hoje}`);
    const jogosHoje = this.jogos.filter(j => j.data === hoje);
    console.log(`[Scraper] ${jogosHoje.length} jogos encontrados para hoje`);
    return jogosHoje;
  }

  /**
   * Agrupa jogos por campeonato
   */
  agruparPorCampeonato(jogos) {
    const grupos = {};
    
    for (const jogo of jogos) {
      const camp = jogo.campeonato || 'Outros';
      if (!grupos[camp]) {
        grupos[camp] = [];
      }
      grupos[camp].push(jogo);
    }
    
    // Ordenar jogos por horário dentro de cada grupo
    for (const camp in grupos) {
      grupos[camp].sort((a, b) => a.horario.localeCompare(b.horario));
    }
    
    return grupos;
  }

  /**
   * Formata mensagem para envio no Telegram
   */
  formatarMensagem(jogosHoje) {
    if (!jogosHoje || jogosHoje.length === 0) {
      return null;
    }

    // Usar data no fuso de São Paulo
    const hoje = new Date();
    const dataFmt = hoje.toLocaleDateString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      weekday: 'long', 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });

    let msg = `⚽ <b>JOGOS DE HOJE</b>\n`;
    msg += `📅 ${dataFmt}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Ordenar por horário
    const jogosOrdenados = [...jogosHoje].sort((a, b) => a.horario.localeCompare(b.horario));

    for (const jogo of jogosOrdenados) {
      const canaisStr = jogo.canais.length > 0 
        ? jogo.canais.join(' | ') 
        : 'A definir';

      msg += `🏆 ${jogo.campeonato}\n`;
      msg += `⚽ <b>${jogo.timeCasa} x ${jogo.timeFora}</b>\n`;
      msg += `⏰ ${jogo.horario}\n`;
      msg += `📺 ${canaisStr}\n\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📊 <b>Total:</b> ${jogosHoje.length} jogos`;

    return msg;
  }

  /**
   * Salva jogos em cache
   */
  salvarCache(jogos) {
    const hoje = this.getDataFormatada(0);
    const cacheFile = path.join(CACHE_DIR, `jogos_${hoje}.json`);
    
    const cacheData = {
      data_scraping: new Date().toISOString(),
      data_jogos: hoje,
      fuso_horario: 'America/Sao_Paulo',
      total: jogos.length,
      jogos: jogos
    };

    fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf-8');
    console.log(`[Scraper] Cache salvo: ${cacheFile}`);
    
    // Limpar caches antigos (manter só os últimos 3 dias)
    this.limparCachesAntigos();
    
    return cacheFile;
  }

  /**
   * Carrega jogos do cache
   */
  carregarCache() {
    const hoje = this.getDataFormatada(0);
    const cacheFile = path.join(CACHE_DIR, `jogos_${hoje}.json`);
    
    console.log(`[Scraper] Procurando cache: ${cacheFile}`);
    
    if (!fs.existsSync(cacheFile)) {
      console.log('[Scraper] Cache não encontrado para hoje');
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      console.log(`[Scraper] Cache carregado: ${data.total} jogos (data: ${data.data_jogos})`);
      return data;
    } catch (e) {
      console.error('[Scraper] Erro ao ler cache:', e.message);
      return null;
    }
  }

  /**
   * Limpa caches com mais de 3 dias
   */
  limparCachesAntigos() {
    try {
      const arquivos = fs.readdirSync(CACHE_DIR);
      const hoje = new Date();
      
      for (const arquivo of arquivos) {
        if (!arquivo.startsWith('jogos_')) continue;
        
        // Extrair data do nome do arquivo
        const match = arquivo.match(/jogos_(\d{4}-\d{2}-\d{2})\.json/);
        if (!match) continue;
        
        const dataArquivo = new Date(match[1] + 'T12:00:00');
        const diffDias = (hoje - dataArquivo) / (1000 * 60 * 60 * 24);
        
        if (diffDias > 3) {
          const caminhoArquivo = path.join(CACHE_DIR, arquivo);
          fs.unlinkSync(caminhoArquivo);
          console.log(`[Scraper] Cache antigo removido: ${arquivo}`);
        }
      }
    } catch (e) {
      console.error('[Scraper] Erro ao limpar caches:', e.message);
    }
  }

  /**
   * Busca jogos de hoje (do cache ou faz scraping)
   */
  async getJogosHoje(forcarScraping = false) {
    const hoje = this.getDataFormatada(0);
    console.log(`[Scraper] Buscando jogos para: ${hoje}`);
    
    // Tentar carregar do cache primeiro
    if (!forcarScraping) {
      const cache = this.carregarCache();
      if (cache && cache.jogos) {
        // Filtrar apenas jogos de hoje (no caso do cache ter jogos de vários dias)
        const jogosHoje = cache.jogos.filter(j => j.data === hoje);
        if (jogosHoje.length > 0) {
          console.log(`[Scraper] Usando ${jogosHoje.length} jogos do cache`);
          return jogosHoje;
        }
      }
    }

    // Se não tem cache ou forçou scraping, buscar do site
    console.log('[Scraper] Buscando jogos do site...');
    await this.buscarJogos();
    const jogosHoje = this.filtrarHoje();
    
    // Salvar em cache
    if (this.jogos.length > 0) {
      this.salvarCache(this.jogos);
    }
    
    return jogosHoje;
  }

  /**
   * Executa scraping e salva cache (para o cron das 5h)
   */
  async executarScrapingDiario() {
    const hoje = this.getDataFormatada(0);
    console.log(`[Scraper] Executando scraping diário para: ${hoje}`);
    
    await this.buscarJogos();
    
    if (this.jogos.length > 0) {
      this.salvarCache(this.jogos);
      const jogosHoje = this.filtrarHoje();
      console.log(`[Scraper] Scraping concluído: ${jogosHoje.length} jogos hoje, ${this.jogos.length} total`);
      return true;
    }
    
    console.log('[Scraper] Nenhum jogo encontrado');
    return false;
  }
}

// Instância singleton
const scraperInstance = new ScraperFutebol();

module.exports = {
  ScraperFutebol,
  scraper: scraperInstance,
  
  // Funções de conveniência
  getJogosHoje: (forcar) => scraperInstance.getJogosHoje(forcar),
  formatarMensagem: (jogos) => scraperInstance.formatarMensagem(jogos),
  executarScrapingDiario: () => scraperInstance.executarScrapingDiario(),
  carregarCache: () => scraperInstance.carregarCache()
};