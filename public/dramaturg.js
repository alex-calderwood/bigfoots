// App state
const appState = {
    clientId: null,
    socket: null,
    connected: false,
    users: {}, // Map of user IDs to user data
    broadcastRoles: {
        audio: 'audience',
        prompt: 'audience', 
        speak: 'performer'
    }
};

const roleIcons = {
    'audience': '👁️',
    'performer': '🎭',
    'dramaturg': '📝'
};

// Send message to server
function sendMessage(msg) {
    if (!appState.socket || !appState.connected) {
        console.error('Not connected to server');
        return;
    }
    logMsg("dr->sv:", msg, + msg.type);
    appState.socket.send(JSON.stringify(msg));
}

// Create/update a user card
function refreshUserList(userData) {
    // Get or create users list container
    let usersList = document.getElementById('users');
    if (!usersList) {
        const containerEl = document.createElement('div');
        containerEl.className = 'users-container';
        containerEl.innerHTML = `
            <div class="users-tab" onclick="toggleUsersPanel()">Users (<span id="user-count">0</span>)</div>
            <div id="users" class="users-list"></div>
        `;
        document.body.appendChild(containerEl);
        usersList = document.getElementById('users');
    }

    // Update or create user row
    let userEl = document.getElementById(userData.id);
    if (!userEl) {
        userEl = document.createElement('div');
        userEl.id = userData.id;
        userEl.className = 'user-row';
        usersList.appendChild(userEl);
    }

    // Format the feedback HTML if there are feedbacks
    const feedbacksHtml = userData.feedbacks?.length ? `
        <div class="feedback-section">
            <div class="user-feedbacks" style="display: none">
                ${userData.feedbacks.slice(-3).map(feedback => `
                    <div class="feedback">
                        <div class="feedback-text">${feedback.text}</div>
                        ${feedback.attachment ? `
                            <div class="feedback-attachment">
                                ${feedback.attachment.type.startsWith('image/') ? 
                                    `<img src="${feedback.attachment.data}" alt="feedback image">` :
                                feedback.attachment.type.startsWith('audio/') ? 
                                    `<audio controls src="${feedback.attachment.data}"></audio>` :
                                feedback.attachment.type.startsWith('video/') ? 
                                    `<video controls src="${feedback.attachment.data}"></video>` :
                                    `📎 ${feedback.attachment.name}`
                                }
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
            <button class="toggle-feedback" onclick="toggleFeedback(this)">feedback</button>
        </div>
    ` : '';


    userEl.innerHTML = `
        <div class="user-info">
            <span class="role-icon">${roleIcons[userData.role] || '❓'}</span>
            <span class="user-emoji">${userData.nick}</span>
            <span class="user-id">${userData.id}</span>
            <button class="role-toggle" onclick="toggleRole('${userData.id}', '${userData.role}')">
                ${userData.role}
            </button>
        </div>
        ${feedbacksHtml}
    `;

    // Update user count
    const userCount = document.getElementById('user-count');
    if (userCount) {
        userCount.textContent = usersList.children.length;
    }
}

// Add this new function to handle feedback toggle
function toggleFeedback(button) {
    const feedbacksDiv = button.parentElement.querySelector('.user-feedbacks');
    const isHidden = feedbacksDiv.style.display === 'none';
    feedbacksDiv.style.display = isHidden ? 'block' : 'none';
    button.textContent = isHidden ? 'hide' : 'feedback';
}

// Remove a user card
function removeUserCard(userId) {
    const userEl = document.getElementById(userId);
    if (userEl) userEl.remove();
}

// ---------------- MESSAGE HANDLERS ----------------
function handleInitialize(msg) {
    appState.clientId = msg.clientId;
    appState.users = msg.users;
    console.log("HANDLE INITIALIZE", appState.users)
    
    // Refresh all user cards
    Object.values(appState.users).forEach(refreshUserList);
}

function handleUpdateUser(msg) {
    appState.users[msg.user.id] = msg.user;  // Just use what server sent
    refreshUserList(msg.user);
}

function handleClientLeft(msg) {
    delete appState.users[msg.clientId]
}

function handleDeleteUser(msg) {
    delete appState.users[msg.userId];
    removeUserCard(msg.userId);
}

function handleUserFeedback(msg) {
    if (appState.users[msg.userId]) {
        if (!appState.users[msg.userId].feedbacks) {
            appState.users[msg.userId].feedbacks = [];
        }
        appState.users[msg.userId].feedbacks.push(msg.feedback);
        refreshUserList(appState.users[msg.userId]);
    }
}

function handlePromptResponse(msg) {
    if (appState.users[msg.userId]) {
        if (!appState.users[msg.userId].feedbacks) {
            appState.users[msg.userId].feedbacks = [];
        }
        appState.users[msg.userId].feedbacks.push(msg.feedback);
        refreshUserList(appState.users[msg.userId]);
    }
    
    const broadcast = document.getElementById("prompts");
    const response = document.createElement('div');
    response.className = 'response';
    response.innerHTML = `
        <div class="prompt">
            <span class="role-icon">${roleIcons[msg.sendToRole] || '❓'}</span>
            ${msg.prompt}
        </div>
        <div class="arrow">→</div>
        <div class="ai-response">${msg.response || 'Waiting for response...'}</div>
    `;
    
    broadcast.appendChild(response);
}
// ---------------- END MESSAGE HANDLERS ----------------

// Initialize WebSocket
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    appState.socket = new WebSocket(wsUrl);

    appState.socket.addEventListener('open', (event) => {
        console.log('dr->sv:ws:connect');
        appState.connected = true;
        
        sendMessage({ // Identify as dramaturg
            type: 'identify',
            role: 'dramaturg'
        });
    });

    appState.socket.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        console.log("sv->cl:" + msg.type, msg);

        const handlers = {
            initialize:     handleInitialize,
            updateUser:     handleUpdateUser,
            deleteUser:     handleDeleteUser,
            userFeedback:   handleUserFeedback,
            clientLeft:     handleClientLeft,
            promptResponse: handlePromptResponse,
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

    document.getElementById('startBroadcast').onclick = handleStartBroadcast;
}

document.getElementById('sendPrompt').onclick = sendPrompt;
document.getElementById('speakToPerformer').onclick = speakTo;


function handleStartBroadcast() {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(stream => {
        const audioContext = new AudioContext();
        audioContext.resume();
        
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = createAudioMeter(audioContext, document.getElementById('broadcast'));
        const processor = audioContext.createScriptProcessor(1024, 1, 1);
        
        // Chain: source -> analyser -> processor -> destination
        source.connect(analyser);
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        processor.onaudioprocess = (e) => {
            const audioData = e.inputBuffer.getChannelData(0);
            sendMessage({
                type: 'audio',
                data: Array.from(audioData),
                format: {
                    codec: 'pcm',
                    sampleRate: audioContext.sampleRate,
                    channels: 1,
                    frameSize: 1024,
                },
                sendToRole: appState.broadcastRoles.audio
            });
        };
        
        console.log("dr: Started broadcasting audio");
    })
    .catch(err => console.error('Error accessing microphone:', err)); 
}


function sendPrompt() {
    const text = document.getElementById('prompt').value;
    if (text.trim()) {
        sendMessage({
            type: 'prompt',
            text: text,
            sendToRole: appState.broadcastRoles.prompt,
        });
        document.getElementById('prompt').value = '';
    }
}

function speakTo() {
    const text = document.getElementById('speakToText').value;
    if (text.trim()) {
        sendMessage({
            type: 'speak',
            text: text,
            sendToRole: appState.broadcastRoles.speak,
        });
        document.getElementById('speakToText').value = '';
    }
}

function initializeUsersPanel() {
    const container = document.querySelector('.users-container');
    const tab = document.querySelector('.users-tab');
    const containerHeight = container.offsetHeight;
    
    // Set initial position of the tab
    tab.style.bottom = containerHeight + 'px';
}

// Call it when the page loads
window.addEventListener('load', initializeUsersPanel);

function toggleUsersPanel() {
    const container = document.querySelector('.users-container');
    const tab = document.querySelector('.users-tab');
    const isHidden = container.classList.toggle('hidden');
    const containerHeight = container.offsetHeight;
    
    if (isHidden) {
        tab.style.bottom = '0';
    } else {
        tab.style.bottom = containerHeight + 'px';
    }
}

window.addEventListener('load', initPage);

// Add these new functions
function toggleRole(userId, currentRole) {
    const roles = ['audience', 'performer'];
    const currentIndex = roles.indexOf(currentRole);
    const nextRole = roles[(currentIndex + 1) % roles.length];
    
    sendMessage({
        type: 'updateRole',
        userId: userId,
        newRole: nextRole
    });
}

function toggleBroadcastRole(type) {
    const roles = ['audience', 'performer'];
    const button = document.querySelector(`button[onclick="toggleBroadcastRole('${type}')"]`);
    const currentRole = appState.broadcastRoles[type];
    const currentIndex = roles.indexOf(currentRole);
    const nextRole = roles[(currentIndex + 1) % roles.length];
    
    appState.broadcastRoles[type] = nextRole;
    
    // Update both the icon and text
    button.innerHTML = `
        <span class="role-icon">${roleIcons[nextRole]}</span>
        <span>${nextRole}</span>
    `;
}