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
    logMsg("dr->sv:", msg, + msg.type);
    appState.socket.send(JSON.stringify(msg));
}


// Create/update a user card
function refreshUserCard(userData) {
    console.log("REFRESHING", userData, userData.role);
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
        ${userData.feedbacks ? `
            <div class="feedback-header">
                <button class="toggle-feedback" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.textContent = this.nextElementSibling.style.display === 'none' ? 'feedback' : 'hide'">feedback</button>
                <div class="user-feedbacks" style="display: none">
                    ${userData.feedbacks.slice(-3).map(feedback => 
                        `<div class="feedback">
                            ${JSON.stringify(feedback.text)}
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
                        </div>`
                    ).join('')}
                </div>
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

// ---------------- MESSAGE HANDLERS ----------------
function handleInitialize(msg) {
    appState.clientId = msg.clientId;
    appState.users = msg.users;
    console.log("HANDLE INITIALIZE", appState.users)
    
    // Refresh all user cards
    Object.values(appState.users).forEach(refreshUserCard);
}

function handleUpdateUser(msg) {
    appState.users[msg.user.id] = msg.user;  // Just use what server sent
    refreshUserCard(msg.user);
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
        refreshUserCard(appState.users[msg.userId]);
    }
}

function handlePromptResponse(msg) {
    if (appState.users[msg.userId]) {
        if (!appState.users[msg.userId].feedbacks) {
            appState.users[msg.userId].feedbacks = [];
        }
        appState.users[msg.userId].feedbacks.push(msg.feedback);
        refreshUserCard(appState.users[msg.userId]);
    }
    const broadcast = document.getElementById("aibroadcast");
    const response = document.createElement('div');
    response.className = 'response';
    response.innerHTML = `
        <div class="prompt">${msg.prompt}</div>
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
    document.getElementById('sendPrompt').onclick = sendPrompt;
}

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
                    frameSize: 1024  // Could be useful for debugging/optimization
                }
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
            text: text
        });
        document.getElementById('prompt').value = ''; // Clear input after sending
    }
}

window.addEventListener('load', initPage);