// Constants
const ITEMS_PER_PAGE = 20;
let currentPage = 1;
let totalPages = 1;
const DB_NAME = 'TokenDatabase';
const STORE_NAME = 'tokens';
const DB_VERSION = 1;

const socket = new WebSocket('ws://localhost:3001');
const featuredSection = document.getElementById('featured-section');
const tokenGrid = document.getElementById('token-grid');
const sortSelect = document.getElementById('sortSelect');
const orderSelect = document.getElementById('orderSelect');
const resetFiltersButton = document.getElementById('resetFilters');

// Filter elements
const filterElements = {
    minMarketCap: document.getElementById('minMarketCap'),
    maxMarketCap: document.getElementById('maxMarketCap'),
    minComments: document.getElementById('minComments'),
    minVolume5m: document.getElementById('minVolume5m'),
    maxVolume5m: document.getElementById('maxVolume5m'),
    minVolume60m: document.getElementById('minVolume60m'),
    maxVolume60m: document.getElementById('maxVolume60m'),
    minHolders: document.getElementById('minHolders'),
    maxTop10Holders: document.getElementById('maxTop10Holders'),
    sortSelect: sortSelect,
    orderSelect: orderSelect,
    showAnimations: document.getElementById('showAnimations'),
    includeNsfw: document.getElementById('includeNsfw')
};

let allTokens = [];

