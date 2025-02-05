const appState = {
    clientId: null,
    socket: null,
    connected: false,
    notes: {},
    peerConnection: null,
    audioContext: null,
    analyser: null,
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
    
    // Add editable text
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
        role: 'audience'
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
    const fileInput = document.getElementById('attachFile');
    const text = noteInput.value.trim();
    const file = fileInput.files[0];
    
    if (text || file) {
        const feedbackData = {
            type: 'message',
            text: text
        };

        if (file) {
            const fileReader = new FileReader();
            fileReader.onload = function(e) {
                feedbackData.attachment = {
                    type: file.type,
                    name: file.name,
                    data: e.target.result
                };
                sendFeedback(feedbackData);
            };
            fileReader.readAsDataURL(file);
        } else {
            sendFeedback(feedbackData);
        }
        
        // Clear inputs
        noteInput.value = '';
        fileInput.value = '';
        document.getElementById('fileName').textContent = '';
        document.querySelector('.preview-container').style.display = 'none';
    }
};
  
  // Initialize page
function initPage() {
  initializeWebSocket();
  document.getElementById('tuneIn').onclick = handleTuneIn;
  document.getElementById('attachFile').addEventListener('change', handleFileSelect);
}

function handleTuneIn() {    
  if (!appState.audioContext) {
      console.log("cl: tuning in, creating AudioContext")
      appState.audioContext = new AudioContext();
      appState.audioContext.resume();

      appState.audioWorklet = appState.audioContext.createGain();
      appState.analyser = createAudioMeter(appState.audioContext, document.getElementById('broadcast'));
      
      // Chain: audioWorklet -> analyser -> destination
      appState.audioWorklet.connect(appState.analyser);
      appState.analyser.connect(appState.audioContext.destination);
  } else {
      console.log("already tuned in")
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

  // Always expect a format field that specifies the type
  if (!msg.format) {
      console.error("No audio format specified");
      return;
  }

  try {
      let audioBuffer;
      switch (msg.format.codec) {
          case 'mp3':
              // MP3 needs to be decoded
              console.log("cl:audio", {format: msg.format, data: msg.data})
              const mp3Data = new Uint8Array(msg.data);
              audioBuffer = await appState.audioContext.decodeAudioData(mp3Data.buffer);
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

// start everything when page loads
window.addEventListener('load', initPage);