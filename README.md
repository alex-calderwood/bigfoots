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

  npm init -y
  npm install ws

Run the server:

    node server.js

Open http://localhost:8000 in multiple browser windows to test real-time sync