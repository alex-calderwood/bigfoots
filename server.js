const http = require("http");
const ws = require("ws");
const fs = require("fs");

// Config
const PORT = 8000;
const HOST = 'localhost';

// Add to appState:
const appState = {
  clients: {}, // Map of clientID to {id, socket, nick, role, position}
  notes: {},   // Map of noteID to {id, text, color}
  dramaturgs: new Set() // Set of dramaturg client IDs
}

function handleUpdateUserPosition(msg, client) {
  const targetUser = appState.clients[msg.userId];
  if (!targetUser) return;
  
  targetUser.position = msg.position;
  
  // Send complete user state to dramaturgs
  for (const dramaturgeId of appState.dramaturgs) {
      const dramaturge = appState.clients[dramaturgeId];
      sendMessage({
          type: 'updateUser',
          user: {
              id: targetUser.id,
              nick: targetUser.nick,
              position: targetUser.position,
              feedbacks: targetUser.feedbacks,
              role: targetUser.role,
          }
      }, dramaturge);
  }
}

function handleIdentify(msg, client) {
  client.role = msg.role;
  if (msg.role === 'dramaturg') {
      appState.dramaturgs.add(client.id);
      
      // Send full user list to new dramaturg
      sendMessage({
          type: 'initialize',
          clientId: client.id,
          users: Object.fromEntries(
              Object.entries(appState.clients)
                  .filter(([id, c]) => c.role !== 'dramaturg')
                  .map(([id, c]) => [id, {
                      id: c.id,
                      nick: c.nick,
                      position: c.position,
                      feedbacks: c.feedbacks,
                  }])
          )
      }, client);
  } else if (msg.role === 'audience') {
    appState
  }
}

// Broadcast to all clients
function broadcast(msg) {
  console.log("sv->cl*:" + msg.type, msg);
  const msgStr = JSON.stringify(msg);
  for (const client of Object.values(appState.clients)) {
    client.socket.send(msgStr);
  }
}

// Broadcast except to sender
function broadcastExcept(msg, excludeClient) {
  console.log("sv->cls:" + msg.type, excludeClient.nick, msg);
  const msgStr = JSON.stringify(msg);
  for (const client of Object.values(appState.clients)) {
    if (client.id === excludeClient.id) continue;
    client.socket.send(msgStr);
  }
}

// Send to specific client
function sendMessage(msg, client) {
  console.log("sv->cl:" + msg.type, client.nick, msg);
  client.socket.send(JSON.stringify(msg));
}



// MESSAGE HANDLERS MESSAGE HANDLERS MESSAGE HANDLERS MESSAGE HANDLERS 
function handleCreateNote(msg, client) {
  const noteId = 'note-' + Math.random().toString(36).substr(2, 9);
  appState.notes[noteId] = {
    id: noteId,
    text: msg.text,
  };
  broadcast({
    type: 'updateNote',
    note: appState.notes[noteId]
  });
}

function handleSendFeedback(msg, client) {
  if (!client.feedbacks) client.feedbacks = [];
  client.feedbacks.push(msg.feedback);
  
  for (const dramaturgeId of appState.dramaturgs) {
      sendMessage({
          type: 'userFeedback',
          userId: client.id,
          feedback: msg.feedback
      }, appState.clients[dramaturgeId]);
  }
}

function handleUpdateNote(msg, client) {
  const note = appState.notes[msg.noteId];
  if (!note) return;
  
  if (msg.text) note.text = msg.text;
  if (msg.color) note.color = msg.color;
  
  broadcast({
    type: 'updateNote',
    note: note
  });
}

function handleDeleteNote(msg, client) {
  delete appState.notes[msg.noteId];
  broadcast({
    type: 'deleteNote',
    noteId: msg.noteId
  });
}
// END MESSAGE HANDLERS END MESSAGE HANDLERS END MESSAGE HANDLERS END MESSAGE HANDLERS 


// Setup HTTP server (for static files)
const httpServer = http.createServer((req, res) => {
  console.log("cl->sv:http", req.url);
  
  const basePath = "./public" + req.url;
  if (req.url === '/') {
    fs.readFile('./public/index.html', (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200);
      res.end(data);
    });
    return;
  }

  fs.readFile(basePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
    res.writeHead(200);
    res.end(data);
  });
});

// Setup WebSocket server
const wss = new ws.WebSocketServer({ server: httpServer });

wss.on('connection', (socket) => {
  // Setup new client
  const clientId = 'client-' + Math.random().toString(36).substr(2, 9);
  const clientNick = '👤' + clientId.slice(-4);
  const client = {
    id: clientId,
    socket: socket,
    nick: clientNick
  };
  appState.clients[clientId] = client;
  
  console.log("cl->sv:ws:connect", client.nick);

  // Send initial state
  sendMessage({
    type: 'initialize',
    clientId: clientId,
    notes: appState.notes
  }, client);

  // Notify dramaturgs of new user
  for (const dramaturgeId of appState.dramaturgs) {
      const dramaturge = appState.clients[dramaturgeId];
      sendMessage({
          type: 'updateUser',
          user: {
              id: client.id,
              nick: client.nick,
              position: client.position
          }
      }, dramaturge);
  }

  // Handle messages
  socket.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log("cl->sv:ws:msg", client.nick, msg);

    const handlers = {
      createNote: handleCreateNote,
      updateNote: handleUpdateNote,
      deleteNote: handleDeleteNote,
      identify: handleIdentify,
      sendFeedback: handleSendFeedback,
      updateUserPosition: handleUpdateUserPosition,
    };

    const handler = handlers[msg.type];
    if (!handler) {
      console.error("cl->sv:ws:nohandler", client.nick, msg);
      return;
    }
    handler(msg, client);
  });

  // client disconnects
  socket.on('close', () => {
        console.log("cl->sv:ws:close", client.nick);
        
        // Notify dramaturgs if a regular user disconnected
        if (client.role !== 'dramaturg') {
            for (const dramaturgeId of appState.dramaturgs) {
                const dramaturge = appState.clients[dramaturgeId];
                sendMessage({
                    type: 'deleteUser',
                    userId: client.id
                }, dramaturge);
            }
        }
        
        // Clean up
        if (client.role === 'dramaturg') {
            appState.dramaturgs.delete(client.id);
        }
        delete appState.clients[client.id];
        
        broadcast({
            type: 'clientLeft',
            clientId: client.id
        });
    });
});

// Start server
httpServer.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});