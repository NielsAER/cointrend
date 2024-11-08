const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({
    server,
    path: '/ws'
});

const tokensFile = path.join(__dirname, 'tokens.json');
const tradesFile = path.join(__dirname, 'trades.json');

let solPrice = 0;
let trendingCoins = new Set();
let allTokens = [];

async function fetchSolPrice() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const data = await response.json();
        solPrice = data.solana.usd;
        console.log('Updated SOL price:', solPrice);
    } catch (error) {
        console.error('Error fetching SOL price:', error);
    }
}

setInterval(fetchSolPrice, 5 * 60 * 1000);
fetchSolPrice();

async function saveData(file, data) {
    await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function loadData(file) {
    try {
        const data = await fs.readFile(file, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function initializeFiles() {
    try {
        await fs.access(tokensFile);
        allTokens = await loadData(tokensFile);
    } catch {
        allTokens = [];
        await saveData(tokensFile, []);
    }
    try {
        await fs.access(tradesFile);
    } catch {
        await saveData(tradesFile, []);
    }
}

let pumpFunWs;

function connectPumpFunWs() {
    pumpFunWs = new WebSocket('wss://pumpportal.fun/api/data');

    pumpFunWs.on('open', () => {
        console.log('Connected to pumpportal.fun');
        const subscriptions = [
            { method: 'subscribeNewToken' },
            { method: 'subscribeAccountTrade', keys: ["AArPXm8JatJiuyEffuC1un2Sc835SULa4uQqDcaGpAjV"] },
            { method: 'subscribeTokenTrade', keys: ["91WNez8D22NwBssQbkzjy4s2ipFrzpmn5hfvWVe2aY5p"] }
        ];
        subscriptions.forEach(sub => pumpFunWs.send(JSON.stringify(sub)));
    });

    pumpFunWs.on('error', (error) => {
        console.error('PumpPortal WebSocket error:', error);
        // Attempt to reconnect after a delay
        setTimeout(connectPumpFunWs, 5000);
    });

    pumpFunWs.on('message', async (data) => {
        const message = JSON.parse(data);
        console.log('Received from pumpportal:', message);

        if (message.txType === 'create') {
            const imageUrl = await fetchImageUrlFromUri(message.uri);

            const marketCapUsd = message.marketCapSol * solPrice;

            const newToken = {
                ...message,
                timestamp: Date.now(),
                imageUrl: imageUrl,
                marketCapSol: message.marketCapSol,
                marketCapUsd: marketCapUsd,
                marketCapPerCoin: message.marketCapSol / message.initialBuy,
                volume5m: 0,
                volume15m: 0,
                volume1h: 0,
                volume24h: 0,
                holderCount: Math.floor(Math.random() * 1000),
                isTrending: Math.random() < 0.1
            };

            if (newToken.isTrending) {
                trendingCoins.add(newToken.name.toLowerCase());
            }

            allTokens.unshift(newToken);
            if (allTokens.length > 100) allTokens.pop();
            await saveData(tokensFile, allTokens);
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'newToken', data: newToken }));
                }
            });
        } else {
            const newTrade = {
                ...message,
                timestamp: Date.now(),
                volume5m: message.volume5m || 0,
                volume15m: message.volume15m || 0,
                volume1h: message.volume1h || 0,
                volume24h: message.volume24h || 0
            };
            const trades = await loadData(tradesFile);
            trades.unshift(newTrade);
            if (trades.length > 100) trades.pop();
            await saveData(tradesFile, trades);
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'newTrade', data: newTrade }));
                }
            });
        }
    });
}

connectPumpFunWs();

async function fetchImageUrlFromUri(tokenUri) {
    try {
        console.log(`Fetching image from URI: ${tokenUri}`);
        const response = await fetch(tokenUri);
        if (!response.ok) {
            console.error(`Failed to fetch page: ${response.statusText}`);
            return null;
        }

        const json = await response.json();
        const imageUrl = json.image;
        console.log(`Found image URL: ${imageUrl}`);
        return imageUrl;
    } catch (error) {
        console.error('Error fetching image from token URI:', error);
        return null;
    }
}

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/tokens', async (req, res) => {
    const updatedTokens = allTokens.map(token => {
        const isStrongHolderBase = token.holderCount > 500;
        const isSimilarToTrending = Array.from(trendingCoins).some(trendingCoin =>
            token.name.toLowerCase().includes(trendingCoin) ||
            trendingCoin.includes(token.name.toLowerCase())
        );
        return {
            ...token,
            marketCapUsd: token.marketCapSol * solPrice,
            featured: token.isTrending || isStrongHolderBase || isSimilarToTrending
        };
    });
    res.json(updatedTokens);
});

app.get('/api/trades', async (req, res) => {
    const trades = await loadData(tradesFile);
    res.json(trades);
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

wss.on('connection', (ws) => {
    console.log('New client connected, total clients:', wss.clients.size);
    ws.send(JSON.stringify({ type: 'initialTokens', data: allTokens }));

    ws.on('error', (error) => {
        console.error('WebSocket client error:', error);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
});

async function start() {
    await initializeFiles();
    const PORT = process.env.PORT || 3001;

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`WebSocket server is running on ws://localhost:${PORT}/ws`);
    });
}

start();
