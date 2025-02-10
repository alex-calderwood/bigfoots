const appState = {
    clientId: null,
    socket: null,
    connected: false,
    notes: {},
    peerConnection: null,
    audioContext: null,
    analyser: null,
    nick: null,
    role: 'audience'
};
  
// Send message to server
function sendMessage(msg) {
  if (!appState.socket || !appState.connected) {
    console.error('Not connected to server');
    return;
  }
  console.log("cl->sv:" + msg.type, msg);
  appState.socket.send(JSON.stringify(msg));
}
// Used to send something back to the performance / dramaturg
function sendFeedback(feedbackData) {
  sendMessage({
        type: 'sendFeedback',
        feedback: {
            ...feedbackData,
            timestamp: Date.now()
        }
    });
}

// ---------------- MESSAGE HANDLERS ----------------
function handleInitialize(msg) {
  appState.clientId = msg.clientId;
  appState.notes = msg.notes;
  refreshAllNotes();
}

function handleUpdateNote(msg) {
  appState.notes[msg.note.id] = msg.note;
  refreshNote(msg.note);
}

function handleDeleteNote(msg) {
  delete appState.notes[msg.noteId];
  const noteEl = document.getElementById(msg.noteId);
  if (noteEl) noteEl.remove();
}
// ---------------- END MESSAGE HANDLERS ----------------

function refreshNote(note) {
  let noteEl = document.getElementById(note.id);
  
  if (!noteEl) {
    noteEl = document.createElement('div');
    noteEl.id = note.id;
    noteEl.className = 'note';
    document.getElementById('notes').appendChild(noteEl);
    
    const textEl = document.createElement('div');
    textEl.innerText = note.text;

    noteEl.appendChild(textEl);
  }
}

function refreshAllNotes() {
  document.getElementById('notes').innerHTML = '';
  Object.values(appState.notes).forEach(refreshNote);
}

// Initialize WebSocket
function initializeWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  appState.socket = new WebSocket(wsUrl);

  appState.socket.addEventListener('open', (event) => {
    console.log('cl->sv:ws:connect');
    appState.connected = true;

    sendMessage({
      type: 'identify',
      role: appState.role,
      nick: appState.nick
    });
  });

  appState.socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    logMsg("sv->cl:", msg, msg.type)

    const handlers = {
      initialize: handleInitialize,
      updateNote: handleUpdateNote,
      deleteNote: handleDeleteNote,
      audio: handleAudioData,
      roleChanged: handleRoleChanged,
    };

    const handler = handlers[msg.type];
    if (!handler) {
      console.error("sv->cl:nohandler", msg);
      return;
    }
    handler(msg);
  });

  appState.socket.addEventListener('close', () => {
    console.log('cl->sv:ws:close');
    appState.connected = false;
    appState.clientId = null;
    
    setTimeout(() => {
      console.log('Attempting to reconnect...');
      initializeWebSocket();
    }, 5000);
  });
}

document.getElementById('sendNote').onclick = async () => {
    const noteInput = document.getElementById('noteInput');
    // const fileInput = document.getElementById('attachFile'); // send file
    const text = noteInput.value.trim();
    // const file = fileInput.files[0]; // // send file
    
    if (text || file) {
        const feedbackData = {
            type: 'message',
            text: text
        };

        // // send file
        // if (file) {
        //     const fileReader = new FileReader();
        //     fileReader.onload = function(e) {
        //         feedbackData.attachment = {
        //             type: file.type,
        //             name: file.name,
        //             data: e.target.result
        //         };
        //         sendFeedback(feedbackData);
        //     };
        //     fileReader.readAsDataURL(file);
        // } else {
        //     sendFeedback(feedbackData);
        // }
        
          // Clear inputs
          noteInput.value = '';
          // fileInput.value = ''; // send file
          // document.getElementById('fileName').textContent = ''; // send file
          document.querySelector('.preview-container').style.display = 'none';
    }
};
  
// Initialize page
function initPage() {
  promptForName();
  // Removed tuneIn button handler
  // document.getElementById('attachFile').addEventListener('change', handleFileSelect); // send file
}

