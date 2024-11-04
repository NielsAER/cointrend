const WebSocket = require('ws');
const http = require('http');

const socket = new WebSocket('ws://localhost:3001');

socket.on('open', () => {
    console.log('Connected to backend');
});

socket.on('message', (data) => {
    console.log('Received message:', data.toString());
    try {
        const message = JSON.parse(data);
        processMessage(message);
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

socket.on('error', (error) => {
    console.error('WebSocket error:', error);
});

socket.on('close', () => {
    console.log('Disconnected from backend');
});

function processMessage(message) {
    if (message.txType === 'create') {
        console.log('New Token:', message);
    } else {
        console.log('New Trade:', message);
    }
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

async function fetchAndDisplayData() {
    try {
        const [tokens, trades] = await Promise.all([
            httpGet('http://localhost:3001/api/tokens'),
            httpGet('http://localhost:3001/api/trades')
        ]);

        console.clear();
        console.log('Crypto Dashboard\n');

        console.log('New Tokens:');
        tokens.slice(0, 10).forEach(token => {
            console.log(`- ${token.name || 'N/A'} (${token.mint || 'N/A'}) - Created: ${new Date(token.timestamp).toLocaleString() || 'N/A'}`);
        });

        console.log('\nRecent Trades:');
        trades.slice(0, 10).forEach(trade => {
            console.log(`- ${trade.symbol || 'N/A'}: Amount: ${trade.initialBuy || 'N/A'}, Market Cap: ${trade.marketCapSol || 'N/A'} SOL, Type: ${trade.txType || 'N/A'}, Time: ${new Date(trade.timestamp).toLocaleString() || 'N/A'}`);
        });
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Fetch initial data
fetchAndDisplayData();

// Fetch data every 30 seconds
setInterval(fetchAndDisplayData, 30000);
