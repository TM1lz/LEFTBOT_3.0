const WebSocket = require('ws');

// URL corrigida para o WebSocket de Testnet da Binance Spot
const WS_URL = 'wss://stream.testnet.binance.vision/ws/paxgusdt@ticker';

function conectarWebSocket() {
    console.log('Conectando ao WebSocket da Binance Testnet...');
    const ws = new WebSocket(WS_URL);

    ws.on('open', function open() {
        console.log(' Conectado com sucesso ao fluxo de preços do Ouro (PAXG)!\n');
    });

    ws.on('message', function incoming(data) {
        const parsedData = JSON.parse(data);
        
        
        if (parsedData.c) {
            const preco = parseFloat(parsedData.p).toFixed(2);
            const horario = new Date().toLocaleTimeString('pt-BR');
            console.log(`[${horario}] Preço Atual do Ouro (PAXG): US$ ${preco}`);
        }
    });

    ws.on('error', function error(err) {
        console.error(' Erro no WebSocket:', err.message);
    });

    ws.on('close', function close(code, reason) {
        console.log(`Conexão fechada (Código: ${code}). Tentando reconectar em 5 segundos...`);
        setTimeout(conectarWebSocket, 5000);
    });
}

conectarWebSocket();