// IndexedDB setup
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
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        tokens.forEach(token => {
            store.put(token);
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

async function getTokensFromDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Initialize state
async function initializeState() {
    const savedTokens = await getTokensFromDB();
    if (savedTokens && savedTokens.length > 0) {
        allTokens = savedTokens;
        filterSortAndDisplayTokens();
    }

    const savedFilters = localStorage.getItem('cryptoDashboardFilters');
    if (savedFilters) {
        const filters = JSON.parse(savedFilters);
        Object.entries(filters).forEach(([key, value]) => {
            if (filterElements[key]) {
                filterElements[key].value = value;
            }
        });
    }
}

// Fetch and merge data
async function fetchInitialData() {
    try {
        const response = await fetch('./tokens.json');
        const newTokens = await response.json();

        const existingTokens = await getTokensFromDB();
        if (existingTokens && existingTokens.length > 0) {
            newTokens.forEach(newToken => {
                const existingIndex = existingTokens.findIndex(t => t.mint === newToken.mint);
                if (existingIndex !== -1) {
                    existingTokens[existingIndex] = { ...existingTokens[existingIndex], ...newToken };
                } else {
                    existingTokens.push(newToken);
                }
            });
            allTokens = existingTokens;
        } else {
            allTokens = newTokens;
        }

        await saveTokensToDB(allTokens);
        updatePaginationControls();
        filterSortAndDisplayTokens();
    } catch (error) {
        console.error('Error fetching token data:', error);
        const existingTokens = await getTokensFromDB();
        if (existingTokens) {
            allTokens = existingTokens;
            updatePaginationControls();
            filterSortAndDisplayTokens();
        }
    }
}

function createTokenCard(token) {
    const card = document.createElement('div');
    card.className = 'token-card';
    const imageUrl = token.imageUrl || token.uri || 'https://via.placeholder.com/250x200?text=No+Image';

    card.innerHTML = `
        <img src="${imageUrl}" alt="${token.name}" class="token-image" onerror="this.onerror=null; this.src='https://via.placeholder.com/250x200?text=No+Image'">
        <div class="token-info">
            <div class="token-name">${token.name} (ticker: ${token.symbol})</div>
            <div class="creator-info">Created by ${token.creator} ${token.createdAgo}</div>
            <div class="token-details">
                <div>market cap: ${formatMarketCap(token.marketCapUsd)} USD <span class="badge">⚡</span><span class="badge">💎</span></div>
                <div>holders: ${token.holderCount}</div>
                <div>replies: ${token.replies}</div>
                <div>5m volume: ${formatMarketCap(token.volume5m)}</div>
                <div>60m volume: ${formatMarketCap(token.volume60m)}</div>
                <div>top 10 holders: ${token.top10HoldersPercentage}%</div>
                <div>${token.description}</div>
            </div>
        </div>
    `;

    // Add click handler to open detailed view
    card.addEventListener('click', () => {
        const detailUrl = `coin-detail.html?mint=${token.mint}&symbol=${token.symbol}`;
        window.location.assign(detailUrl);
    });

    return card;
}

// Token handling
async function addToken(token) {
    const existingIndex = allTokens.findIndex(t => t.mint === token.mint);
    if (existingIndex !== -1) {
        allTokens[existingIndex] = { ...allTokens[existingIndex], ...token };
    } else {
        allTokens.unshift(token);
    } await saveTokensToDB(allTokens);
    updatePaginationControls();
    filterSortAndDisplayTokens();
}

// Pagination
function updatePaginationControls() {
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

// Filter and display
function filterSortAndDisplayTokens() {
    let filteredTokens = [...allTokens];

    // Apply filters
    filteredTokens = filteredTokens.filter(token => {
        if (filterElements.minMarketCap.value && token.marketCapUsd < parseFloat(filterElements.minMarketCap.value)) return false;
        if (filterElements.maxMarketCap.value && token.marketCapUsd > parseFloat(filterElements.maxMarketCap.value)) return false;
        if (filterElements.minComments.value && token.replies < parseInt(filterElements.minComments.value)) return false;
        if (filterElements.minVolume5m.value && token.volume5m < parseFloat(filterElements.minVolume5m.value)) return false;
        if (filterElements.maxVolume5m.value && token.volume5m > parseFloat(filterElements.maxVolume5m.value)) return false;
        if (filterElements.minVolume60m.value && token.volume60m < parseFloat(filterElements.minVolume60m.value)) return false;
        if (filterElements.maxVolume60m.value && token.volume60m > parseFloat(filterElements.maxVolume60m.value)) return false;
        if (filterElements.minHolders.value && token.holderCount < parseInt(filterElements.minHolders.value)) return false;
        if (filterElements.maxTop10Holders.value && token.top10HoldersPercentage > parseFloat(filterElements.maxTop10Holders.value)) return false;
        return true;
    });

    // Sort tokens
    const sortMethod = filterElements.sortSelect.value;
    const orderMethod = filterElements.orderSelect.value;

    filteredTokens.sort((a, b) => {
        let comparison = 0;
        switch (sortMethod) {
            case 'marketCap':
                comparison = (b.marketCapUsd || 0) - (a.marketCapUsd || 0);
                break;
            case 'featured':
                comparison = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
                break;
            case 'bumpOrder':
                comparison = (b.bumpOrder || 0) - (a.bumpOrder || 0);
                break;
            case 'creationTime':
                comparison = (b.timestamp || 0) - (a.timestamp || 0);
                break;
            case 'lastReply':
                comparison = (b.lastReply || 0) - (a.lastReply || 0);
                break;
            case 'currentlyLive':
                comparison = (b.currentlyLive ? 1 : 0) - (a.currentlyLive ? 1 : 0);
                break;
        }
        return orderMethod === 'asc' ? -comparison : comparison;
    });

    // Calculate pagination
    totalPages = Math.ceil(filteredTokens.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const tokensToDisplay = filteredTokens.slice(startIndex, endIndex);

    // Save filters
    const currentFilters = {};
    Object.entries(filterElements).forEach(([key, element]) => {
        currentFilters[key] = element.value;
    });
    localStorage.setItem('cryptoDashboardFilters', JSON.stringify(currentFilters));

    // Display tokens
    displayFeaturedTokens(tokensToDisplay);
    displayRegularTokens(tokensToDisplay);
    updatePaginationControls();
}

function displayFeaturedTokens(tokens) {
    featuredSection.innerHTML = '';
    const featuredTokens = tokens.filter(token => token.featured);
    const groups = groupSimilarTokens(featuredTokens);

    groups.forEach(group => {
        const groupElement = document.createElement('div');
        groupElement.className = 'featured-group';
        groupElement.innerHTML = `<h2>${group[0].name} Group</h2>`;
        const groupGrid = document.createElement('div');
        groupGrid.className = 'token-grid';
        group.forEach(token => {
            groupGrid.appendChild(createTokenCard(token));
        });
        groupElement.appendChild(groupGrid);
        featuredSection.appendChild(groupElement);
    });
}

function displayRegularTokens(tokens) {
    tokenGrid.innerHTML = '';
    const regularTokens = tokens.filter(token => !token.featured);
    regularTokens.forEach(token => {
        tokenGrid.appendChild(createTokenCard(token));
    });
}

function groupSimilarTokens(tokens) {
    const groups = [];
    const processedTokens = new Set();

    tokens.forEach(token => {
        if (!processedTokens.has(token.mint)) {
            const similarTokens = tokens.filter(t =>
                t.name.toLowerCase().includes(token.name.toLowerCase()) ||
                token.name.toLowerCase().includes(t.name.toLowerCase())
            );
            groups.push(similarTokens);
            similarTokens.forEach(t => processedTokens.add(t.mint));
        }
    });

    return groups;
}

function formatMarketCap(marketCap) {
    if (!marketCap) return 'N/A';
    const cap = parseFloat(marketCap);
    if (isNaN(cap)) return 'N/A';
    if (cap >= 1000000) {
        return '$' + (cap / 1000000).toFixed(2) + 'M';
    } else if (cap >= 1000) {
        return '$' + (cap / 1000).toFixed(2) + 'K';
    } else {
        return '$' + cap.toFixed(2);
    }
}

// Event listeners
document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        filterSortAndDisplayTokens();
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    if (currentPage < totalPages) {
        currentPage++;
        filterSortAndDisplayTokens();
    }
});

resetFiltersButton.addEventListener('click', async function resetAll() {
    // Clear filters
    Object.values(filterElements).forEach(element => {
        if (element.type === 'number') {
            element.value = '';
        } else if (element.tagName === 'SELECT') {
            element.selectedIndex = 0;
        }
    });

    // Clear stored filters
    localStorage.removeItem('cryptoDashboardFilters');

    // Reset pagination
    currentPage = 1;

    // Fetch fresh data
    await fetchInitialData();
});

// Filter change listeners
Object.values(filterElements).forEach(element => {
    if (element.type === 'number') {
        element.addEventListener('input', filterSortAndDisplayTokens);
    } else {
        element.addEventListener('change', filterSortAndDisplayTokens);
    }
});

// WebSocket handlers
socket.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);
        if (message.type === 'newToken') {
            addToken(message.data);
        }
    } catch (error) {
        console.error('Error processing WebSocket message:', error);
    }
};

socket.onclose = () => {
    console.log('WebSocket closed. Attempting to reconnect...');
    setTimeout(() => {
        socket = new WebSocket('ws://localhost:3001');
    }, 3000);
};

// Initialize the dashboard
initializeState();
