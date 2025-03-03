const http    = require("http");
const ws      = require("ws");
const fs      = require("fs");
const config  = require("./config.json");
const os      = require("os")

const { llm, textToSpeech, configureAI} = require('./ai/providers');
configureAI(config);

const PORT = 8000;
const HOST = '0.0.0.0';

const appState = {
  clients: {},          // Map of clientID to {id, socket, nick, role, position}
  notes: {},            // Map of noteID to {id, text, color}
  dramaturgs: new Set() // Set of dramaturg client IDs
}

function logMsg(prefix, msg, ...rest) { 
  if (msg?.type === 'audio') return;
  console.log(prefix, msg, ...rest);
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
  client.nick = msg.nick || ('👤' + client.id.slice(-4)); // Use provided name or fallback
  
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
                      role: c.role,
                  }])
          )
      }, client);
  } else {
      // Notify all dramaturgs about the new non-dramaturg user
      for (const dramaturgeId of appState.dramaturgs) {
          const dramaturge = appState.clients[dramaturgeId];
          sendMessage({
              type: 'updateUser',
              user: {
                  id: client.id,
                  nick: client.nick,
                  position: client.position,
                  role: client.role
              }
          }, dramaturge);
      }
  }
}

// Broadcast to all clients
function broadcast(msg) {
  logMsg("sv->cl*:", msg, msg.type);
  const msgStr = JSON.stringify(msg);
  for (const client of Object.values(appState.clients)) {
    client.socket.send(msgStr);
  }
}

// Broadcast except to sender?
function broadcastExcept(msg, excludeClient) {
  logMsg("sv->cl*:", msg ,msg.type, excludeClient.nick, );
  const msgStr = JSON.stringify(msg);
  for (const client of Object.values(appState.clients)) {
    if (client.id === excludeClient.id) continue;
    client.socket.send(msgStr);
  }
}

// Send to specific client
function sendMessage(msg, client) {
  logMsg("sv->cl", msg, msg.type, client.nick)
  client.socket.send(JSON.stringify(msg));
}

// ---------------- MESSAGE HANDLERS ----------------
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

function handleAudioData(msg, client) {
  if (client.role !== 'dramaturg') return; // Only relay audio from dramaturgs

  // Broadcast to all non-dramaturg clients
  for (const targetClient of Object.values(appState.clients)) {
      if (targetClient.role == msg.sendToRole) {
          sendMessage({
              type: 'audio',
              data: msg.data,
              format: msg.format,
          }, targetClient);
      }
  }
}

function handleUpdateRole(msg, client) {
    if (client.role !== 'dramaturg') return; // Only dramaturgs can change roles
    
    const targetUser = appState.clients[msg.userId];
    if (!targetUser) return;
    
    targetUser.role = msg.newRole;
    
    // Notify all dramaturgs about the role change
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
    
    // Notify the user about their role change
    sendMessage({
        type: 'roleChanged',
        newRole: msg.newRole
    }, targetUser);
}



async function handleSpeak(msg, client) {
  if (client.role !== 'dramaturg') return; // Only dramaturgs can broadcast TTS
  
  const audioStream = await textToSpeech(msg.text);
  const audioData = await handleStreamData(audioStream);

  for (const targetClient of Object.values(appState.clients)) {
      if (targetClient.role == msg.sendToRole) {
          sendMessage({
              type: 'audio',
              data: audioData.data,
              format: audioData.format,
              text: msg.text,
          }, targetClient);
      }
  }

  // Notify dramaturgs about the direct message
  for (const dramaturgeId of appState.dramaturgs) {
    const dramaturge = appState.clients[dramaturgeId];
    sendMessage({
        type: 'promptResponse',
        prompt: 'Direct to performer',
        response: msg.text,
        sendToRole: msg.sendToRole
    }, dramaturge);
  }
}
// ---------------- END MESSAGE HANDLERS ----------------

// Setup HTTP server (for static files)
const httpServer = http.createServer((req, res) => {
  console.log("cl->sv:http", req.url);
  
  const basePath = "./public" + req.url;
  if (req.url === '/') {
    fs.readFile('./public/audience.html', (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading audience.html');
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
    nick: clientNick,
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
              position: client.position,
              role: client.role,
          }
      }, dramaturge);
  }

  // Handle messages
  socket.on('message', (data) => {
    const msg = JSON.parse(data);
    logMsg("cl->sv:ws:msg", msg, client.nick)

    const handlers = {
      createNote: handleCreateNote,
      updateNote: handleUpdateNote,
      deleteNote: handleDeleteNote,
      identify: handleIdentify,
      sendFeedback: handleSendFeedback,
      updateUserPosition: handleUpdateUserPosition,
      updateRole: handleUpdateRole,
      speak: handleSpeak,
      audio: handleAudioData,
      prompt: handlePrompt,
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

async function handleStreamData(audioResponse) {
  const chunks = [];
  let totalLength = 0;
  
  // Read all chunks from the stream
  const reader = audioResponse.stream.reader;
  while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
  }
  
  // Combine all chunks into a single Uint8Array
  const combinedArray = new Uint8Array(totalLength);
  console.log("sv:stream", reader, "combinedArray", combinedArray, "length", totalLength)
  let offset = 0;
  for (const chunk of chunks) {
      combinedArray.set(chunk, offset);
      offset += chunk.length;
  }
  
  const streamData = {
      data:  Array.from(combinedArray), // convert to regular array from Uint8Array
      format: audioResponse.format
  };
  console.log("sv:streamData", streamData);
  return streamData;
}

async function handlePrompt(msg, client) {
  if (client.role !== 'dramaturg') return; // Only dramaturgs can broadcast TTS
  
  const aiResponse = await llm(msg.text);
  const audioStream = await textToSpeech(aiResponse);
  const audioData = await handleStreamData(audioStream);
  
  for (const targetClient of Object.values(appState.clients)) {
      if (targetClient.role == msg.sendToRole) {
          sendMessage({
              type: 'audio',
              data: audioData.data,
              format: audioData.format,
              text: aiResponse,
          }, targetClient);
      }
  }

  // tell the dramaturgs what happened
  for (const dramaturgeId of appState.dramaturgs) {
    const dramaturge = appState.clients[dramaturgeId];
    sendMessage({
        type: 'promptResponse',
        prompt: msg.text,
        response: aiResponse,
        sendToRole: msg.sendToRole
    }, dramaturge);
  }
}

// Start server
httpServer.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
  console.log(`Dramaturg running at http://${HOST}:${PORT}/dramaturg.html`);
  console.log('\nNetwork access:');
  const interfaces = os.networkInterfaces();
  Object.entries(interfaces).forEach(([name, nets]) => {
      nets.forEach((net) => {
          if (net.family === 'IPv4' && !net.internal) {
              console.log(`\nInterface ${name}:`);
              console.log(`Participant: http://${net.address}:${PORT}/`);
              console.log(`Dramaturg: http://${net.address}:${PORT}/dramaturg.html`);
          }
      });
  });
});
