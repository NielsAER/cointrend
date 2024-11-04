const WebSocket = require('ws');
const http = require('http');

// Function to get the WebSocket URL based on the environment
function getWebSocketUrl() {
    const port = process.env.PORT || 3001;
    return `ws://${process.env.NODE_ENV === 'production' ? window.location.host : 'localhost:' + port}/ws`;
}

// Create WebSocket connection with retry mechanism
function createWebSocket() {
    const socket = new WebSocket(getWebSocketUrl());

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
        // Attempt to reconnect after 5 seconds
        setTimeout(createWebSocket, 5000);
    });

    return socket;
}

let socket = createWebSocket();

function processMessage(message) {
    if (message.type === 'newToken') {
        console.log('New Token:', message.data);
    } else if (message.type === 'newTrade') {
        console.log('New Trade:', message.data);
    } else if (message.type === 'initialTokens') {
        console.log('Initial Tokens:', message.data);
    }
}

// Function to get the API base URL
function getApiBaseUrl() {
    const port = process.env.PORT || 3001;
    return process.env.NODE_ENV === 'production' 
        ? window.location.origin 
        : `http://localhost:${port}`;
}

async function httpGet(endpoint) {
    const baseUrl = getApiBaseUrl();
    try {
        const response = await fetch(`${baseUrl}${endpoint}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

async function fetchAndDisplayData() {
    try {
        const [tokens, trades] = await Promise.all([
            httpGet('/api/tokens'),
            httpGet('/api/trades')
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

// Export for use in browser
if (typeof window !== 'undefined') {
    window.fetchAndDisplayData = fetchAndDisplayData;
}
