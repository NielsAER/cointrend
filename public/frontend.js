// Constants
const WEBSOCKET_RETRY_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;
const UPDATE_INTERVAL = 30000;

// State management
let socket;
let reconnectAttempts = 0;
let allTokens = [];
let allTrades = [];

// IndexedDB setup
const DB_NAME = 'CryptoDashboard';
const STORE_NAME = 'tokens';
const DB_VERSION = 1;

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'mint' });
            }
        };
    });
}

async function saveTokensToDB(tokens) {
    try {
        const db = await initDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        tokens.forEach(token => store.put(token));
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
    } catch (error) {
        console.error('Error saving to IndexedDB:', error);
    }
}

async function getTokensFromDB() {
    try {
        const db = await initDB();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error reading from IndexedDB:', error);
        return [];
    }
}

// WebSocket setup
function getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = '3001';
    return `${protocol}//${host}:${port}/ws`;
}

function initializeWebSocket() {
    if (socket) {
        socket.close();
    }

    socket = new WebSocket(getWebSocketUrl());
    console.log('Initializing WebSocket connection...');

    socket.onopen = () => {
        console.log('WebSocket Connected');
        reconnectAttempts = 0;
        fetchAndDisplayData();
    };

    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            await processMessage(message);
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    };

    socket.onclose = () => {
        console.log('WebSocket disconnected');
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            setTimeout(initializeWebSocket, WEBSOCKET_RETRY_DELAY);
        } else {
            console.log('Max reconnection attempts reached. Please refresh the page.');
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Message processing
async function processMessage(message) {
    console.log('Processing message:', message);
    
    switch (message.type) {
        case 'initialTokens':
            await handleInitialTokens(message.data);
            break;
        case 'newToken':
            await handleNewToken(message.data);
            break;
        case 'newTrade':
            await handleNewTrade(message.data);
            break;
        default:
            console.log('Unknown message type:', message.type);
    }
}

async function handleInitialTokens(tokens) {
    console.log('Handling initial tokens:', tokens);
    if (!Array.isArray(tokens)) {
        console.error('Invalid tokens data received');
        return;
    }
    
    allTokens = tokens;
    await saveTokensToDB(tokens);
    if (typeof window.filterSortAndDisplayTokens === 'function') {
        window.filterSortAndDisplayTokens();
    }
}

async function handleNewToken(token) {
    console.log('Handling new token:', token);
    if (!token || !token.mint) {
        console.error('Invalid token data received');
        return;
    }
    
    const existingIndex = allTokens.findIndex(t => t.mint === token.mint);
    if (existingIndex !== -1) {
        allTokens[existingIndex] = { ...allTokens[existingIndex], ...token };
    } else {
        allTokens.unshift(token);
    }
    
    await saveTokensToDB(allTokens);
    if (typeof window.filterSortAndDisplayTokens === 'function') {
        window.filterSortAndDisplayTokens();
    }
}

async function handleNewTrade(trade) {
    console.log('Handling new trade:', trade);
    allTrades.unshift(trade);
    if (allTrades.length > 100) allTrades.pop();
    if (typeof window.filterSortAndDisplayTokens === 'function') {
        window.filterSortAndDisplayTokens();
    }
}

async function fetchAndDisplayData() {
    try {
        const baseUrl = window.location.origin;
        const response = await fetch(`${baseUrl}/api/tokens`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const tokens = await response.json();
        
        if (Array.isArray(tokens)) {
            allTokens = tokens;
            await saveTokensToDB(tokens);
            if (typeof window.filterSortAndDisplayTokens === 'function') {
                window.filterSortAndDisplayTokens();
            }
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        const savedTokens = await getTokensFromDB();
        if (savedTokens.length > 0) {
            allTokens = savedTokens;
            if (typeof window.filterSortAndDisplayTokens === 'function') {
                window.filterSortAndDisplayTokens();
            }
        }
    }
}

// Initialize everything
async function initialize() {
    console.log('Initializing application...');
    try {
        await initDB();
        initializeWebSocket();
        await fetchAndDisplayData();
        setInterval(fetchAndDisplayData, UPDATE_INTERVAL);
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// Make everything globally available
window.initializeWebSocket = initializeWebSocket;
window.checkWebSocketConnection = function() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.log('WebSocket not connected. Reinitializing...');
        initializeWebSocket();
    }
};
window.fetchAndDisplayData = fetchAndDisplayData;
window.initialize = initialize;
window.allTokens = allTokens;

// Start the application
document.addEventListener('DOMContentLoaded', initialize);
