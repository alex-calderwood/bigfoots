// App state
const appState = {
    clientId: null,
    socket: null,
    connected: false,
    users: {}, // Map of user IDs to user data
};

const ROLE_COLORS = {
    'audience': '#4CAF50',  // Green
    'artist': '#2196F3',      // Blue
    'operator': '#FF9800',    // Orange
    'dramaturg': '#9C27B0'    // Purple
};

// Send message to server
function sendMessage(msg) {
    if (!appState.socket || !appState.connected) {
        console.error('Not connected to server');
        return;
    }
    console.log("dr->sv:" + msg.type, msg);
    appState.socket.send(JSON.stringify(msg));
}

// Create/update a user card
function refreshUserCard(userData) {
    let userEl = document.getElementById(userData.id);
    
    if (!userEl) {
        userEl = document.createElement('div');
        userEl.id = userData.id;
        userEl.className = 'user-card';
        
        // Make draggable
        userEl.draggable = true;
        userEl.addEventListener('dragstart', (e) => {
            userEl.classList.add('dragging');
        });

        userEl.addEventListener('dragend', (e) => {
            userEl.classList.remove('dragging');
            // Update position while preserving other user data
            const x = e.pageX - (userEl.offsetWidth / 2);
            const y = e.pageY - (userEl.offsetHeight / 2);
            const updatedUserData = {
                ...appState.users[userData.id], // Preserve existing data
                position: { x, y }
            };
            sendMessage({
                type: 'updateUserPosition',
                userId: userData.id,
                position: updatedUserData.position
            });
        });
        
        
        document.getElementById('users').appendChild(userEl);
    }
   
    userEl.innerHTML = `
        <div class="role-indicator" style="background-color: ${ROLE_COLORS[userData.role] || '#666'}"></div>
        <div class="user-emoji">${userData.nick}</div>
        <div class="user-id">${userData.id}</div>
        <div class="user-role">${userData.role || 'unknown'}</div>
        ${userData.feedbacks ? `
            <div class="user-feedbacks">
                ${userData.feedbacks.slice(-3).map(feedback => {
                    switch(feedback.type) {
                        case 'message':
                            return `<div class="feedback-message">"${feedback.text}"</div>`;
                        case 'wav':
                            return `<div class="feedback-audio">🎵 Audio Recording</div>`;
                        case 'png':
                            return `<div class="feedback-image">🖼️ Image</div>`;
                        default:
                            return `<div class="feedback-unknown">📎 ${feedback.type}</div>`;
                    }
                }).join('')}
            </div>
        ` : ''}
    `;


    // Update position if available
    if (userData.position) {
        userEl.style.left = `${userData.position.x}px`;
        userEl.style.top = `${userData.position.y}px`;
    }
}

// Remove a user card
function removeUserCard(userId) {
    const userEl = document.getElementById(userId);
    if (userEl) userEl.remove();
}

// MESSAGE HANDLERS MESSAGE HANDLERS MESSAGE HANDLERS MESSAGE HANDLERS  
function handleInitialize(msg) {
    appState.clientId = msg.clientId;
    appState.users = msg.users;
    
    // Refresh all user cards
    Object.values(appState.users).forEach(refreshUserCard);
}

function handleUpdateUser(msg) {
    appState.users[msg.user.id] = msg.user;  // Just use what server sent
    refreshUserCard(msg.user);
}

function handleDeleteUser(msg) {
    delete appState.users[msg.userId];
    removeUserCard(msg.userId);
}

function handleUserFeedback(msg) {
    console.log('handle feedback', msg)
    if (appState.users[msg.userId]) {
        if (!appState.users[msg.userId].feedbacks) {
            appState.users[msg.userId].feedbacks = [];
        }
        appState.users[msg.userId].feedbacks.push(msg.feedback);
        refreshUserCard(appState.users[msg.userId]);
    }
}
// END MESSAGE HANDLERS END MESSAGE HANDLERS END MESSAGE HANDLERS END MESSAGE HANDLERS 


// Initialize WebSocket
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    appState.socket = new WebSocket(wsUrl);

    appState.socket.addEventListener('open', (event) => {
        console.log('dr->sv:ws:connect');
        appState.connected = true;
        
        // Identify as dramaturg
        sendMessage({
            type: 'identify',
            role: 'dramaturg'
        });
    });

    appState.socket.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        console.log("sv->cl:" + msg.type, msg);

        const handlers = {
            initialize: handleInitialize,
            updateUser: handleUpdateUser,
            deleteUser: handleDeleteUser,
            userFeedback: handleUserFeedback,
        };

        const handler = handlers[msg.type];
        if (!handler) {
            console.error("sv->cl:nohandler", msg);
            return;
        }
        handler(msg);
    });

    appState.socket.addEventListener('close', () => {
        console.log('dr->sv:ws:close');
        appState.connected = false;
        appState.clientId = null;
        
        setTimeout(() => {
            console.log('Attempting to reconnect...');
            initializeWebSocket();
        }, 5000);
    });
}

// Initialize page
function initPage() {
    initializeWebSocket();
    
    document.getElementById('newNote').onclick = () => {
        const colors = ['#ffc', '#cfc', '#ccf', '#fcf', '#fcc'];
        const noteText = document.getElementById('noteText').value || 'New note from dramaturg';
        sendMessage({
            type: 'createNote',
            text: noteText,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
        document.getElementById('noteText').value = ''; // Clear the input after sending
    };
    
    // Prevent default drag behaviors on page
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    document.addEventListener('drop', (e) => {
        e.preventDefault();
    });
}

// Start everything when page loads
window.addEventListener('load', initPage);