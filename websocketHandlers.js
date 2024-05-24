const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Token } = require('./models');
const CONFIG = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const SECRET_KEY = CONFIG.SECRET_KEY
const wsClientManager = require('./wsClientManager');

module.exports = function(wss) {
    wss.on('connection', ws => {
        console.log('New client connected');

        ws.on('message', async message => {
            try {
                const parsedMessage = JSON.parse(message);
                if (parsedMessage.action === 'auth') {
                    const token = parsedMessage.token;
                    const userId = await verifyToken(token);
                    if (userId) {
                        ws.userId = userId;
                        wsClientManager.addClient(ws)
                        ws.send('{"message":"Authentication successful"}');
                    } else {
                        ws.send('{"error":"Authentication failed"}');
                        ws.close();
                    }
                } else {
                    console.log('Received:', message);
                    ws.send(`Server received: ${message}`);
                }
            } catch (error) {
                console.error('Error while processing message:', error);
                ws.send(`Error while parsing JSON, server received: ${message}`);
            }
        });

        ws.on('close', () => {
            console.log('Client disconnected');
            wsClientManager.removeClient(ws);
        });

        ws.on('error', error => {
            console.error('WebSocket error:', error);
        });
    });
};

const verifyToken = async (token) => {
    const accessToken = token.split(' ')[1];
    if (!accessToken) {
      return null
    }
    try {
      const decoded = jwt.verify(accessToken, SECRET_KEY);
      const tokenRecord = await Token.findOne({ where: { token: accessToken, userId: decoded.id } });
      if (!tokenRecord) {
        return null
      }
      let userId = decoded.id;
      return userId;

    } catch (error) {
        console.error(error)
      return null
    }
  };