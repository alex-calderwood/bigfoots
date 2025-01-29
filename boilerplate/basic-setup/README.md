# WebSocket Demo

A minimal WebSocket client/server example implementing real-time synchronization of notes between multiple clients.

Real-time sync between clients
Consistent message/state handling patterns
Full state sync for new connections
Automatic reconnection handling
Structured logging

## Setup

Obtain a copy of this repo. [Instructions](https://zapier.com/blog/how-to-download-from-github/).

### Install dependencies:

    npm init -y
    npm install ws

If you get an error about npm not being found, you may need to [install Node](https://nodejs.org/en/download).

### Run the server:

     node server.js

Open http://localhost:8000 in multiple windows to test real-time sync between clients

## Message Patterns

The code demonstrates robust WebSocket patterns:
Logging
Consistent log prefixes show message direction:

sv->cl: - Server to specific client
sv->cl*: - Server broadcast to all clients
sv->cls: - Server to all clients except sender
cl->sv: - Client to server

## Message Types

Structured message handling with dedicated handlers:

initialize - Send full state to new client
createNote - Create a new note
updateNote - Update note text/color
deleteNote - Delete a note
clientLeft - Notify when client disconnects
