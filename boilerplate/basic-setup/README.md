WebSocket Notes Demo
A minimal but robust WebSocket client/server example implementing real-time synchronization of notes between multiple clients.
Features

Real-time sync between clients
Consistent message/state handling patterns
Full state sync for new connections
Automatic reconnection handling
Structured logging

Setup

Create the project structure:

Copyyour-project/
  ├── public/
  │   ├── index.html  
  │   └── app.js
  ├── server.js
  └── README.md

Install dependencies:

bashCopynpm init -y
npm install ws

Run the server:

bashCopynode server.js

Open http://localhost:8000 in multiple browser windows to test real-time sync

Message Patterns
The code demonstrates robust WebSocket patterns:
Logging
Consistent log prefixes show message direction:

sv->cl: - Server to specific client
sv->cl*: - Server broadcast to all clients
sv->cls: - Server to all clients except sender
cl->sv: - Client to server

Message Types
Structured message handling with dedicated handlers:

initialize - Send full state to new client
createNote - Create a new note
updateNote - Update note text/color
deleteNote - Delete a note
clientLeft - Notify when client disconnects
