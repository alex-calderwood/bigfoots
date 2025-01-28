// App state
const appState = {
    clientId: null,
    socket: null,
    connected: false,
    notes: {} // Mirror of server notes state
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
  
  // Message Handlers
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
  
  function handleClientLeft(msg) {
    console.log("Client left:", msg.clientId);
  }
  
  // UI Functions
  function refreshNote(note) {
    let noteEl = document.getElementById(note.id);
    
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.id = note.id;
      noteEl.className = 'note';
      document.getElementById('notes').appendChild(noteEl);
      
      // Add delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.innerText = '×';
      deleteBtn.onclick = () => {
        sendMessage({
          type: 'deleteNote',
          noteId: note.id
        });
      };
      noteEl.appendChild(deleteBtn);
      
      // Add editable text
      const textEl = document.createElement('div');
      textEl.contentEditable = true;
      textEl.onblur = () => {
        sendMessage({
          type: 'updateNote',
          noteId: note.id,
          text: textEl.innerText
        });
      };
      noteEl.appendChild(textEl);
    }
    
    noteEl.style.backgroundColor = note.color;
    noteEl.querySelector('[contenteditable]').innerText = note.text;
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
    });
  
    appState.socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      console.log("sv->cl:" + msg.type, msg);
  
      const handlers = {
        initialize: handleInitialize,
        updateNote: handleUpdateNote,
        deleteNote: handleDeleteNote,
        clientLeft: handleClientLeft
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
  
  // Initialize page
  function initPage() {
    initializeWebSocket();
  
    // Wire up "New Note" button
    document.getElementById('newNote').onclick = () => {
      const colors = ['#ffc', '#cfc', '#ccf', '#fcf', '#fcc'];
      sendMessage({
        type: 'createNote',
        text: 'New note',
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    };
  }
  
  // Start everything when page loads
  window.addEventListener('load', initPage);