function promptForName() {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const form = document.createElement('div');
  form.className = 'form';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Enter your name';
  input.style.marginBottom = '10px';
  
  const button = document.createElement('button');
  button.textContent = 'Join';
  
  form.appendChild(input);
  form.appendChild(document.createElement('br'));
  form.appendChild(button);
  overlay.appendChild(form);
  document.body.appendChild(overlay);

  // Handle form submission
  function handleSubmit() {
    const name = input.value.trim();
    if (name) {
      document.body.removeChild(overlay);
      appState.nick = '👤' + name.slice(-12);
      document.querySelector('.status .nick').textContent = appState.nick;
      initializeWebSocket();
      handleTuneIn(); // Auto-tune in when joining
    }
  }

  button.onclick = handleSubmit;
  input.onkeypress = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };
}

function handleTuneIn() {    
    if (!appState.audioContext) {
        appState.audioContext = new AudioContext();
        appState.audioContext.resume();
        
        // Create and connect audio nodes
        appState.audioWorklet = appState.audioContext.createGain();
        appState.analyser = createAudioMeter(appState.audioContext, document.getElementById('broadcast'));
        appState.audioWorklet.connect(appState.analyser);
        appState.analyser.connect(appState.audioContext.destination);
    } else {
        // Clean up audio context and UI
        appState.audioContext.close();
        appState.audioContext = null;
        document.getElementById('broadcast').innerHTML = '';
    }
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) {
      document.querySelector('.file-label').classList.remove('attached');
      document.getElementById('fileName').textContent = '';
      document.querySelector('.preview-container').style.display = 'none';
      return;
  }

  // Show attachment indicator
  document.querySelector('.file-label').classList.add('attached');
  document.getElementById('fileName').textContent = file.name;

  // Handle preview
  document.querySelectorAll('.preview-container > *').forEach(el => el.style.display = 'none');
  const previewContainer = document.querySelector('.preview-container');
  
  if (file.type.startsWith('image/')) {
      const preview = document.getElementById('imagePreview');
      preview.style.display = 'block';
      previewContainer.style.display = 'block';
      preview.src = URL.createObjectURL(file);
  } else if (file.type.startsWith('video/')) {
      const preview = document.getElementById('videoPreview');
      preview.style.display = 'block';
      previewContainer.style.display = 'block';
      preview.src = URL.createObjectURL(file);
  } else if (file.type.startsWith('audio/')) {
      const preview = document.getElementById('audioPreview');
      preview.style.display = 'block';
      previewContainer.style.display = 'block';
      preview.src = URL.createObjectURL(file);
  }
}

async function handleAudioData(msg) {
    if (!appState.audioContext) return;

    if (!msg.format) {
        console.error("No audio format specified");
        return;
    }

    console.log('Received audio data:', {
        format: msg.format,
        dataType: typeof msg.data,
        length: msg.data.length,
        sampleOfData: msg.data.slice(0, 10)
    });

    try {
        let audioBuffer;
        switch (msg.format.codec) {
            case 'mp3':
            case 'wav':
                // Both MP3 and WAV can be decoded the same way
                const audioData = new Uint8Array(msg.data);
                console.log('Audio processing:', {
                    codec: msg.format.codec,
                    uint8Length: audioData.length,
                    uint8Sample: Array.from(audioData.slice(0, 10)),
                    hasBuffer: audioData.buffer ? 'yes' : 'no'
                });
                audioBuffer = await appState.audioContext.decodeAudioData(audioData.buffer);
                break;
            case 'pcm':
                // PCM can be directly loaded into buffer
                audioBuffer = appState.audioContext.createBuffer(
                    1, // mono
                    msg.data.length,
                    msg.format.sampleRate || appState.audioContext.sampleRate
                );
                audioBuffer.getChannelData(0).set(msg.data);
                break;
            default:
                console.error("Unsupported audio format:", msg.format.codec);
                return;
        }

        // Play the audio
        const source = appState.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(appState.audioWorklet);
        source.start(appState.audioContext.currentTime + 0.1);

    } catch (error) {
        console.error("Error processing audio data:", error);
    }
}


async function handleRoleChanged(msg) {
    appState.role = msg.newRole;
    const statusDiv = document.querySelector('.status');
    const roleIcons = {
        'audience': '👁️',
        'performer': '🎭',
        'dramaturg': '📝'
    };
    statusDiv.textContent = `${roleIcons[msg.newRole] || '❓'} ${msg.newRole.charAt(0).toUpperCase() + msg.newRole.slice(1)}`;
}

// start everything when page loads
window.addEventListener('load', initPage);