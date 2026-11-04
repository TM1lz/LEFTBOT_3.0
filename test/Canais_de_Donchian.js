const WebSocket = require('ws');

// --- PARÂMETROS DA ESTRATÉGIA COM FILTROS ---
const LENGTH = 20;               // Período do canal de Donchian
const EMA_PERIOD = 100;          // Período da Média Móvel Exponencial para tendência
const VOLUME_MULTIPLIER = 1.5;   // Volume do rompimento deve ser 1.5x a média
const RISK_REWARD = 2.0;         // Relação Risco/Retorno otimizada (1:2)

let candles = [];                
let position = null;             // null, 'LONG', ou 'SHORT'
let entryPrice = 0;
let stopLoss = 0;
let takeProfit = 0;

// Conectando ao feed de trades da Binance para BTCUSDT
const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');

ws.on('open', function open() {
    console.log('🔗 Conectado ao feed da Binance com Filtros de Tendência e Volume ativados...');
});

ws.on('message', function incoming(data) {
    const trade = JSON.parse(data);
    const price = parseFloat(trade.p);
    const volume = parseFloat(trade.q); // Quantidade negociada no trade
    const timestamp = trade.T;

    processTick(price, volume, timestamp);
});

function processTick(currentPrice, currentVolume, timestamp) {
    let currentCandle = {
        time: timestamp,
        open: currentPrice,
        high: currentPrice * 1.0002, 
        low: currentPrice * 0.9998,
        close: currentPrice,
        volume: currentVolume
    };

    if (candles.length === 0 || candles[candles.length - 1].time !== timestamp) {
        candles.push(currentCandle);
    } else {
        // Acumula volume no mesmo candle se for do mesmo milissegundo/bloco
        candles[candles.length - 1].volume += currentVolume;
        candles[candles.length - 1].high = Math.max(candles[candles.length - 1].high, currentPrice);
        candles[candles.length - 1].low = Math.min(candles[candles.length - 1].low, currentPrice);
        candles[candles.length - 1].close = currentPrice;
    }

    if (candles.length > 300) {
        candles.shift();
    }

    // Precisamos de pelo menos EMA_PERIOD candles para calcular a tendência
    if (candles.length > EMA_PERIOD) {
        runStrategyWithFilters(candles);
    }
}

// Função auxiliar para calcular a EMA (Média Móvel Exponencial)
function calculateEMA(data, period) {
    let k = 2 / (period + 1);
    let emaArray = [data[0]];
    for (let i = 1; i < data.length; i++) {
        emaArray.push((data[i] * k) + (emaArray[i - 1] * (1 - k)));
    }
    return emaArray;
}

function runStrategyWithFilters(candleList) {
    let i = candleList.length - 1;
    let slice = candleList.slice(i - LENGTH, i);
    let upper = Math.max(...slice.map(c => c.high));
    let lower = Math.min(...slice.map(c => c.low));

    let currentCandle = candleList[i];
    let prevCandle = candleList[i - 1];

    // 1. Cálculo da Tendência (EMA)
    let closes = candleList.map(c => c.close);
    let emaValues = calculateEMA(closes, EMA_PERIOD);
    let currentEMA = emaValues[emaValues.length - 1];

    // 2. Cálculo do Filtro de Volume (Média de volume dos últimos 20 candles)
    let volumeSlice = candleList.slice(i - 20, i);
    let avgVolume = volumeSlice.reduce((sum, c) => sum + c.volume, 0) / volumeSlice.length;
    let hasHighVolume = currentCandle.volume > (avgVolume * VOLUME_MULTIPLIER);

    // Gerenciamento de Posição Aberta (Stop Loss / Take Profit)
    if (position !== null) {
        if (position === 'LONG') {
            if (currentCandle.low <= stopLoss) {
                console.log(`❌ [STOP LOSS] Compra encerrada a $${stopLoss.toFixed(2)}`);
                position = null;
            } else if (currentCandle.high >= takeProfit) {
                console.log(`✅ [TAKE PROFIT] Alvo atingido na Compra a $${takeProfit.toFixed(2)}`);
                position = null;
            }
        } else if (position === 'SHORT') {
            if (currentCandle.high >= stopLoss) {
                console.log(`❌ [STOP LOSS] Venda encerrada a $${stopLoss.toFixed(2)}`);
                position = null;
            } else if (currentCandle.low <= takeProfit) {
                console.log(`✅ [TAKE PROFIT] Alvo atingido na Venda a $${takeProfit.toFixed(2)}`);
                position = null;
            }
        }
    }

    // Condições de Entrada com os Novos Filtros
    if (position === null) {
        // Condição base de rompimento
        let rawLongBreakout = (prevCandle.close <= upper) && (currentCandle.close > upper);
        let rawShortBreakout = (prevCandle.close >= lower) && (currentCandle.close < lower);

        // Aplicação dos Filtros de Eficiência
        let longCondition = rawLongBreakout && (currentCandle.close > currentEMA) && hasHighVolume;
        let shortCondition = rawShortBreakout && (currentCandle.close < currentEMA) && hasHighVolume;

        if (longCondition) {
            position = 'LONG';
            entryPrice = currentCandle.close;
            stopLoss = lower; 
            takeProfit = entryPrice + ((entryPrice - stopLoss) * RISK_REWARD);
            console.log(`🚀 [COMPRA FILTRADA] BTC Rompeu para cima com Volume e Tendência de Alta! Preço: $${entryPrice.toFixed(2)}`);
        } else if (shortCondition) {
            position = 'SHORT';
            entryPrice = currentCandle.close;
            stopLoss = upper; 
            takeProfit = entryPrice - ((stopLoss - entryPrice) * RISK_REWARD);
            console.log(`📉 [VENDA FILTRADA] BTC Rompeu para baixo com Volume e Tendência de Baixa! Preço: $${entryPrice.toFixed(2)}`);
        }
    }
}